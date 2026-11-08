import { test } from "node:test";
import assert from "node:assert/strict";
import { screenSummary, gammaAt, gammaFields, screenUniverse } from "./gexScreen.js";

const NOW = Date.parse("2026-11-09T12:00:00Z"); // Monday 7:00 New York
// A call wall above, a put wall below, the price between.
const chain = {
  spot: 100, at: "2026-11-09T12:00:00Z", oiDate: "2026-11-06",
  expiries: ["2026-11-13", "2026-11-20", "2027-01-15"],
  rows: [
    [105, 0, 1, 20000, 0.4, 0], [95, 0, 0, 15000, 0.45, 0], [100, 1, 1, 5000, 0.4, 0], [100, 1, 0, 5000, 0.42, 0],
    [110, 2, 1, 99999, 0.4, 0] // beyond 30 days: not counted
  ]
};

test("summary: 30 days of expiries, walls, flip and a profile to read the price off", () => {
  const s = screenSummary(chain, NOW);
  assert.equal(s.contracts, 4);
  assert.equal(s.callWall, 105);
  assert.equal(s.putWall, 95);
  assert.equal(s.k.length, 49);
  assert.equal(s.lo, 88);
  assert.equal(s.hi, 112);
  // Read at the price then, the profile gives the net worked out then (to the $1,000 kept).
  assert.ok(Math.abs(gammaAt(s, 100) - s.net) < 1000, `${gammaAt(s, 100)} vs ${s.net}`);
  assert.equal(gammaAt(s, 80), null);
  assert.equal(screenSummary({ ...chain, rows: [] }, NOW), null);
});

test("figures at the price now: sign, hedge against volume, distances to the levels", () => {
  const s = { spot: 100, net: 2e6, flip: 98, callWall: 105, putWall: 95, lo: 88, hi: 112, k: Array.from({ length: 49 }, (_, i) => (i - 20) * 100), at: "x" };
  const f = gammaFields(s, 100, 1e8);
  assert.equal(f.gexSign, 1);
  assert.ok(Math.abs(f.gexNet - 400000) < 1e-6); // 100 is the 24th of 49 prices: (24 - 20) x $100k
  assert.ok(Math.abs(f.gexHedge - 0.004) < 1e-12);
  assert.ok(Math.abs(f.gexToFlip + 0.02) < 1e-12);
  assert.ok(Math.abs(f.gexToCall - 0.05) < 1e-12);
  assert.ok(Math.abs(f.gexWallAbs - 0.05) < 1e-12);
  const low = gammaFields(s, 90, null);
  assert.equal(low.gexSign, -1);
  assert.equal(low.gexHedge, null);
  assert.equal(gammaFields(null, 100, 1), null);
});

test("universe: most dollars traded in the last full session before the day, optionable only as given", () => {
  const bars = {
    AAA: [{ t: "2026-11-05T05:00:00Z", c: 10, v: 1e6 }, { t: "2026-11-06T05:00:00Z", c: 10, v: 2e6 }],
    BBB: [{ t: "2026-11-06T05:00:00Z", c: 100, v: 1e6 }, { t: "2026-11-09T05:00:00Z", c: 100, v: 9e9 }], // today's candle not counted
    CCC: []
  };
  assert.deepEqual(screenUniverse(bars, "2026-11-09").map((x) => x.symbol), ["BBB", "AAA"]);
  assert.equal(screenUniverse(bars, "2026-11-09", 1).length, 1);
});
