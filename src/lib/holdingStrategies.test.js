import test from "node:test";
import assert from "node:assert/strict";
import { collarCandidates, repairCandidates, repairOutcome, repairPLAt, expiryNear, holdingActions, floorPut } from "./holdingStrategies.js";

test("holding actions: a round lot held long; repair only below cost", () => {
  const lot = { shares: true, shareQty: 200, qty: 200, shareBasis: 120, longCurrentPrice: 100 };
  assert.deepEqual(holdingActions(lot), { protect: true, repair: true });
  // The streamed price wins over the synced one.
  assert.deepEqual(holdingActions({ ...lot, stockPrice: 125 }), { protect: true, repair: false });
  assert.deepEqual(holdingActions({ ...lot, shareQty: 99, qty: 99 }), { protect: false, repair: false });
  // Short shares report a positive qty but a negative shareQty.
  assert.deepEqual(holdingActions({ ...lot, shareQty: -200 }), { protect: false, repair: false });
  assert.deepEqual(holdingActions({ ...lot, shares: false }), { protect: false, repair: false });
});

test("expiry: the listed date nearest six weeks out, never one already past", () => {
  const list = ["2026-10-09", "2026-10-16", "2026-11-20", "2026-12-18", "2027-01-15"];
  assert.equal(expiryNear(list, "2026-10-13"), "2026-11-20");
  assert.equal(expiryNear(list, "2026-10-13", 70), "2026-12-18");
  assert.equal(expiryNear(["2026-10-09"], "2026-10-13"), null);
  assert.equal(expiryNear([], "2026-10-13"), null);
});

// A ladder around a $100 stock. Puts get cheaper further down, calls further up.
const row = (strike, callMid, putMid) => ({
  strike,
  call: callMid === null ? null : { symbol: `X${strike}C`, strike, type: "C", mid: callMid, bid: callMid - 0.05, ask: callMid + 0.05 },
  put: putMid === null ? null : { symbol: `X${strike}P`, strike, type: "P", mid: putMid, bid: putMid - 0.05, ask: putMid + 0.05 }
});
const ladder = [
  row(85, 16, 0.8), row(90, 11.5, 1.6), row(95, 7.5, 2.9), row(100, 4.5, 4.6),
  row(105, 2.5, 7.5), row(110, 1.5, 11.4), row(115, 0.9, 15.8), row(120, 0.5, 20.5), row(125, 0.25, null)
];

test("collar: the put at or below the floor asked, the zero-cost call the highest that pays for it", () => {
  const c = collarCandidates(ladder, 100, 0.1);
  assert.equal(c.put.strike, 90);
  assert.equal(c.target, 90);
  // Bought at the ask, sold at the bid. The put costs 1.65: the 105 call
  // (bid 2.45) pays for it, the 110 (bid 1.45) does not.
  assert.equal(c.zeroCostStrike, 105);
  assert.deepEqual(c.calls.map((x) => x.strike), [105, 110, 115, 120, 125]);
  assert.equal(c.calls[0].net, 0.8);
  assert.equal(c.calls[1].net, -0.2);
  assert.equal(c.reason, null);
});

test("collar: never a put closer to the money than asked", () => {
  const c = collarCandidates(ladder, 100, 0.07);
  // 93 asked: the 90 is the highest at or below it.
  assert.equal(c.put.strike, 90);
});

test("collar: when no call pays for the put, say so and still offer the nearest", () => {
  const c = collarCandidates(ladder, 100, 0.0);
  assert.equal(c.put.strike, 100);
  assert.equal(c.zeroCostStrike, null);
  assert.equal(c.calls[0].strike, 105);
  assert.match(c.reason, /costs money/);
  assert.equal(collarCandidates(ladder, 100, 0.5).put, null);
});

test("repair outcome: half way back for nothing breaks even at the short strike", () => {
  // Bought at 120, now 100. Buy the 100 call, sell two 110s, for nothing.
  const o = repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 110, net: 0 });
  assert.equal(o.breakEven, 110);
  assert.equal(o.capPerShare, 0);
  assert.equal(o.recovered, 0.5);
  // A credit lowers it further; a debit raises it.
  assert.equal(repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 110, net: 1 }).breakEven, 109.5);
  // A short strike too close to the price cannot close the gap: no break-even.
  assert.equal(repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 104, net: 0 }).breakEven, null);
});

test("repair at a price: below the long strike it adds only its net -- no protection", () => {
  // INTC, cost 107: buy the 101 call, sell two 106s for a 0.10 credit.
  const r = { basis: 107, longStrike: 101, shortStrike: 106, net: 0.1 };
  assert.deepEqual(repairPLAt(r, 85), { withRepair: -21.9, sharesAlone: -22 });
  assert.deepEqual(repairPLAt(r, 95), { withRepair: -11.9, sharesAlone: -12 });
  // Between the strikes the long call adds a dollar for each dollar.
  assert.deepEqual(repairPLAt(r, 103.95), { withRepair: 0, sharesAlone: -3.05 });
  // At and above the short strike: flat at the cap, the shares alone keep rising.
  assert.deepEqual(repairPLAt(r, 106), { withRepair: 4.1, sharesAlone: -1 });
  assert.deepEqual(repairPLAt(r, 120), { withRepair: 4.1, sharesAlone: 13 });
});

test("repair candidates: the long nearest the price, shorts up to the basis and two past it, the cheapest-to-breakeven suggested", () => {
  const r = repairCandidates(ladder, 101, 118);
  assert.equal(r.long.strike, 100);
  assert.deepEqual(r.shorts.map((x) => x.strike), [105, 110, 115, 120, 125]);
  // Two 105s sold at 2.45 against the 100 bought at 4.55: a 0.35 credit.
  assert.equal(r.shorts[0].net, 0.35);
  // Two 110s at 1.45: a 1.65 debit.
  assert.equal(r.shorts[1].net, -1.65);
  assert.equal(r.suggestedStrike, 105);
});

test("repair: nothing to repair above the basis", () => {
  assert.match(repairCandidates(ladder, 100, 95).reason, /not below their cost/);
  assert.match(repairCandidates(ladder, 100, null).reason, /not below their cost/);
});

// ---------------------------------------------------------------------------
// Protected repair: the repair plus a put bought as a floor.
// ---------------------------------------------------------------------------

test("protected repair outcome: a floor under the loss, the put paid out of the net", () => {
  // Bought at 120, now 100. Buy the 100 call, sell two 110s, buy the 90 put,
  // for a 1.00 credit all in.
  const o = repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 110, net: 1, floor: 90 });
  assert.equal(o.worstPerShare, -29);
  assert.equal(o.breakEven, 109.5);
  assert.equal(o.capPerShare, 1);
  // Without the floor there is no worst: the shares can go to zero.
  assert.equal(repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 110, net: 1 }).worstPerShare, null);
  // A floor above the call bought is not this trade.
  assert.equal(repairOutcome({ basis: 120, spot: 100, longStrike: 100, shortStrike: 110, net: 1, floor: 101 }), null);
});

test("protected repair at a price: flat below the floor", () => {
  // INTC, cost 107: buy the 101 call, sell two 106s, buy the 90 put; 3.03 debit all in.
  const r = { basis: 107, longStrike: 101, shortStrike: 106, net: -3.03, floor: 90 };
  assert.deepEqual(repairPLAt(r, 85), { withRepair: -20.03, sharesAlone: -22 });
  assert.deepEqual(repairPLAt(r, 90), { withRepair: -20.03, sharesAlone: -17 });
  assert.deepEqual(repairPLAt(r, 95), { withRepair: -15.03, sharesAlone: -12 });
  assert.deepEqual(repairPLAt(r, 110), { withRepair: 0.97, sharesAlone: 3 });
});

test("protected repair candidates: the put's cost comes off every net", () => {
  const put = floorPut(ladder, 101, 0.1);
  assert.equal(put.strike, 90);
  const r = repairCandidates(ladder, 101, 118, put);
  assert.equal(r.put.strike, 90);
  // Two 105s at 2.45, less the 100 call at 4.55 and the 90 put at 1.65.
  assert.equal(r.shorts[0].net, -1.3);
  assert.equal(r.shorts[0].worstPerShare, -29.3);
  // A put above the call bought is refused, with a reason.
  assert.match(repairCandidates(ladder, 101, 118, ladder[4].put).reason, /Pick a lower floor/);
});

// ---------------------------------------------------------------------------
// The floor by strike, stepped through the chain, and the collar's outcomes.
// ---------------------------------------------------------------------------

import { putStrikes, putAtStrike, collarCalls, collarPLAt, collarBreakEven } from "./holdingStrategies.js";

test("put strikes: the chain's steps with a market, at or below a ceiling", () => {
  assert.deepEqual(putStrikes(ladder, 101), [85, 90, 95, 100]);
  // The 125 has no put market and is never offered.
  assert.deepEqual(putStrikes(ladder), [85, 90, 95, 100, 105, 110, 115, 120]);
});

test("put at a strike: exact where listed, else the next one down, never up", () => {
  assert.equal(putAtStrike(ladder, 95).strike, 95);
  assert.equal(putAtStrike(ladder, 97.5).strike, 95);
  assert.equal(putAtStrike(ladder, 80), null);
});

test("collar calls against a chosen put: same nets as the percentage route", () => {
  const byPct = collarCandidates(ladder, 100, 0.1);
  const byStrike = collarCalls(ladder, 100, putAtStrike(ladder, 90));
  assert.deepEqual(byStrike.calls.map((c) => c.net), byPct.calls.map((c) => c.net));
  assert.equal(byStrike.zeroCostStrike, 105);
});

test("collar at a price: flat below the floor and above the cap", () => {
  // Cost 107, buy the 90 put, sell the 115 call for a 0.73 credit.
  const c = { basis: 107, floor: 90, cap: 115, net: 0.73 };
  assert.deepEqual(collarPLAt(c, 80), { withStrategy: -16.27, sharesAlone: -27 });
  assert.deepEqual(collarPLAt(c, 90), { withStrategy: -16.27, sharesAlone: -17 });
  assert.deepEqual(collarPLAt(c, 120), { withStrategy: 8.73, sharesAlone: 13 });
  assert.equal(collarBreakEven(c), 106.27);
  // A floor above the cost: never a loss, so no break-even.
  assert.equal(collarBreakEven({ basis: 80, floor: 90, cap: 115, net: 0 }), null);
});

test("repair: the call bought defaults to the nearest strike and can be moved", () => {
  const near = repairCandidates(ladder, 101, 118);
  assert.equal(near.long.strike, 100);
  assert.equal(near.nearestStrike, 100);
  assert.deepEqual(near.longStrikes, [85, 90, 95, 100, 105, 110, 115, 120, 125]);
  // Moved down a strike: the calls sold start above it.
  const moved = repairCandidates(ladder, 101, 118, null, 95);
  assert.equal(moved.long.strike, 95);
  assert.equal(moved.nearestStrike, 100);
  assert.equal(moved.shorts[0].strike, 100);
  // Two 100s at 4.45 against the 95 at 7.55: a 1.35 credit.
  assert.equal(moved.shorts[0].net, 1.35);
  // A strike this expiry does not list: the nearest listed one.
  assert.equal(repairCandidates(ladder, 101, 118, null, 96).long.strike, 95);
});

// ---------------------------------------------------------------------------
// Priced at what would trade now, and the floor that barely protects.
// ---------------------------------------------------------------------------

import { buyPrice, sellPrice, wideQuote, farFloor } from "./holdingStrategies.js";

// The owner's IREN collar, June 2027 expiry, stock at 28.75: the 5 put and
// the 130-140 calls as the chain quoted them.
const quote = (strike, type, bid, ask) => ({ symbol: `IREN${strike}${type}`, strike, type, bid, ask, mid: (bid + ask) / 2 });
const iren = [
  { strike: 5, put: quote(5, "P", 0.15, 0.31), call: null },
  { strike: 25, put: quote(25, "P", 5.7, 6.26), call: null },
  { strike: 35, put: null, call: quote(35, "C", 6.62, 6.96) },
  { strike: 130, put: null, call: quote(130, "C", 0.21, 0.89) },
  { strike: 135, put: null, call: quote(135, "C", 0.22, 0.81) },
  { strike: 140, put: null, call: quote(140, "C", 0.3, 0.49) }
];

test("bought at the ask, sold at the bid; the midpoint only where a side is missing", () => {
  assert.equal(buyPrice(iren[0].put), 0.31);
  assert.equal(sellPrice(iren[5].call), 0.3);
  assert.equal(buyPrice({ mid: 1.2 }), 1.2);
  assert.equal(sellPrice({ mid: 1.2 }), 1.2);
});

test("collar on wide quotes: the midpoint's credit is a debit at the prices on screen", () => {
  const c = collarCalls(iren, 28.75, iren[0].put);
  const at140 = c.calls.find((x) => x.strike === 140);
  // Midpoints said 0.395 - 0.23 = a 0.17 credit. At the bid and ask: 0.30 - 0.31.
  assert.equal(at140.net, -0.01);
  assert.equal(at140.wide, true);
  // None of 130-140 pays for the put at those prices: zero cost is the 35.
  assert.equal(c.zeroCostStrike, 35);
});

test("wide quote: too far apart for its price, but not a penny market", () => {
  assert.equal(wideQuote(iren[5].call), true); // 0.30 / 0.49
  assert.equal(wideQuote(iren[0].put), true); // 0.15 / 0.31
  assert.equal(wideQuote(iren[1].put), false); // 5.70 / 6.26
  assert.equal(wideQuote(quote(1, "C", 0.05, 0.07)), false);
  assert.equal(wideQuote({ mid: 1 }), false);
});

test("far floor: half way down or more is flagged; a normal floor is not", () => {
  assert.equal(Math.round(farFloor(28.75, 5) * 1000) / 1000, 0.826);
  assert.equal(farFloor(100, 50), 0.5);
  assert.equal(farFloor(28.75, 25), null);
  assert.equal(farFloor(null, 5), null);
});
