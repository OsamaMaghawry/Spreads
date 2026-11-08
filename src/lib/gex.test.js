import { test } from "node:test";
import assert from "node:assert/strict";
import { closeOf, bsGamma, prepare, pick, byStrike, band, profile, flipOf, walls, byExpiry, money, readout, exposureOf, withoutExpiry } from "./gex.js";

const NOW = Date.parse("2026-11-09T15:00:00Z"); // Monday 10:00 New York

test("the close is 4 p.m. New York: 21:00 UTC in winter, 20:00 in summer", () => {
  assert.equal(new Date(closeOf("2026-11-09")).toISOString(), "2026-11-09T21:00:00.000Z");
  assert.equal(new Date(closeOf("2026-07-17")).toISOString(), "2026-07-17T20:00:00.000Z");
  assert.equal(new Date(closeOf("2026-03-09")).toISOString(), "2026-03-09T20:00:00.000Z"); // after the 8 March change
  assert.equal(new Date(closeOf("2026-03-06")).toISOString(), "2026-03-06T21:00:00.000Z");
});

test("Black-Scholes gamma: highest at the money, symmetric falloff, zero without inputs", () => {
  const atm = bsGamma(100, 100, 30 / 365, 0.2);
  assert.ok(Math.abs(atm - 0.0697) < 0.002, String(atm)); // textbook value for 30 days, 20% vol
  assert.ok(bsGamma(100, 110, 30 / 365, 0.2) < atm && bsGamma(100, 90, 30 / 365, 0.2) < atm);
  assert.equal(bsGamma(100, 100, 0, 0.2), 0);
  assert.equal(bsGamma(100, 100, 0.1, 0), 0);
});

// SPY-like: a little at the money expiring today, a big call strike above
// and a big put strike below in Friday's expiry, spot between.
const chain = {
  spot: 600,
  expiries: ["2026-11-09", "2026-11-13", "2026-12-18", "2026-11-06"],
  rows: [
    // strike, expiry, call, OI, IV, volume
    [600, 0, 1, 2000, 0.14, 30000],
    [600, 0, 0, 2000, 0.16, 25000],
    [610, 1, 1, 50000, 0.15, 20000],
    [590, 1, 0, 40000, 0.18, 15000],
    [620, 1, 1, 30000, 0.15, 5000],
    [580, 1, 0, 30000, 0, 4000], // no volatility of its own: takes its expiry's median
    [650, 2, 1, 10000, 0.16, 100],
    [600, 3, 1, 99999, 0.2, 1] // expired Friday: left out
  ]
};

test("prepare: expired expiries out, a missing volatility filled from its expiry, days counted in New York", () => {
  const p = prepare(chain, NOW);
  assert.equal(p.contracts.length, 7);
  assert.equal(p.filled, 1);
  assert.deepEqual(p.expiries.map((e) => [e.days, e.open]), [[0, true], [4, true], [39, true], [0, false]]);
  assert.equal(p.contracts.find((c) => c.strike === 580).iv, 0.15); // its expiry's median of 0.15, 0.18, 0.15
});

test("exposure: calls plus, puts minus, in dollars per 1% move", () => {
  const p = prepare(chain, NOW);
  const c = p.contracts.find((x) => x.strike === 610);
  const g = bsGamma(600, 610, (closeOf("2026-11-13") - NOW) / (365 * 86400000), 0.15);
  assert.ok(Math.abs(exposureOf(c, 600) - g * 50000 * 100 * 600 * 600 * 0.01) < 1);
  assert.ok(exposureOf(p.contracts.find((x) => x.strike === 590), 600) < 0);
});

test("by strike, walls, flip and expiries on one chain", () => {
  const p = prepare(chain, NOW);
  const all = pick(p);
  const { rows, totals } = byStrike(all, 600);
  assert.deepEqual(rows.map((r) => r.strike), [580, 590, 600, 610, 620, 650]);
  const s600 = rows.find((r) => r.strike === 600);
  assert.ok(s600.callGex > 0 && s600.putGex < 0);
  assert.ok(Math.abs(totals.netGex - (totals.callGex + totals.putGex)) < 1e-6);
  const w = walls(rows);
  assert.equal(w.call, 610);
  assert.equal(w.put, 590);
  // The flip lies between the put wall and the call wall, where the sum changes sign.
  const prof = profile(all, 600);
  const flip = flipOf(prof, 600);
  assert.ok(flip > 585 && flip < 615, String(flip));
  const sign = (price) => Math.sign(profile(all, price, { span: 0, steps: 2 })[0].total);
  assert.notEqual(sign(flip - 3), sign(flip + 3));
  // Nearest expiry only, and a window.
  assert.equal(pick(p, { days: 0 }).length, 2);
  assert.equal(pick(p, { days: 7 }).length, 6);
  assert.equal(pick(p, { expiry: 2 }).length, 1);
  const ex = byExpiry(p, all, 600);
  assert.deepEqual(ex.map((e) => e.expiry), ["2026-11-09", "2026-11-13", "2026-12-18"]);
  assert.ok(Math.abs(ex.reduce((s, e) => s + e.share, 0) - 1) < 1e-9);
  assert.ok(ex[1].share > 0.5); // Friday's carries most of the gamma
});

test("open interest and volume as the measure: puts drawn below zero", () => {
  const p = prepare(chain, NOW);
  const { rows } = byStrike(pick(p), 600, "oi");
  const r600 = rows.find((r) => r.strike === 600);
  assert.deepEqual([r600.call, r600.put, r600.net], [2000, -2000, 0]);
  const vol = byStrike(pick(p), 600, "volume").rows.find((r) => r.strike === 600);
  assert.deepEqual([vol.call, vol.put], [30000, -25000]);
});

test("bands: hundreds of strikes into round-width bands, nothing lost", () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({ strike: 450 + i, call: 1, put: -1, net: 0, callGex: 2, putGex: -2, callOi: 3, putOi: 3, callVol: 1, putVol: 1 }));
  const b = band(rows, 90);
  assert.ok(b.rows.length <= 90);
  assert.equal(b.width, 5);
  assert.equal(b.rows.reduce((s, r) => s + r.callOi, 0), 900);
  assert.deepEqual(band(rows.slice(0, 20), 90).width, null);
});

test("money and the read-out: description only, regime by sign", () => {
  assert.equal(money(1.234e9), "$1.23B");
  assert.equal(money(-356e6), "-$356M");
  assert.equal(money(12400), "$12.4K");
  const pos = readout({ symbol: "SPY", spot: 600, netGex: 2e9, flip: 590, wall: { call: 610, put: 580 }, nearest: { share: 0.4, days: 0, expiry: "2026-11-09" }, oiDate: "2026-11-06" });
  assert.match(pos[0].text, /^Positive gamma/);
  assert.match(pos[1].text, /1\.7% above the zero-gamma flip at 590/);
  assert.match(pos[2].text, /call wall at 610 \(\+1\.7%\) and the put wall at 580 \(-3\.3%\)/);
  assert.match(pos[3].text, /40% of the gamma expires today/);
  const neg = readout({ symbol: "QQQ", spot: 500, netGex: -1e8, flip: null, wall: { call: null, put: 490 }, nearest: null, oiDate: null });
  assert.match(neg[0].text, /^Negative gamma/);
  assert.match(neg[1].text, /No zero-gamma flip/);
  for (const line of [...pos, ...neg]) assert.doesNotMatch(line.text, /\b(buy|sell) (it|now|here)\b|recommend|signal/i);
});

// With hours left, a same-day option at the money outweighs a bigger strike
// 1.7% away: gamma piles up at the money as expiry nears.
test("expiring today: the at-the-money strike can be the wall", () => {
  const p = prepare({ expiries: ["2026-11-09"], rows: [[600, 0, 1, 20000, 0.14, 0], [610, 0, 1, 50000, 0.15, 0]] }, NOW);
  assert.equal(walls(byStrike(pick(p), 600).rows).call, 600);
});

test("a chain without one expiry: its rows gone, the others re-indexed", () => {
  const c = withoutExpiry(chain, "2026-11-09");
  assert.deepEqual(c.expiries, ["2026-11-13", "2026-12-18", "2026-11-06"]);
  assert.equal(c.rows.length, chain.rows.length - 2);
  assert.ok(c.rows.every((r) => r[1] >= 0 && r[1] < 3));
  assert.deepEqual(c.rows.find((r) => r[0] === 650), [650, 1, 1, 10000, 0.16, 100]);
  assert.equal(withoutExpiry(chain, "2030-01-01"), chain);
});
