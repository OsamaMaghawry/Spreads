import test from "node:test";
import assert from "node:assert/strict";
import { dailyStats, isFundName } from "./screenStats.ts";

// Day i: closes 100, 101, 102 ... with highs a dollar above and lows a dollar below.
const day = (i: number) => new Date(Date.UTC(2025, 0, 2) + i * 86400000).toISOString().slice(0, 10);
const bars = (n: number, close = (i: number) => 100 + i, vol = () => 1000) =>
  Array.from({ length: n }, (_, i) => ({ t: `${day(i)}T05:00:00Z`, o: close(i), h: close(i) + 1, l: close(i) - 1, c: close(i), v: vol() }));

test("finished days only: today's partial candle is left out", () => {
  const list = bars(30);
  const s = dailyStats(list, day(29))!;
  assert.equal(s.bars, 29);
  assert.equal(s.lastClose, 128);
  assert.equal(s.lastDate, day(28));
  assert.equal(dailyStats([], "2026-10-24"), null);
});

test("averages, volume norms, past closes and the 52-week range", () => {
  const s = dailyStats(bars(260), day(260))!;
  assert.equal(s.lastClose, 359);
  assert.equal(s.sma20, (340 + 359) / 2);
  assert.equal(s.sma200, (160 + 359) / 2);
  assert.equal(s.avgVol20, 1000);
  assert.equal(s.avgDollar20, 1000 * (340 + 359) / 2);
  assert.deepEqual([s.closes.d5, s.closes.d21, s.closes.d252], [354, 338, 107]);
  // The last 252 days: closes 108..359, highs a dollar above, lows a dollar below.
  assert.equal(s.high52, 360);
  assert.equal(s.low52, 107);
  // Every candle is from this year: no close before it to measure from.
  assert.equal(s.closes.ytd, null);
  assert.equal(dailyStats(bars(10), day(10))!.sma20, null);
});

test("RSI's running averages: only gains give no losses; ATR of a steady range", () => {
  const s = dailyStats(bars(40), day(40))!;
  assert.equal(s.rsi!.loss, 0);
  assert.equal(s.rsi!.gain, 1);
  // Each day's true range: high - previous close = 2.
  assert.equal(s.atr14, 2);
  const flat = dailyStats(bars(10), day(10))!;
  assert.equal(flat.rsi, null);
  assert.equal(flat.atr14, null);
});

test("year to date starts from the last close of the previous year", () => {
  const list = [
    { t: "2025-12-30T05:00:00Z", o: 1, h: 1, l: 1, c: 90, v: 1 },
    { t: "2025-12-31T05:00:00Z", o: 1, h: 1, l: 1, c: 95, v: 1 },
    { t: "2026-01-02T05:00:00Z", o: 1, h: 1, l: 1, c: 99, v: 1 }
  ];
  assert.equal(dailyStats(list, "2026-10-24")!.closes.ytd, 95);
});

test("funds by name", () => {
  for (const n of ["SPDR S&P 500 ETF Trust", "Invesco QQQ Trust, Series 1", "iShares Russell 2000 ETF", "ProShares UltraPro QQQ", "Direxion Daily Semiconductor Bull 3X Shares"]) assert.equal(isFundName(n), true, n);
  for (const n of ["Apple Inc. Common Stock", "NVIDIA Corporation Common Stock", "Palantir Technologies Inc."]) assert.equal(isFundName(n), false, n);
});

// ---------------------------------------------------------------------------
// The standard deviation channel (18 Nov): the screen's figure is the chart's
// channel (src/lib/indicators.js regressionChannel) at the last day, today's
// price included as today's close.
// ---------------------------------------------------------------------------
import { channelSums, CHANNEL_DAYS } from "./screenStats.ts";
import { channelAt, screenRow } from "../../../src/lib/screener.js";
import { regressionChannel } from "../../../src/lib/indicators.js";

// A walk with drift and noise, as a share's closes might go.
const walk = (n: number) => {
  let seed = 11;
  let p = 80;
  return Array.from({ length: n }, () => { seed = (seed * 16807) % 2147483647; p *= 1 + (seed / 2147483647 - 0.48) * 0.05; return p; });
};
const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("channel: needs 499 finished days; the day before them only from 500", () => {
  assert.equal(CHANNEL_DAYS, 500);
  assert.equal(channelSums(walk(498)), null);
  assert.equal(channelSums(walk(499))!.prev, null);
  const s = channelSums(walk(620))!;
  assert.equal(s.n, 499);
  assert.equal(s.ref, walk(620)[619]);
  assert.equal(s.prev, walk(620)[620 - 500]);
});

test("channel: today's price joins the fit, exactly as the chart's channel", () => {
  const closes = walk(640);
  const s = dailyStats(bars(641, (i) => (i < 640 ? closes[i] : 0)), day(640))!;
  const price = closes[639] * 1.07;
  const got = channelAt(s.chan, price, true)!;
  const want = regressionChannel([...closes.slice(-499), price], 500)!;
  const line = want.start + want.slope * (want.length - 1);
  near(got.mid, line, 1e-7);
  near(got.sd, want.sd, 1e-7);
  near(got.slope, want.slope, 1e-9);
  near(got.z!, (price - line) / want.sd, 1e-7);
});

test("channel: a weekend or before the open, the last 500 finished days, the price against their last", () => {
  const closes = walk(700);
  const s = dailyStats(bars(700, (i) => closes[i]), day(700))!;
  const price = closes[699] - 3;
  const got = channelAt(s.chan, price, false)!;
  const want = regressionChannel(closes, 500)!;
  const line = want.start + want.slope * 499;
  near(got.mid, line, 1e-7);
  near(got.sd, want.sd, 1e-7);
  near(got.z!, (price - line) / want.sd, 1e-7);
  // 499 days only: nothing to measure a finished fit with, and no figure.
  assert.equal(channelAt(channelSums(closes.slice(-499)), price, false), null);
  assert.equal(channelAt(null, price, true), null);
});

test("channel: the screen row's figure, live on a weekday, and on a Saturday", () => {
  const closes = walk(600);
  const stats = dailyStats(bars(600, (i) => closes[i]), day(600))!;
  const last = stats.lastDate;
  const today = "2026-11-18";
  const live = screenRow({ symbol: "X", price: closes[599] * 1.1, day: today, prevClose: closes[599] }, stats, today);
  near(live.chanZ, channelAt(stats.chan, closes[599] * 1.1, true)!.z!, 1e-12);
  const weekend = screenRow({ symbol: "X", price: closes[599], day: last, prevClose: closes[598] }, stats, "2026-11-21");
  near(weekend.chanZ, channelAt(stats.chan, closes[599], false)!.z!, 1e-12);
  assert.ok(Number.isFinite(live.chanMid) && live.chanSd > 0);
});
