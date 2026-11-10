import { test } from "node:test";
import assert from "node:assert/strict";
import { chartGamma, gexLines, cleanGexLines, anyGexLine, hedgePct } from "./gexChart.js";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const chain = {
  symbol: "XYZ", spot: 100, at: "2026-11-09T12:00:00Z", oiDate: "2026-11-06", avgDollar20: 5e8,
  expiries: ["2026-11-13", "2026-11-20", "2027-01-15"],
  rows: [
    [105, 0, 1, 20000, 0.4, 0], [95, 0, 0, 15000, 0.45, 0], [100, 1, 1, 5000, 0.4, 0], [100, 1, 0, 5000, 0.42, 0],
    [110, 2, 1, 99999, 0.4, 0] // beyond 30 days: not counted
  ]
};

test("the chart's read: the screener's walls and flip, and net gamma against a normal day's volume", () => {
  const g = chartGamma(chain, NOW);
  assert.equal(g.symbol, "XYZ");
  assert.equal(g.callWall, 105);
  assert.equal(g.putWall, 95);
  assert.ok(Math.abs(g.hedge - g.net / 5e8) < 1e-15);
  assert.equal(chartGamma({ ...chain, avgDollar20: null }, NOW).hedge, null);
  assert.equal(chartGamma({ ...chain, rows: [] }, NOW), null);
  assert.equal(chartGamma(null, NOW), null);
});

test("lines for the switches that are on, one line when the walls share a strike", () => {
  const g = { callWall: 105, putWall: 95, flip: 99.5 };
  assert.deepEqual(gexLines(g, { call: true, put: true, flip: true }).map((l) => [l.kind, l.price]), [["call", 105], ["put", 95], ["flip", 99.5]]);
  assert.deepEqual(gexLines(g, { call: false, put: true, flip: false }).map((l) => l.kind), ["put"]);
  assert.deepEqual(gexLines({ ...g, putWall: 105 }, { call: true, put: true, flip: false }).map((l) => [l.kind, l.title]), [["both", "GEX call+put wall"]]);
  assert.deepEqual(gexLines({ ...g, flip: null }, { call: false, put: false, flip: true }), []);
  assert.deepEqual(gexLines(null, { call: true }), []);
});

test("switches: stored values made safe, on by default", () => {
  assert.deepEqual(cleanGexLines(null), { call: true, put: true, flip: true });
  assert.deepEqual(cleanGexLines({ call: false, put: "x", extra: 1 }), { call: false, put: true, flip: true });
  assert.equal(anyGexLine({ call: false, put: false, flip: false }), false);
  assert.equal(anyGexLine({ flip: true }), true);
});

test("the hedge against volume as a percentage", () => {
  assert.equal(hedgePct(0.024), "2.4%");
  assert.equal(hedgePct(-0.12), "−12%");
  assert.equal(hedgePct(-0.0995), "−10%");
  assert.equal(hedgePct(-0.0994), "−9.9%");
  assert.equal(hedgePct(null), "—");
});
