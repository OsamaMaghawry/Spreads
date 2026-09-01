import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, pairSpreads, getOptionQuotes } from "../_shared/alpaca.ts";
import { getSpots } from "../_shared/marketPrice.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { parseOCCSymbol } from "../_shared/occ.ts";

// Rebuilds the live picture for every account the caller owns: positions paired
// into structures, credit and risk per position, and totals that net a ticker's
// condors instead of double counting both wings.
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

    // Orders as their own view, grouped the way they were sent.
    //
    // The per-spread openOrders below answers "is something holding these
    // contracts?" and drops everything else. An orders screen needs the whole
    // order: its legs, what filled of each, and the ones that ended today --
    // a rejection or a half-filled close is exactly what a trader needs to see,
    // and until now it was visible only in the dialog that placed it, until
    // that dialog was closed.
    //
    // Working plus today's finished orders, not the full history: anything
    // older belongs to Trade History, which reconstructs from the activity
    // feed rather than the order feed.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endedToday = (o: any) => {
      const at = o.filled_at || o.canceled_at || o.expired_at || o.updated_at;
      return at ? new Date(at) >= startOfToday : false;
    };
    const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));

    const orderView = (o: any) => {
      const legs = (Array.isArray(o.legs) && o.legs.length ? o.legs : [o]).map((l: any) => ({
        id: l.id,
        symbol: l.symbol,
        side: l.side,
        // positionIntent distinguishes an opening leg from a closing one, which
        // side alone cannot: buy_to_close and buy_to_open are both "buy".
        intent: l.position_intent || null,
        qty: num(l.qty),
        filledQty: num(l.filled_qty) || 0,
        filledAvgPrice: num(l.filled_avg_price),
        status: l.status
      }));
      const totalQty = legs.reduce((a: number, l: any) => a + (l.qty || 0), 0);
      const filledQty = legs.reduce((a: number, l: any) => a + (l.filledQty || 0), 0);
      return {
        id: o.id,
        clientOrderId: o.client_order_id || null,
        status: o.status,
        type: o.type,
        side: o.side,
        timeInForce: o.time_in_force,
        qty: num(o.qty),
        filledQty: num(o.filled_qty) || 0,
        limitPrice: num(o.limit_price),
        filledAvgPrice: num(o.filled_avg_price),
        submittedAt: o.submitted_at,
        // Whichever terminal timestamp the order actually has; null while working.
        endedAt: o.filled_at || o.canceled_at || o.expired_at || null,
        // Alpaca reports a refusal here rather than as an HTTP error.
        rejectReason: o.reject_reason || null,
        // Underlying ticker, read off the OCC symbol so a multi-leg order is
        // labelled even before it fills.
        ticker: parseOCCSymbol(legs[0]?.symbol || "")?.ticker || legs[0]?.symbol || null,
        legs,
        // The fraction actually done, so a partial reads as a partial rather
        // than as "working" -- the state that used to be invisible until it had
        // already opened a position the other way.
        progress: totalQty > 0 ? filledQty / totalQty : 0
      };
    };

    const orders = [
      ...openList.map(orderView),
      ...(Array.isArray(filledOrders) ? filledOrders : []).filter(endedToday).map(orderView)
    ].sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

    // Provenance: legs opened by the same multi-leg order form one structure.
    const spreads = pairSpreads(
      Array.isArray(positions) ? positions : [],
      Array.isArray(activities) ? activities : [],
      (Array.isArray(filledOrders) ? filledOrders : []).filter((o) => o.status === 'filled')
    );

    const tickers = [...new Set(spreads.map((s: any) => s.ticker))];
    // The same helper the scanner uses. These were separate implementations
    // with opposite field priorities, so the dashboard and the trade dialog
    // could show a $9 difference for one stock at one moment.
    const spots = await getSpots(account, tickers);

    // Every option leg across every position, priced in one request. Marking
    // each leg from the broker's stale per-position price and subtracting is
    // what produced an $85 loss on a spread that was near break-even.
    const legQuotes = await getOptionQuotes(
      account,
      spreads.flatMap((s: any) => [s.shortSymbol, s.longSymbol, s.callShortSymbol, s.callLongSymbol])
    ).catch((e) => {
      console.error("option quotes fetch failed", account.id, e?.message || e);
      return {};
    });
    const midOf = (sym: string) => {
      const q = sym ? legQuotes[sym] : null;
      return q && q.ap > 0 && q.bp >= 0 && q.ap >= q.bp ? (q.bp + q.ap) / 2 : null;
    };

    const rows = spreads.map((s: any) => {
      const stockPrice = spots[s.ticker]?.price || 0;
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
      // Cost to close, from live NBBO mids across every leg at one instant.
      // Signs follow the position: a short leg is bought back, a long leg sold.
      const legs = [
        { sym: s.shortSymbol, sign: 1, ratio: isCondor ? putRatio : 1 },
        { sym: s.longSymbol, sign: -1, ratio: isCondor ? putRatio : 1 },
        { sym: s.callShortSymbol, sign: 1, ratio: callRatio },
        { sym: s.callLongSymbol, sign: -1, ratio: callRatio }
      ].filter((l) => l.sym);
      const mids = legs.map((l) => ({ ...l, mid: midOf(l.sym) }));
      const quoted = mids.length > 0 && mids.every((l) => l.mid !== null);

      // A defined-risk spread cannot be worth less than nothing or more than
      // its width. Bounding here bounds unrealized P/L to
      // [-maxRisk, +totalCredit], so an impossible figure is unreachable
      // rather than merely unlikely.
      const clamp = (v, cap) => Math.min(Math.max(v, 0), cap);
      const rawCost = quoted
        ? mids.reduce((a, l) => a + l.sign * l.ratio * l.mid, 0)
        : s.shortCurrentPrice - s.longCurrentPrice;
      const closeCost = clamp(rawCost, putWidth + callWidth) * s.qty * 100;
      // Expiration scenario: what the spread would settle for if it expired right
      // now at the current stock price — intrinsic value only, no time premium.
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
      const isAdjusted = mySymbols.some((sym) => parseOCCSymbol(sym)?.adjusted);
      return {
        ...s,
        stockPrice,
        // So a figure that cannot be trusted never looks like one that can.
        // Substituting a bad number silently is how the -$85 was presented as
        // fact in the first place.
        priceSource: quoted ? "quote" : "broker",
        spotSource: spots[s.ticker]?.source || null,
        spotTrusted: spots[s.ticker]?.trusted ?? false,
        // Null when there is no price to judge against, rather than "OTM".
        //
        // `stockPrice > 0 && itm ? "ITM" : "OTM"` reads as a ternary on
        // moneyness and is really a ternary on whether a quote arrived: with
        // no price it returns "OTM" deterministically, whatever the underlying
        // is doing, and the interface paints that green. An adjusted contract
        // has no such underlying to quote -- there is no stock called AAPL1 --
        // so every one of them would show a green out-of-the-money chip while
        // sitting through the strike. A quote outage does the same to ordinary
        // positions.
        moneyness: !(stockPrice > 0) ? null : itm ? "ITM" : "OTM",
        // A corporate action changed what this contract delivers, so the
        // width, the risk and the break-even are all computed from a
        // deliverable it no longer has. Withheld rather than shown wrong.
        adjusted: isAdjusted,
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
      orders,
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
      spreads: [], orders: [], totals: { ...empty }, riskPct: 0, plPct: 0
    };
  }
}
