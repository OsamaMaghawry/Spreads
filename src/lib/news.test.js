import test from "node:test";
import assert from "node:assert/strict";
import { newsSymbol, nyAt, gapWindow, liveWindow, bySymbol, mergeNews, visibleAt, ago } from "./news.js";

const iso = (t) => new Date(t * 1000).toISOString();
const a = (id, at, symbols) => ({ id, at, headline: `#${id}`, symbols });

test("New York times, and the gap's window: the close before to the open, or to the close", () => {
  assert.equal(iso(nyAt("2026-10-23", "09:30")), "2026-10-23T13:30:00.000Z");
  assert.equal(iso(nyAt("2026-12-04", "16:00")), "2026-12-04T21:00:00.000Z");
  const w = gapWindow("2026-10-26", "2026-10-23", "open");
  assert.deepEqual([iso(w.start), iso(w.end)], ["2026-10-23T20:00:00.000Z", "2026-10-26T13:30:00.000Z"]);
  assert.equal(iso(gapWindow("2026-10-26", "2026-10-23", "close").end), "2026-10-26T20:00:00.000Z");
  // Across the clocks going back (1 Nov 2026): Friday's close in summer time, Monday's open in winter time.
  const dst = gapWindow("2026-11-02", "2026-10-30", "open");
  assert.deepEqual([iso(dst.start), iso(dst.end)], ["2026-10-30T20:00:00.000Z", "2026-11-02T14:30:00.000Z"]);
});

test("the live screen's window starts at the last weekday's close before today", () => {
  const sunday = Date.parse("2026-10-25T15:00:00Z") / 1000;
  assert.equal(iso(liveWindow(sunday).start), "2026-10-23T20:00:00.000Z");
  const monday = Date.parse("2026-10-26T14:00:00Z") / 1000;
  assert.deepEqual([iso(liveWindow(monday).start), liveWindow(monday).end], ["2026-10-23T20:00:00.000Z", monday]);
  const wednesday = Date.parse("2026-10-28T12:00:00Z") / 1000;
  assert.equal(iso(liveWindow(wednesday).start), "2026-10-27T20:00:00.000Z");
});

test("articles by symbol: one naming several counts for each; coins by their pair", () => {
  const list = [a(1, "2026-10-23T12:00:00Z", ["AAPL", "MSFT"]), a(2, "2026-10-23T13:00:00Z", ["AAPL"]), a(3, "2026-10-23T14:00:00Z", ["BTCUSD"])];
  const by = bySymbol(list, ["AAPL", "MSFT", "TSLA", "BTC/USD"]);
  assert.deepEqual(Object.fromEntries(Object.entries(by).map(([s, l]) => [s, l.map((x) => x.id)])), { AAPL: [1, 2], MSFT: [1], TSLA: [], "BTC/USD": [3] });
  assert.equal(newsSymbol("eth/usd"), "ETHUSD");
});

test("a replay shows only what had come out before its moment; lists merge newest first, once each", () => {
  const list = mergeNews([a(1, "2026-03-26T12:00:00Z", []), a(2, "2026-03-26T14:00:00Z", [])], [a(2, "2026-03-26T14:00:00Z", []), a(3, "2026-03-26T13:00:00Z", [])]);
  assert.deepEqual(list.map((x) => x.id), [2, 3, 1]);
  const cursor = Date.parse("2026-03-26T13:30:00Z") / 1000;
  assert.deepEqual(visibleAt(list, cursor).map((x) => x.id), [3, 1]);
  assert.equal(visibleAt(list, null), list);
  assert.deepEqual([ago("2026-03-26T13:00:00Z", cursor), ago("2026-03-26T10:00:00Z", cursor), ago("2026-03-24T10:00:00Z", cursor)], ["30m", "3h", "2d"]);
});
