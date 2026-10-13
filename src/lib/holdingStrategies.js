// Strategies built on shares already held, from one read of the option chain.
//
// The owner: "I want to build the Collar strategy ... apply it on my holding"
// and "how we can build stock repair strategy". Both start from a holding of
// 100 shares or more and end on the ordinary ticket (collarSetup and
// spreadSetup in optionChain.js); these functions only choose strikes to
// offer. Nothing here sends anything, and every candidate is priced at the
// chain's midpoints, which the ticket then lets the trader change.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const r2 = (v) => Math.round(v * 100) / 100;
const mid = (row) => num(row?.mid);

/**
 * Which of the two a share row offers. Both need a round lot held long:
 * the options are written per 100 shares. Repair only below cost, where there
 * is a loss to work back from.
 */
export function holdingActions(s) {
  const held = Number(s?.shareQty ?? s?.qty) || 0;
  if (!s?.shares || held < 100) return { protect: false, repair: false };
  const price = num(s.stockPrice) ?? num(s.longCurrentPrice);
  const basis = num(s.shareBasis);
  return { protect: true, repair: price !== null && basis !== null && price < basis };
}

/**
 * The listed expiry nearest `days` out from `today` (YYYY-MM-DD strings), never
 * one already past. Both finders open there: about six weeks is where a
 * collar's put is not yet all time value and a repair's calls still pay.
 */
export function expiryNear(expiries, today, days = 45) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const live = (Array.isArray(expiries) ? expiries : []).filter((d) => d >= today);
  if (!live.length || !Number.isFinite(t)) return live[0] || null;
  const dte = (d) => (Date.parse(`${d}T00:00:00Z`) - t) / 86400000;
  return live.reduce((best, d) => (Math.abs(dte(d) - days) < Math.abs(dte(best) - days) ? d : best));
}

/**
 * The put for a floor `protect` below the price: the highest strike at or
 * below `spot * (1 - protect)` with a two-sided market -- as close to the
 * floor asked for as the listed strikes allow, never closer to the money.
 */
export function floorPut(ladder, spot, protect) {
  const s = num(spot);
  const p = num(protect);
  if (!s || !(s > 0) || p === null || p < 0 || p >= 1) return null;
  const target = s * (1 - p);
  return (Array.isArray(ladder) ? ladder : [])
    .map((r) => r.put)
    .filter((r) => r && mid(r) !== null && Number(r.strike) <= target)
    .sort((a, b) => Number(b.strike) - Number(a.strike))[0] || null;
}

/**
 * Collar candidates for a protection level.
 *
 * The put is the highest strike at or below `spot * (1 - protect)` with a
 * two-sided market: as close to the floor asked for as the listed strikes
 * allow, never closer to the money than asked. Then the calls above the price,
 * each with its net (call in, put out, positive a credit). The ZERO-COST call
 * is the highest strike that still pays for the put: the most upside left for
 * no money. Five calls are offered around it, so a trader can give up a little
 * upside for a credit or keep more for a small debit.
 */
export function collarCandidates(ladder, spot, protect) {
  const s = num(spot);
  const p = num(protect);
  if (!s || !(s > 0) || p === null || p < 0 || p >= 1) return { put: null, calls: [], reason: "No price to measure the floor from." };
  const target = s * (1 - p);
  const rows = Array.isArray(ladder) ? ladder : [];
  const put = floorPut(rows, s, p);
  if (!put) return { put: null, calls: [], target: r2(target), reason: `No put with a market at or below ${r2(target)} on this expiry.` };

  const all = rows
    .map((r) => r.call)
    .filter((r) => r && mid(r) !== null && Number(r.strike) > s)
    .sort((a, b) => Number(a.strike) - Number(b.strike))
    .map((row) => ({
      row,
      strike: Number(row.strike),
      net: r2(mid(row) - mid(put)),
      capPct: (Number(row.strike) - s) / s
    }));
  let zero = -1;
  all.forEach((c, i) => { if (c.net >= 0) zero = i; });
  const from = zero < 0 ? 0 : Math.max(0, zero - 2);
  const calls = all.slice(from, from + 5);
  return {
    put,
    target: r2(target),
    calls,
    zeroCostStrike: zero < 0 ? null : all[zero].strike,
    reason: zero < 0 ? "No call above the price pays for this put on this expiry: each of these costs money." : null
  };
}

/**
 * The shares plus a 1x2 call ratio, at expiry, per share.
 *
 *   below the long strike   (s - basis) + net
 *   between the strikes     2s - basis - long + net
 *   above the short strike  2 x short - basis - long + net   (flat: the cap)
 *
 * `breakEven` is where that crosses zero; null when the cap itself is below
 * zero, i.e. the repair narrows the loss but cannot close it.
 */
export function repairOutcome({ basis, spot, longStrike, shortStrike, net, floor = null }) {
  const B = num(basis);
  const K1 = num(longStrike);
  const K2 = num(shortStrike);
  const F = num(floor);
  const n = num(net) ?? 0;
  if (B === null || K1 === null || K2 === null || !(K2 > K1)) return null;
  if (F !== null && F > K1) return null;
  const cap = 2 * K2 - B - K1 + n;
  // With a put bought (a protected repair), nothing below the floor gets worse:
  // the put pays a dollar for every dollar the shares lose under it.
  const worst = F === null ? null : F - B + n;
  let breakEven = null;
  if (worst !== null && worst >= 0) breakEven = null;
  else if (B - n <= K1) breakEven = B - n;
  else if ((B + K1 - n) / 2 <= K2) breakEven = (B + K1 - n) / 2;
  const s = num(spot);
  return {
    breakEven: breakEven === null ? null : r2(breakEven),
    capPerShare: r2(cap),
    worstPerShare: worst === null ? null : r2(worst),
    // How much of the way from today's price back to the basis the repair
    // removes from what the stock has to do to break even.
    recovered: breakEven !== null && s !== null && B > s ? (B - breakEven) / (B - s) : null
  };
}

/**
 * The shares plus a 1x2 at one price at expiry, per share, against the basis
 * -- and the shares alone beside it, so the two can be read together.
 *
 * The owner, on a column that showed only the best case: "what about expiry
 * came at 95, 90 or even 85; what happens then? Repair doesn't protect." It
 * does not. Below the long strike both calls expire worthless and the repair
 * adds exactly its net to whatever the shares have lost; this is what puts
 * that on screen.
 */
export function repairPLAt({ basis, longStrike, shortStrike, net, floor = null }, price) {
  const B = num(basis);
  const K1 = num(longStrike);
  const K2 = num(shortStrike);
  const F = num(floor);
  const S = num(price);
  if (B === null || K1 === null || K2 === null || S === null) return null;
  const n = num(net) ?? 0;
  const sharesAlone = S - B;
  const options = Math.max(0, S - K1) - 2 * Math.max(0, S - K2) + (F === null ? 0 : Math.max(0, F - S)) + n;
  return { withRepair: r2(sharesAlone + options), sharesAlone: r2(sharesAlone) };
}

/**
 * Stock repair candidates: buy the call nearest the price, sell two at each
 * listed strike above it up to the basis, and at the next two above the basis.
 *
 * The textbook short strike is about half way back to the basis, which on a
 * small loss leaves one strike or none to choose from. Above the basis the
 * trade is the same 1x2: it gives up less of the upside, for less premium.
 */
export function repairCandidates(ladder, spot, basis, put = null) {
  const s = num(spot);
  const B = num(basis);
  if (!s || !(s > 0)) return { long: null, shorts: [], reason: "No price to build a repair from." };
  if (B === null || !(B > s)) return { long: null, shorts: [], reason: "These shares are not below their cost, so there is nothing to repair." };
  const calls = (Array.isArray(ladder) ? ladder : [])
    .map((r) => r.call)
    .filter((r) => r && mid(r) !== null)
    .sort((a, b) => Number(a.strike) - Number(b.strike));
  const long = calls.reduce((best, r) =>
    best === null || Math.abs(Number(r.strike) - s) < Math.abs(Number(best.strike) - s) ? r : best, null);
  if (!long) return { long: null, shorts: [], reason: "No call with a market on this expiry." };

  const above = calls.filter((r) => Number(r.strike) > Number(long.strike));
  const within = above.filter((r) => Number(r.strike) <= B);
  const shorts = [...within, ...above.filter((r) => Number(r.strike) > B).slice(0, 2)]
    .map((row) => {
      // A put bought for a floor is paid for out of the same net.
      const net = r2(2 * mid(row) - mid(long) - (put ? mid(put) : 0));
      const floor = put ? Number(put.strike) : null;
      return { row, strike: Number(row.strike), net, ...repairOutcome({ basis: B, spot: s, longStrike: long.strike, shortStrike: row.strike, net, floor }) };
    });
  // Suggested: the lowest break-even among those done for no money; if none
  // is, the one costing least.
  const free = shorts.filter((c) => c.net >= 0 && c.breakEven !== null);
  const pick = free.length
    ? free.reduce((a, b) => (b.breakEven < a.breakEven ? b : a))
    : shorts.reduce((a, b) => (a === null || b.net > a.net ? b : a), null);
  if (put && Number(put.strike) > Number(long.strike)) {
    return { long, shorts: [], reason: `The put at ${put.strike} is above the call bought at ${long.strike}. Pick a lower floor.` };
  }
  return {
    long,
    put,
    shorts,
    suggestedStrike: pick ? pick.strike : null,
    reason: shorts.length ? null : "No call above the price has a market on this expiry."
  };
}
