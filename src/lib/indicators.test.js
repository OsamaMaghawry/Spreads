import test from "node:test";
import assert from "node:assert/strict";
import { sma, ema, bollinger, rsi, macd, stochastic, atr, vwap, cleanIndicators, indicatorSeries, indicatorLabel } from "./indicators.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("SMA and EMA: nulls while warming up; EMA seeded with the simple average", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  // Nulls in (a MACD line warming up) are skipped, not counted.
  assert.deepEqual(ema([null, null, 1, 2, 3, 4], 3), [null, null, null, null, 2, 3]);
});

test("Bollinger: the textbook set, mean 5 and population sd 2", () => {
  const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
  assert.equal(b.mid[7], 5);
  assert.equal(b.upper[7], 9);
  assert.equal(b.lower[7], 1);
  assert.equal(b.upper[6], null);
});

test("RSI: Wilder smoothing, 100 with no losses", () => {
  const r = rsi([1, 2, 1, 2], 2);
  assert.deepEqual([r[0], r[1]], [null, null]);
  close(r[2], 50);
  close(r[3], 75);
  assert.equal(rsi([1, 2, 3, 4, 5], 2)[4], 100);
});

test("MACD: line is fast EMA minus slow; histogram is line minus signal", () => {
  const v = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15];
  const m = macd(v, 2, 3, 2);
  assert.equal(m.macd[1], null);
  assert.notEqual(m.macd[2], null);
  assert.equal(m.signal[2], null);
  for (let i = 3; i < v.length; i++) close(m.hist[i], m.macd[i] - m.signal[i]);
});

test("Stochastic and ATR", () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({ time: i, open: i, high: i + 1, low: i - 1, close: i + 1, volume: 1 }));
  // Closing at the high of the window every bar: %K 100.
  assert.equal(stochastic(bars, 3, 1, 1).k[9], 100);
  // Range 2 each bar and gaps of 1 inside it: true range 2.
  close(atr(bars, 3)[9], 2);
});

test("VWAP: volume-weighted typical price, restarting each session", () => {
  const bars = [
    { time: 1, high: 11, low: 9, close: 10, volume: 100 },
    { time: 2, high: 21, low: 19, close: 20, volume: 300 },
    { time: 3, high: 31, low: 29, close: 30, volume: 50 }
  ];
  const out = vwap(bars, (t) => (t < 3 ? "day1" : "day2"));
  assert.equal(out[0], 10);
  assert.equal(out[1], (10 * 100 + 20 * 300) / 400);
  assert.equal(out[2], 30);
});

test("the indicator list: unknown types dropped, periods kept sensible; series leave out warm-up", () => {
  const list = cleanIndicators([{ id: "a", type: "ema", params: { period: "9" } }, { id: "b", type: "laser" }, { id: "c", type: "rsi", params: { period: -4 } }]);
  assert.deepEqual(list.map((x) => [x.type, x.params.period]), [["ema", 9], ["rsi", 14]]);
  assert.equal(indicatorLabel(list[0]), "EMA 9");
  const bars = Array.from({ length: 30 }, (_, i) => ({ time: 1000 + i * 60, open: i, high: i + 1, low: i - 1, close: i, volume: 10 }));
  const s = indicatorSeries(list[0], bars, () => 1);
  assert.equal(s.lines[0].data.length, 30 - 8);
  assert.equal(s.lines[0].data[0].time, 1000 + 8 * 60);
  assert.deepEqual(indicatorSeries(list[1], bars, () => 1).levels, [70, 30]);
});
