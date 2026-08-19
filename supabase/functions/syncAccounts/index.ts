import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, pairSpreads } from "../_shared/alpaca.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const { data: accounts, error } = await admin.from("trading_accounts").select("*").eq("user_id", user.id);
    if (error) throw new Error(error.message);

    const results = await Promise.all((accounts || []).map((a) => syncOne(a)));
    return jsonResponse({ accounts: results, syncedAt: new Date().toISOString() });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});

async function syncOne(account) {
  const base = tradingBase(account);
  const empty = { credit: 0, risk: 0, closeCost: 0, pl: 0 };
  try {
    const [info, positions, activities, openOrders] = await Promise.all([
      alpacaFetch(`${base}/account`, account),
      alpacaFetch(`${base}/positions`, account),
      alpacaFetch(`${base}/account/activities/FILL?page_size=100`, account).catch(() => []),
      alpacaFetch(`${base}/orders?status=open&nested=true&limit=100`, account).catch(() => [])
    ]);

    const openList = Array.isArray(openOrders) ? openOrders : [];
    const orderSymbols = (o: any) => (Array.isArray(o.legs) && o.legs.length ? o.legs.map((l: any) => l.symbol) : [o.symbol]);

    const spreads = pairSpreads(Array.isArray(positions) ? positions : [], Array.isArray(activities) ? activities : []);

    const tickers = [...new Set(spreads.map((s: any) => s.ticker))];
    const prices = {};
    if (tickers.length > 0) {
      const snap = await alpacaFetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${tickers.join(",")}`, account).catch(() => null);
      tickers.forEach((t: any) => {
        const d = snap ? snap[t] : null;
        prices[t] = (d && d.latestTrade && d.latestTrade.p) || (d && d.dailyBar && d.dailyBar.c) || 0;
      });
    }

    const rows = spreads.map((s: any) => {
      const stockPrice = prices[s.ticker] || 0;
      const isCondor = s.type === "iron_condor";
      const isCall = s.type === "call_spread";
      const putRatio = s.putRatio || 1;
      const callRatio = s.callRatio || 1;
      // Widths are per condor unit: ratio × strike width per side.
      const putWidth = isCall ? 0 : (s.shortStrike - s.longStrike) * putRatio;
      const callWidth = isCondor ? (s.callLongStrike - s.callShortStrike) * callRatio : isCall ? s.longStrike - s.shortStrike : 0;
      const spreadWidth = Math.max(putWidth, callWidth);
      const netCredit = s.shortEntryPrice - s.longEntryPrice;
      const totalCredit = netCredit * s.qty * 100;
      const maxRisk = (spreadWidth - netCredit) * s.qty * 100;
      const closeCost = (s.shortCurrentPrice - s.longCurrentPrice) * s.qty * 100;
      const itm = isCondor
        ? stockPrice < s.shortStrike || stockPrice > s.callShortStrike
        : isCall
          ? stockPrice > s.shortStrike
          : stockPrice < s.shortStrike;
      const mySymbols = [s.shortSymbol, s.longSymbol, s.callShortSymbol, s.callLongSymbol].filter(Boolean);
      return {
        ...s,
        stockPrice,
        moneyness: stockPrice > 0 && itm ? "ITM" : "OTM",
        spreadWidth,
        netCredit,
        totalCredit,
        maxRisk,
        breakEven: isCall ? s.shortStrike + netCredit : s.shortStrike - netCredit / putRatio,
        breakEvenHigh: isCondor ? s.callShortStrike + netCredit / callRatio : null,
        closeCost,
        unrealizedPL: totalCredit - closeCost,
        openOrders: openList
          .filter((o: any) => orderSymbols(o).some((sym: string) => mySymbols.includes(sym)))
          .map((o: any) => ({
            id: o.id,
            type: o.type,
            qty: o.qty,
            limitPrice: o.limit_price,
            status: o.status,
            submittedAt: o.submitted_at
          }))
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        credit: acc.credit + r.totalCredit,
        risk: acc.risk + r.maxRisk,
        closeCost: acc.closeCost + r.closeCost,
        pl: acc.pl + r.unrealizedPL
      }),
      { ...empty }
    );

    const equity = info ? parseFloat(info.equity) : 0;
    return {
      id: account.id,
      name: account.name,
      type: account.is_paper ? "Paper" : "Live",
      ok: true,
      equity,
      cash: info ? parseFloat(info.cash) : 0,
      buyingPower: info ? parseFloat(info.buying_power) : 0,
      optionsBuyingPower: info ? parseFloat(info.options_buying_power || info.buying_power) : 0,
      spreads: rows,
      totals,
      riskPct: equity > 0 ? totals.risk / equity : 0,
      plPct: equity > 0 ? totals.pl / equity : 0
    };
  } catch (e) {
    return {
      id: account.id,
      name: account.name,
      type: account.is_paper ? "Paper" : "Live",
      ok: false,
      error: e.message,
      equity: 0, cash: 0, buyingPower: 0, optionsBuyingPower: 0,
      spreads: [], totals: { ...empty }, riskPct: 0, plPct: 0
    };
  }
}
