import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeUniverse, screenRow, parseAmount, cleanScreen, passes, sortRows, needsDaily, presetScreen, PRESETS, FIELD,
  dailyCandidates, bigNumber, EMPTY_SCREEN, partialStats, fieldKnown, presetKnown
} from "./screener.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// AAPL as the screener's two reads returned it on Saturday 24 Oct 2026.
const AAPL = {
  symbol: "AAPL", name: "Apple Inc. Common Stock", exchange: "NASDAQ", price: 347.61, priceAt: "2026-10-23T23:59:50Z", day: "2026-10-23",
  prevClose: 348.22, open: 349.115, high: 351.73, low: 345.75, close: 347.725, volume: 40193051, prevVolume: 47047126, vwap: 348.026,
  bid: 347.5, ask: 347.7, options: true, shortable: true, easyToBorrow: true, fund: false, shares: 14594180000, earnDate: "2026-11-02", earnSession: "amc"
};
const AAPL_DAILY = {
  lastDate: "2026-10-23", lastClose: 347.725, bars: 261, closes: { d5: 343.46, d21: 335.92, d63: 336.91, d126: 271.06, d252: 258.45, ytd: 271.86 },
  avgVol20: 38668905.05, avgVol50: 40443315.32, avgDollar20: 13116787831.35, sma20: 338.90575, sma50: 329.4667, sma200: 294.41247,
  rsi: { gain: 1.739860608219546, loss: 0.9824971229666206 }, atr14: 6.411925, high52: 351.73, low52: 243.42
};

test("the server's columns and rows as objects", () => {
  const rows = decodeUniverse({ columns: ["symbol", "price"], rows: [["AAPL", 1], ["MSFT", 2]] });
  assert.deepEqual(rows, [{ symbol: "AAPL", price: 1 }, { symbol: "MSFT", price: 2 }]);
  assert.deepEqual(decodeUniverse(null), []);
});

test("a weekend row: Friday's move, the daily numbers as of Friday's close", () => {
  const r = screenRow(AAPL, AAPL_DAILY, "2026-10-24");
  close(r.changePct, 347.61 / 348.22 - 1);
  close(r.gapPct, 349.115 / 348.22 - 1);
  close(r.relVol, 40193051 / 38668905.05);
  close(r.marketCap, 14594180000 * 347.61);
  close(r.rsi, 100 - 100 / (1 + 1.739860608219546 / 0.9824971229666206));
  close(r.fromHigh52, 347.61 / 351.73 - 1);
  close(r.perfYtd, 347.61 / 271.86 - 1);
  close(r.atrPct, 6.411925 / 347.61);
  assert.equal(r.earningsIn, 9);
  assert.equal(r.preOpen, false);
  assert.ok(r.rangePos > 0.3 && r.rangePos < 0.32);
});

test("during the session: today folds into RSI and the 52-week range", () => {
  const monday = { ...AAPL, day: "2026-10-26", price: 360, high: 361, low: 349, open: 350, prevClose: 347.725 };
  const r = screenRow(monday, AAPL_DAILY, "2026-10-26");
  assert.equal(r.high52, 361);
  const d = 360 - 347.725;
  const gain = (1.739860608219546 * 13 + d) / 14;
  const loss = (0.9824971229666206 * 13) / 14;
  close(r.rsi, 100 - 100 / (1 + gain / loss));
  close(r.changePct, 360 / 347.725 - 1);
});

test("before the open: measured from yesterday's close, no volume yet", () => {
  // Monday 8:00 a.m.: the day's candle is still Friday's.
  const premarket = { ...AAPL, price: 356.4 };
  const r = screenRow(premarket, AAPL_DAILY, "2026-10-26");
  assert.equal(r.preOpen, true);
  close(r.changePct, 356.4 / 347.725 - 1);
  close(r.gapPct, 356.4 / 347.725 - 1);
  assert.equal(r.volume, null);
  assert.equal(r.relVol, null);
  assert.equal(r.rangePos, null);
});

test("no daily numbers: today's figures only, the rest blank", () => {
  const r = screenRow(AAPL, null, "2026-10-24");
  assert.equal(r.hasDaily, false);
  assert.equal(r.rsi, null);
  assert.equal(r.relVol, null);
  assert.ok(r.changePct < 0);
});

test("amounts as typed: 500k, 2.5m, 1b, 3%", () => {
  assert.equal(parseAmount("500k"), 500000);
  assert.equal(parseAmount("2.5M"), 2500000);
  assert.equal(parseAmount("1b"), 1e9);
  assert.equal(parseAmount("3%"), 3);
  assert.equal(parseAmount("-3"), -3);
  assert.equal(parseAmount("1,200"), 1200);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("screens read back: unknown fields and choices dropped", () => {
  const s = cleanScreen({ ranges: { price: { min: 5, max: null }, nonsense: { min: 1 }, rsi: { min: null, max: null } }, type: "weird", trend: "above3", sort: { key: "bogus" } });
  assert.deepEqual(s.ranges, { price: { min: 5, max: null } });
  assert.equal(s.type, "all");
  assert.equal(s.trend, "above3");
  assert.deepEqual(s.sort, EMPTY_SCREEN.sort);
  assert.deepEqual(cleanScreen(null).ranges, {});
});

test("filtering: percentages as typed, a missing figure fails its range, the choices", () => {
  const r = screenRow(AAPL, AAPL_DAILY, "2026-10-24");
  const base = cleanScreen({});
  assert.equal(passes(r, cleanScreen({ ranges: { changePct: { min: -1, max: 0 } } })), true);
  assert.equal(passes(r, cleanScreen({ ranges: { changePct: { min: 0, max: null } } })), false);
  assert.equal(passes(r, cleanScreen({ ranges: { marketCap: { min: 1e12, max: null } } })), true);
  assert.equal(passes(r, cleanScreen({ type: "funds" })), false);
  assert.equal(passes(r, cleanScreen({ exchange: "NYSE" })), false);
  assert.equal(passes(r, cleanScreen({ trend: "above3" })), true);
  assert.equal(passes(r, base), true);
  const bare = screenRow(AAPL, null, "2026-10-24");
  assert.equal(passes(bare, cleanScreen({ ranges: { rsi: { min: null, max: 100 } } })), false);
  assert.equal(needsDaily(cleanScreen({ ranges: { rsi: { min: 1, max: null } } })), true);
  assert.equal(needsDaily(cleanScreen({ ranges: { price: { min: 1, max: null } } })), false);
});

test("sorting: either way, blanks last", () => {
  const rows = [{ s: "a", v: 2 }, { s: "b", v: null }, { s: "c", v: 5 }, { s: "d", v: -1 }];
  assert.deepEqual(sortRows(rows, { key: "v", dir: "desc" }).map((r) => r.s), ["c", "a", "d", "b"]);
  assert.deepEqual(sortRows(rows, { key: "v", dir: "asc" }).map((r) => r.s), ["d", "a", "c", "b"]);
  assert.deepEqual(sortRows([{ s: "MSFT" }, { s: "AAPL" }], { key: "s", dir: "asc" }).map((r) => r.s), ["AAPL", "MSFT"]);
});

test("every ready-made screen is valid and sorts on a real field", () => {
  for (const p of PRESETS) {
    const s = presetScreen(p.id);
    assert.ok(FIELD[s.sort.key], `${p.id} sorts on ${s.sort.key}`);
    assert.ok(Object.keys(s.ranges).length > 0, p.id);
  }
  assert.equal(presetScreen("gapUp").ranges.gapPct.min, 3);
});

test("which shares get daily numbers: the most traded, from a dollar up, capped", () => {
  const rows = [
    { symbol: "A", price: 10, prevDollarVol: 5e6 }, { symbol: "B", price: 0.5, prevDollarVol: 9e9 },
    { symbol: "C", price: 50, prevDollarVol: 8e8 }, { symbol: "D", price: 5, prevDollarVol: null }
  ];
  assert.deepEqual(dailyCandidates(rows, 5), ["C", "A"]);
  assert.deepEqual(dailyCandidates(rows, 1), ["C"]);
});

test("big numbers", () => {
  assert.equal(bigNumber(40193051), "40.2M");
  assert.equal(bigNumber(5.07e12), "5.07T");
  assert.equal(bigNumber(1234), "1.2K");
  assert.equal(bigNumber(null), "—");
});

test("a past day at the open: the opening price, the gap and the pre-market; nothing the day had not done yet", () => {
  const u = {
    symbol: "ABC", name: "ABC Corp", exchange: "NASDAQ", price: 11, day: "2026-03-02", prevClose: 10, open: 11, high: null, low: null, close: null, volume: null, prevVolume: 2e6,
    lastDate: "2026-02-27", lastClose: 10, avgVol20: 1e6, avgDollar20: 9e6, atr14: 0.5, sma20: 9.5, d5: 9, d21: 8, pmVolume: 400000, pmLast: 11.2
  };
  const r = screenRow(u, partialStats(u), "2026-03-02");
  assert.equal(r.preOpen, false);
  assert.ok(Math.abs(r.gapPct - 0.1) < 1e-12);
  assert.ok(Math.abs(r.pmChangePct - 0.12) < 1e-12);
  assert.deepEqual([r.volume, r.relVol, r.rangePos, r.pmVolume, r.prevDollarVol], [null, null, null, 400000, 2e7]);
  assert.ok(Math.abs(r.vsSma20 - (11 / 9.5 - 1)) < 1e-12);
  assert.deepEqual([r.rsi, r.high52, r.fromHigh52], [null, null, null]);
  assert.equal(partialStats({}), null);
});

test("a past day at the close: the whole day against the norms of the days before", () => {
  const u = { symbol: "ABC", price: 12, day: "2026-03-02", prevClose: 10, open: 11, high: 12.5, low: 10.8, close: 12, volume: 3e6, prevVolume: 2e6, lastDate: "2026-02-27", lastClose: 10, avgVol20: 1e6, avgDollar20: 9e6 };
  const r = screenRow(u, partialStats(u), "2026-03-02");
  assert.ok(Math.abs(r.changePct - 0.2) < 1e-12);
  assert.deepEqual([r.relVol, r.dollarVol], [3, 36e6]);
});

test("what is known when: the open has no day's volume; the past has no live quote or calendar", () => {
  assert.deepEqual(["relVol", "gapPct", "pmVolume", "spreadPct", "earningsIn"].map((id) => fieldKnown(id, "live")), [true, true, false, true, true]);
  assert.deepEqual(["relVol", "gapPct", "pmVolume", "spreadPct", "earningsIn", "changePct"].map((id) => fieldKnown(id, "open")), [false, true, true, false, false, false]);
  assert.deepEqual(["relVol", "gapPct", "pmVolume", "changePct"].map((id) => fieldKnown(id, "close")), [true, true, true, true]);
  const known = (w) => PRESETS.filter((p) => presetKnown(p, w)).map((p) => p.id);
  assert.ok(known("open").includes("gapUp") && known("open").includes("pmGappers") && !known("open").includes("gainers"));
  assert.ok(!known("live").includes("pmGappers"));
  // Either way: a gap of 4% or more, up or down.
  const s = presetScreen("pmGappers");
  assert.equal(s.gapAbs, 4);
  const row = (gapPct) => ({ price: 5, prevDollarVol: 2e6, pmVolume: 2e5, gapPct, vsSma20: null });
  assert.deepEqual([passes(row(0.05), s), passes(row(-0.06), s), passes(row(0.02), s)], [true, true, false]);
});
