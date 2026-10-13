import test from "node:test";
import assert from "node:assert/strict";
import { collarCandidates, repairCandidates, repairOutcome, expiryNear, holdingActions } from "./holdingStrategies.js";

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
  // Put costs 1.60: the 105 call (2.50) pays for it, the 110 (1.50) does not.
  assert.equal(c.zeroCostStrike, 105);
  assert.deepEqual(c.calls.map((x) => x.strike), [105, 110, 115, 120, 125]);
  assert.equal(c.calls[0].net, 0.9);
  assert.equal(c.calls[1].net, -0.1);
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

test("repair candidates: the long nearest the price, shorts up to the basis and two past it, the cheapest-to-breakeven suggested", () => {
  const r = repairCandidates(ladder, 101, 118);
  assert.equal(r.long.strike, 100);
  assert.deepEqual(r.shorts.map((x) => x.strike), [105, 110, 115, 120, 125]);
  // Two 105s at 2.50 against the 100 at 4.50: a 0.50 credit.
  assert.equal(r.shorts[0].net, 0.5);
  // Two 110s at 1.50: a 1.50 debit.
  assert.equal(r.shorts[1].net, -1.5);
  assert.equal(r.suggestedStrike, 105);
});

test("repair: nothing to repair above the basis", () => {
  assert.match(repairCandidates(ladder, 100, 95).reason, /not below their cost/);
  assert.match(repairCandidates(ladder, 100, null).reason, /not below their cost/);
});
