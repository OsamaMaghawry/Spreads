import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesColumn, dailySeries, bookedCurve } from "./equityCurve.js";

const SERIES = [
  { day: "2026-09-01", equity: 140000, premium_cum: 300, performance: 300, unpriced: [] },
  { day: "2026-09-02", equity: 140800, premium_cum: 300, performance: 1100, unpriced: [] },
  { day: "2026-09-03", equity: 141500, premium_cum: 800, performance: 1800, unpriced: [] },
  { day: "2026-09-04", equity: 151000, premium_cum: 800, performance: 11300, unpriced: [] }
];

test("each view and mode reads its own stored column", () => {
  assert.equal(seriesColumn("whole", "performance"), "performance");
  assert.equal(seriesColumn("premium", "performance"), "premium_cum");
  assert.equal(seriesColumn("whole", "value"), "equity");
  assert.equal(seriesColumn("premium", "value"), "equity");
});

test("whole view plots a real point for every stored day", () => {
  const s = dailySeries(SERIES, "whole");
  assert.deepEqual(s.points.map((p) => p.value), [300, 1100, 1800, 11300]);
  assert.equal(s.end, 11300);
  assert.equal(s.missing, 0);
});

test("premium only plots the option legs, flat between closes", () => {
  const s = dailySeries(SERIES, "premium");
  assert.deepEqual(s.points.map((p) => p.value), [300, 300, 800, 800]);
  assert.equal(s.end, 800);
});

test("account value mode plots the broker's balance untouched", () => {
  const s = dailySeries(SERIES, "whole", "value");
  assert.deepEqual(s.points.map((p) => p.value), [140000, 140800, 141500, 151000]);
  assert.equal(s.change, 11000);
});

test("rows arrive in any order and come out oldest first", () => {
  const s = dailySeries([SERIES[2], SERIES[0], SERIES[3], SERIES[1]], "whole");
  assert.deepEqual(s.points.map((p) => p.date), [
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"
  ]);
});

test("a date range measures from the day BEFORE it, not from zero", () => {
  const s = dailySeries(SERIES, "whole", "performance", { from: "2026-09-03" });
  // 09-02 closed at 1100, so the window starts from there.
  assert.deepEqual(s.points.map((p) => p.value), [700, 10200]);
  assert.equal(s.rebased, true);
});

test("a range starting at the first stored day has no baseline and does not invent one", () => {
  const s = dailySeries(SERIES, "whole", "performance", { from: "2026-09-01" });
  assert.equal(s.rebased, false);
  assert.deepEqual(s.points.map((p) => p.value), [300, 1100, 1800, 11300]);
});

test("account value is never rebased — a balance is a balance in any window", () => {
  const s = dailySeries(SERIES, "whole", "value", { from: "2026-09-03" });
  assert.equal(s.rebased, false);
  assert.deepEqual(s.points.map((p) => p.value), [141500, 151000]);
});

test("a closing date bounds the window on the right", () => {
  const s = dailySeries(SERIES, "whole", "performance", { to: "2026-09-02" });
  assert.deepEqual(s.points.map((p) => p.date), ["2026-09-01", "2026-09-02"]);
  assert.equal(s.end, 1100);
});

test("a day that could not be valued is a gap, not a dive to the axis", () => {
  const s = dailySeries(
    [
      SERIES[0],
      { day: "2026-09-02", equity: 140800, premium_cum: 300, performance: null, unpriced: ["AMZN"] },
      SERIES[2]
    ],
    "whole"
  );
  assert.deepEqual(s.points.map((p) => p.value), [300, null, 1800]);
  assert.equal(s.missing, 1);
  assert.deepEqual(s.unpricedTickers, ["AMZN"]);
  // The ends are the valued ends, not the gap.
  assert.equal(s.start, 300);
  assert.equal(s.end, 1800);
});

test("an empty or missing series returns no points rather than throwing", () => {
  assert.deepEqual(dailySeries(null, "whole").points, []);
  assert.deepEqual(dailySeries([], "whole").points, []);
  assert.equal(dailySeries([], "whole").end, null);
});

test("a range that matches no stored day returns nothing, not the whole series", () => {
  const s = dailySeries(SERIES, "whole", "performance", { from: "2027-01-01" });
  assert.deepEqual(s.points, []);
  assert.equal(s.end, null);
});

test("a malformed day is dropped rather than sorted to the front", () => {
  const s = dailySeries([{ day: "not-a-date", performance: 99 }, SERIES[0]], "whole");
  assert.deepEqual(s.points.map((p) => p.date), ["2026-09-01"]);
});

// ---------------------------------------------------------------------------
// bookedCurve — the strategy-tab fallback
// ---------------------------------------------------------------------------

test("bookedCurve accumulates the view's own value", () => {
  const trades = [
    { close_date: "2026-09-01", premium_pl: 300, early_close_pl: 0, realized_pl: 300 },
    { close_date: "2026-09-03", premium_pl: 500, early_close_pl: 0, realized_pl: 1200 }
  ];
  assert.deepEqual(bookedCurve(trades, "premium").points.map((p) => p.value), [300, 800]);
  assert.deepEqual(bookedCurve(trades, "whole").points.map((p) => p.value), [300, 1500]);
});

test("bookedCurve draws one point per DAY, not one per trade", () => {
  // Three closes on one Tuesday are one Tuesday. Drawing them as three points
  // on the same x is what makes an ordinary day look like a vertical jump.
  const trades = [
    { close_date: "2026-09-01", realized_pl: 100 },
    { close_date: "2026-09-01", realized_pl: 200 },
    { close_date: "2026-09-01", realized_pl: 300 }
  ];
  const c = bookedCurve(trades, "whole");
  assert.equal(c.points.length, 1);
  assert.equal(c.points[0].value, 600);
});

test("bookedCurve never adds a mark leg — the pole is gone", () => {
  const c = bookedCurve([{ close_date: "2026-09-01", realized_pl: 100 }], "whole");
  assert.equal(c.points.length, 1);
  assert.equal(c.mode, "booked");
  assert.equal(Object.prototype.hasOwnProperty.call(c, "marked"), false);
});

test("bookedCurve on nothing returns nothing", () => {
  assert.deepEqual(bookedCurve([], "whole").points, []);
  assert.deepEqual(bookedCurve(null, "premium").points, []);
});

test("baselineKnown separates 'the window starts at zero' from 'we could not look'", () => {
  const rows = [
    { day: "2026-09-03", performance: -1597 },
    { day: "2026-09-04", performance: -3405 },
    { day: "2026-09-08", performance: -1180 },
    { day: "2026-09-11", performance: -949.09 }
  ];
  // A real baseline before the window: the week reads as its own move.
  const week = dailySeries(rows, "whole", "performance", { from: "2026-09-08", to: "2026-09-11" });
  assert.equal(week.baselineKnown, true);
  assert.equal(Math.round(week.end * 100) / 100, 2455.91);

  // No earlier day at all — the window IS the beginning, and zero is right.
  assert.equal(dailySeries(rows, "whole", "performance", { from: "2026-09-03" }).baselineKnown, true);

  // Earlier days exist and none could be valued. `end` is still a number, and
  // it is measured from an assumed zero — which is the whole of the account's
  // history credited to one week. The chart may draw it; a headline may not.
  const blind = dailySeries(
    [{ day: "2026-09-03", performance: null }, { day: "2026-09-04", performance: null }, ...rows.slice(2)],
    "whole", "performance", { from: "2026-09-08", to: "2026-09-11" }
  );
  assert.equal(blind.baselineKnown, false);
  assert.equal(blind.end, -949.09);
});
