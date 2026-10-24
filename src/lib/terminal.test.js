import test from "node:test";
import assert from "node:assert/strict";
import { bucketStart, nyMidnight, applyTrade, applyMinuteBar, tapeRow, pushTape, TAPE_MAX, cleanWatchlist, readWatchlist, DEFAULT_WATCHLIST, px, pctText, sizeText } from "./terminal.js";

const sec = (iso) => Date.parse(iso) / 1000;

test("candles start on the interval; a daily candle at New York midnight", () => {
  assert.equal(bucketStart(sec("2026-10-22T14:07:31Z"), "5Min"), sec("2026-10-22T14:05:00Z"));
  assert.equal(bucketStart(sec("2026-10-22T14:07:31Z"), "1Hour"), sec("2026-10-22T14:00:00Z"));
  // Daylight time: midnight is 04:00 UTC; standard time: 05:00 UTC.
  assert.equal(nyMidnight(sec("2026-10-22T19:00:00Z")), sec("2026-10-22T04:00:00Z"));
  assert.equal(nyMidnight(sec("2026-12-22T19:00:00Z")), sec("2026-12-22T05:00:00Z"));
  // 1am UTC is still the previous evening in New York.
  assert.equal(nyMidnight(sec("2026-10-23T01:00:00Z")), sec("2026-10-22T04:00:00Z"));
});

test("a trade extends the current candle, opens the next, and a late print changes nothing", () => {
  const last = { time: sec("2026-10-22T14:05:00Z"), open: 100, high: 101, low: 99.5, close: 100.5, volume: 300 };
  const same = applyTrade(last, { price: 101.4, size: 50, at: "2026-10-22T14:08:00Z" }, "5Min");
  assert.deepEqual(same, { ...last, high: 101.4, close: 101.4, volume: 350 });
  const next = applyTrade(last, { price: 99, size: 10, at: "2026-10-22T14:10:01Z" }, "5Min");
  assert.deepEqual(next, { time: sec("2026-10-22T14:10:00Z"), open: 99, high: 99, low: 99, close: 99, volume: 10 });
  assert.equal(applyTrade(last, { price: 98, size: 10, at: "2026-10-22T14:01:00Z" }, "5Min"), null);
  assert.equal(applyTrade(last, { price: 0, size: 10, at: "2026-10-22T14:08:00Z" }, "5Min"), null);
});

test("the feed's minute bar replaces the trade-built one, on a one-minute chart only", () => {
  const bar = { t: "2026-10-22T14:07:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 900 };
  assert.deepEqual(applyMinuteBar(null, bar, "1Min"), { time: sec("2026-10-22T14:07:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 900 });
  assert.equal(applyMinuteBar(null, bar, "5Min"), null);
});

test("tape: buyer at the ask, seller at the bid, newest first, capped", () => {
  const q = { bid: 100, ask: 100.05 };
  assert.equal(tapeRow({ price: 100.05, size: 10, at: "x" }, q).side, "buy");
  assert.equal(tapeRow({ price: 100, size: 10, at: "x" }, q).side, "sell");
  assert.equal(tapeRow({ price: 100.02, size: 10, at: "x" }, q).side, "mid");
  let rows = [];
  for (let i = 0; i < TAPE_MAX + 5; i++) rows = pushTape(rows, { id: i });
  assert.equal(rows.length, TAPE_MAX);
  assert.equal(rows[0].id, TAPE_MAX + 4);
});

test("watchlist: symbols only, no repeats, the default when empty or broken", () => {
  assert.deepEqual(cleanWatchlist(["aapl", "AAPL", "bad symbol", "tsla"]), ["AAPL", "TSLA"]);
  assert.deepEqual(readWatchlist("not json"), DEFAULT_WATCHLIST);
  assert.deepEqual(readWatchlist("[]"), DEFAULT_WATCHLIST);
  assert.deepEqual(readWatchlist('["spy"]'), ["SPY"]);
});

test("formatting", () => {
  assert.equal(px(344.1), "344.10");
  assert.equal(px(0.12345), "0.1235");
  assert.equal(px(null), "—");
  assert.equal(pctText(0.0123), "+1.23%");
  assert.equal(sizeText(1234567), "1.2M");
  assert.equal(sizeText(45678), "46K");
});
