import test from "node:test";
import assert from "node:assert/strict";
import { sma, ema, bollinger, rsi, macd, stochastic, atr, vwap, cleanIndicators, indicatorSeries, indicatorLabel, regressionChannel, sourceValue } from "./indicators.js";

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

test("a hidden indicator keeps its settings and stays hidden; a shown one carries no flag", () => {
  const [shown, hidden] = cleanIndicators([{ id: "a", type: "ema", params: { period: 9 } }, { id: "b", type: "sma", params: { period: 20 }, hidden: true }]);
  assert.equal(shown.hidden, undefined);
  assert.deepEqual([hidden.hidden, hidden.params.period], [true, 20]);
  assert.equal(cleanIndicators([{ id: "c", type: "vwap", hidden: "yes" }])[0].hidden, undefined);
});

// ---------- standard deviation channel (18 Nov, the owner's TradingView "Std Dev Chn") ----------

test("a straight run of closes is its own line: no spread, R of 1", () => {
  const c = regressionChannel([10, 12, 14, 16], 4);
  close(c.slope, 2);
  close(c.start, 10);
  close(c.sd, 0);
  close(c.r, 1);
  assert.deepEqual([c.from, c.to, c.length], [0, 3, 4]);
});

test("the fit, the spread over n - 1, and Pearson's R, worked by hand", () => {
  // x 0..3, y 1 3 2 4: slope 0.8, the line 1.3 2.1 2.9 3.7, misses -0.3 0.9 -0.9 0.3.
  const c = regressionChannel([1, 3, 2, 4], 4);
  close(c.slope, 0.8);
  close(c.start, 1.3);
  close(c.sd, Math.sqrt(1.8 / 3));
  close(c.r, 0.8);
});

test("only the last `length` values are fitted; all of them when there are fewer", () => {
  const c = regressionChannel([50, 1, 3, 2, 4], 4);
  assert.equal(c.from, 1);
  close(c.slope, 0.8);
  assert.equal(regressionChannel([1, 2, 3], 500).length, 3);
  assert.equal(regressionChannel([7], 500), null);
});

test("a channel's source", () => {
  const bar = { open: 10, high: 14, low: 8, close: 12 };
  assert.deepEqual(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].map((s) => sourceValue(bar, s)), [12, 10, 14, 8, 11, 34 / 3, 11]);
});

test("the channel's bands and fills, as the owner set them: +1 and +2 above, 3 and 4 below", () => {
  const bars = [1, 3, 2, 4].map((c, i) => ({ time: 1000 + i * 60, open: c, high: c, low: c, close: c }));
  const x = { id: "s1", type: "sdc", params: { length: 500, src: "close", up1: 1, up2: 2, dn1: 3, dn2: 4, extend: "right" } };
  const out = indicatorSeries(x, bars, () => 0);
  assert.equal(out.lines.length, 0);
  assert.deepEqual(out.channel.bands.map((b) => b.k), [0, 1, 2, -3, -4]);
  assert.deepEqual(out.channel.fills.map((f) => [f.from, f.to]), [[0, 1], [0, -3]]);
  assert.equal(out.channel.extend, "right");
  assert.equal(out.channel.wanted, 500);
  // The legend reads the centre line, bar by bar.
  assert.deepEqual(out.legend[0].data.map((p) => Number(p.value.toFixed(2))), [1.3, 2.1, 2.9, 3.7]);
  // A band set to 0 is off.
  const off = indicatorSeries({ ...x, params: { ...x.params, up2: 0, dn1: 0 } }, bars, () => 0);
  assert.deepEqual(off.channel.bands.map((b) => b.k), [0, 1, -4]);
  assert.deepEqual(off.channel.fills.map((f) => f.to), [1]);
  assert.equal(indicatorSeries(x, [], () => 0).channel, null);
});

test("a channel's settings kept within sense: choices from their list, bands may be 0 or a half", () => {
  const [kept] = cleanIndicators([{ id: "s1", type: "sdc", color: "#d97706", params: { length: 5000, src: "hlc3", up1: 1.5, up2: 0, dn1: 3, dn2: 4, extend: "both" } }]);
  assert.deepEqual(kept.params, { length: 5000, src: "hlc3", up1: 1.5, up2: 0, dn1: 3, dn2: 4, extend: "both" });
  const [fixed] = cleanIndicators([{ id: "s2", type: "sdc", params: { length: 9000, src: "vwap", up1: -1, extend: "up" } }]);
  assert.deepEqual(fixed.params, { length: 500, src: "close", up1: 1, up2: 2, dn1: 3, dn2: 4, extend: "right" });
  assert.equal(indicatorLabel(kept), "Std dev 5000 hlc3");
  // The others as before.
  const [bb] = cleanIndicators([{ id: "b", type: "bb", params: { period: 20, mult: 2 } }]);
  assert.deepEqual(bb.params, { period: 20, mult: 2 });
});
