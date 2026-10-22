import test from "node:test";
import assert from "node:assert/strict";
import { daysTo, isMonthly, pickExpiries, straddleAt, moveFrom, expiryRow, earningsBefore, STRADDLE_FACTOR } from "./expectedMove.ts";

const leg = (bid: number, ask: number) => ({ bid, ask, mid: (bid + ask) / 2 });
const strike = (k: number, call: [number, number] | null, put: [number, number] | null) =>
  ({ strike: k, call: call ? leg(...call) : null, put: put ? leg(...put) : null }) as any;

test("monthly: the third Friday only", () => {
  assert.equal(isMonthly("2026-11-20"), true);
  assert.equal(isMonthly("2026-12-18"), true);
  assert.equal(isMonthly("2026-11-13"), false); // second Friday
  assert.equal(isMonthly("2026-11-19"), false); // a Thursday
  assert.equal(daysTo("2026-10-23", "2026-10-22"), 1);
});

test("expiries: this week's skips today; the monthly is always a later one", () => {
  const list = ["2026-10-22", "2026-10-23", "2026-10-30", "2026-11-06", "2026-11-20", "2026-12-18"];
  assert.deepEqual(pickExpiries(list, "2026-10-22"), { week: "2026-10-23", month: "2026-11-20" });
  // On the monthly's own week, the month row moves to the next monthly.
  assert.deepEqual(pickExpiries(["2026-11-20", "2026-11-27", "2026-12-18"], "2026-11-17"), { week: "2026-11-20", month: "2026-12-18" });
  // No weeklies: the nearest expiry stands in for this week.
  assert.deepEqual(pickExpiries(["2026-11-20", "2026-12-18"], "2026-10-22"), { week: "2026-11-20", month: "2026-12-18" });
  assert.deepEqual(pickExpiries([], "2026-10-22"), { week: null, month: null });
});

test("straddle: blended between the strikes either side of the price", () => {
  const ladder = [strike(95, [6, 6.2], [1, 1.1]), strike(100, [3, 3.1], [2.9, 3.1]), strike(105, [1, 1.1], [5.9, 6.1])];
  // On a strike: that strike's straddle, 3.05 + 3.00.
  assert.equal(straddleAt(ladder, 100)!.straddle.toFixed(2), "6.05");
  // Two fifths of the way from 100 to 105: 6.05 * 0.6 + 7.05 * 0.4.
  const s = straddleAt(ladder, 102)!;
  assert.equal(s.straddle.toFixed(2), "6.45");
  assert.deepEqual(s.strikes, [100, 105]);
  assert.equal(s.wide, false);
});

test("straddle: one-sided quotes are not a price; wide ones are flagged", () => {
  const noBid = [strike(100, [0, 3.1], [2.9, 3.1])].map((s) => ({ ...s, call: { bid: 0, ask: 3.1, mid: null } }));
  assert.equal(straddleAt(noBid as any, 100), null);
  assert.equal(straddleAt([strike(100, [2, 4], [2.9, 3.1])], 100)!.wide, true);
  // The nearest strike more than 5% from the price is not at the money.
  assert.equal(straddleAt([strike(110, [1, 1.1], [10, 10.2])], 100), null);
});

test("move: the calculator's definition, a straddle over sqrt(2/pi)", () => {
  const m = moveFrom({ spot: 100, straddle: 6.05, days: 29 })!;
  assert.equal(m.move, Math.round((6.05 / STRADDLE_FACTOR) * 100) / 100);
  assert.equal(m.move, 7.58);
  assert.equal(m.low, 92.42);
  assert.equal(m.high, 107.58);
  assert.equal(m.movePct, 0.0758);
  // 7.58 / (100 * sqrt(29/365)) = 26.9%.
  assert.equal(Math.round(m.iv * 1000) / 10, 26.9);
  assert.equal(moveFrom({ spot: 100, straddle: 6, days: 0 }), null);
  assert.equal(moveFrom({ spot: 100, straddle: 120, days: 5 }), null);
});

test("row: a reason in words when there is no number", () => {
  const ladder = [strike(100, [3, 3.1], [2.9, 3.1])];
  const ok = expiryRow(ladder, 100, "2026-11-20", "2026-10-22") as any;
  assert.equal(ok.days, 29);
  assert.equal(ok.straddle, 6.05);
  const none = expiryRow([], 100, "2026-11-20", "2026-10-22") as any;
  assert.match(none.error, /No two-sided quotes/);
});

test("earnings: on or before the expiry, never a past report", () => {
  assert.equal(earningsBefore("2026-10-30", "2026-10-29", "2026-10-22"), true);
  assert.equal(earningsBefore("2026-10-30", "2026-10-30", "2026-10-22"), true);
  assert.equal(earningsBefore("2026-10-23", "2026-10-29", "2026-10-22"), false);
  assert.equal(earningsBefore("2026-10-30", "2026-10-20", "2026-10-22"), false);
  assert.equal(earningsBefore(null, "2026-10-29", "2026-10-22"), false);
});
