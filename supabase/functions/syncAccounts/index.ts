import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, pairSpreads } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const { data: accounts, error } = await admin.from("trading_accounts").select("*").eq("user_id", user.id);
    if (error) throw new Error(error.message);

    // This function reads the accounts itself rather than going through
    // loadAccount, so it has to decrypt the stored credentials the same way.
    const results = await Promise.all(
      (accounts || []).map(async (a) =>
        syncOne({
          ...a,
          api_key: await decryptSecret(a.api_key),
          api_secret: await decryptSecret(a.api_secret),
          oauth_access_token: await decryptSecret(a.oauth_access_token)
        })
      )
    );
    return jsonResponse({ accounts: results, syncedAt: new Date().toISOString() });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});

async function syncOne(account) {
  const base = tradingBase(account);
  const empty = { credit: 0, risk: 0, closeCost: 0, pl: 0, expirationPL: 0 };
  try {
    const [info, positions, activities, openOrders, filledOrders] = await Promise.all([
      alpacaFetch(`${base}/account`, account),
      alpacaFetch(`${base}/positions`, account),
      alpacaFetch(`${base}/account/activities/FILL?page_size=100`, account).catch(() => []),
      alpacaFetch(`${base}/orders?status=open&nested=true&limit=100`, account).catch(() => []),
      alpacaFetch(`${base}/orders?status=closed&nested=true&limit=200&direction=desc`, account).catch(() => [])
    ]);

    const openList = Array.isArray(openOrders) ? openOrders : [];
    const orderSymbols = (o: any) => (Array.isArray(o.legs) && o.legs.length ? o.legs.map((l: any) => l.symbol) : [o.symbol]);

    // Provenance: legs opened by the same multi-leg order form one structure.
    const spreads = pairSpreads(
      Array.isArray(positions) ? positions : [],
      Array.isArray(activities) ? activities : [],
      (Array.isArray(filledOrders) ? filledOrders : []).filter((o) => o.status === 'filled')
    );

    const tickers = [...new Set(spreads.map((s: any) => s.ticker))];
    const prices = {};
    if (tickers.length > 0) {
      const snap = await alpacaFetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${tickers.join(",")}`, account)
        .catch((e) => {
          console.error("snapshots fetch failed", account.id, tickers.join(","), e?.message || e);
          return null;
        });
      if (snap) console.log("snapshots response", account.id, JSON.stringify(snap).slice(0, 1000));
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
      // Expiration scenario: what the spread would settle for if it expired right
      // now at the current stock price — intrinsic value only, no time premium.
      const clamp = (v, cap) => Math.min(Math.max(v, 0), cap);
      let intrinsic = 0;
      if (stockPrice > 0) {
        if (!isCall) {
          intrinsic += clamp(s.shortStrike - stockPrice, s.shortStrike - s.longStrike) * putRatio;
        }
        if (isCondor) {
          intrinsic += clamp(stockPrice - s.callShortStrike, s.callLongStrike - s.callShortStrike) * callRatio;
        } else if (isCall) {
          intrinsic += clamp(stockPrice - s.shortStrike, s.longStrike - s.shortStrike);
        }
      }
      const expirationCost = intrinsic * s.qty * 100;
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
        // Per-side worst case (used for directional condor aggregation).
        putSideRisk: (putWidth - netCredit) * s.qty * 100,
        callSideRisk: (callWidth - netCredit) * s.qty * 100,
        netCredit,
        totalCredit,
        maxRisk,
        breakEven: isCall ? s.shortStrike + netCredit : s.shortStrike - netCredit / putRatio,
        breakEvenHigh: isCondor ? s.callShortStrike + netCredit / callRatio : null,
        closeCost,
        unrealizedPL: totalCredit - closeCost,
        expirationCost,
        expirationPL: stockPrice > 0 ? totalCredit - expirationCost : null,
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
        risk: acc.risk,
        closeCost: acc.closeCost + r.closeCost,
        pl: acc.pl + r.unrealizedPL,
        expirationPL: acc.expirationPL + (r.expirationPL || 0)
      }),
      { ...empty }
    );

    // Total max risk: 2-leg spreads sum (a whipsaw can hit both), but iron
    // condors on the same ticker can only lose on ONE side at expiration, so
    // each ticker contributes max(put-side, call-side) of its condors.
    let nonCondorRisk = 0;
    const condorByTicker = {};
    rows.forEach((r) => {
      if (r.type === 'iron_condor') {
        const t = (condorByTicker[r.ticker] = condorByTicker[r.ticker] || { putSide: 0, callSide: 0 });
        t.putSide += r.putSideRisk;
        t.callSide += r.callSideRisk;
      } else {
        nonCondorRisk += r.maxRisk;
      }
    });
    totals.risk = nonCondorRisk + Object.values(condorByTicker)
      .reduce((a, t) => a + Math.max(t.putSide, t.callSide), 0);

    const equity = info ? parseFloat(info.equity) : 0;
    return {
      id: account.id,
      name: account.name,
      type: account.is_paper ? "Paper" : "Live",
      ok: true,
      equity,
      // Equity if the market froze now, time value vanished and every spread
      // settled at intrinsic value: swap mark-to-market P/L for expiration P/L.
      equityAtExp: equity - totals.pl + totals.expirationPL,
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
