import { test } from "node:test";
import assert from "node:assert/strict";
import { cboeOpenInterest, mergeOpenInterest } from "./openInterest.ts";

// As read on 10 Nov 2026 (QQQ, Nov 20 expiry): Alpaca's open interest dated
// Friday 6 Nov, Cboe's file already Monday's.
const listed = [
  { symbol: "QQQ261120P00667000", open_interest: "39", open_interest_date: "2026-11-06" },
  { symbol: "QQQ261120P00675000", open_interest: "23969", open_interest_date: "2026-11-06" },
  { symbol: "QQQ261120C00680000", open_interest: "31350", open_interest_date: "2026-11-06" },
  { symbol: "QQQ261120P00680000", open_interest: "76206", open_interest_date: "2026-11-06" }
];
const file = { timestamp: "2026-11-10 14:04:18", data: { options: [
  { option: "QQQ261120P00667000", open_interest: 4125.0 },
  { option: "QQQ261120P00675000", open_interest: 30808.0 },
  { option: "QQQ261120C00680000", open_interest: 32477.0 },
  { option: "QQQ261120P00680000", open_interest: 76345.0 },
  { option: "QQQ261109C00670000", open_interest: 7230.0 }
] } };

test("Cboe's file read into open interest by option symbol", () => {
  const m = cboeOpenInterest(file);
  assert.equal(m.get("QQQ261120P00667000"), 4125);
  assert.equal(m.size, 5);
  assert.equal(cboeOpenInterest({ data: { options: [] } }), null);
  assert.equal(cboeOpenInterest("<html>"), null);
});

test("newer figures from Cboe: dated the session after Alpaca's", () => {
  const r = mergeOpenInterest(listed, cboeOpenInterest(file), ["2026-11-05", "2026-11-06", "2026-11-09"]);
  assert.equal(r.source, "cboe");
  assert.equal(r.alpacaDate, "2026-11-06");
  assert.equal(r.date, "2026-11-09");
  assert.equal(r.oiOf(listed[0]), 4125);
  assert.equal(r.matched, 4);
  assert.equal(r.differ, 4);
  // No session list: the weekday after (Friday → Monday).
  assert.equal(mergeOpenInterest(listed, cboeOpenInterest(file)).date, "2026-11-09");
});

test("the same figures: Alpaca's date; a contract the file lacks keeps Alpaca's", () => {
  const same = new Map(listed.slice(1).map((c) => [c.symbol, Number(c.open_interest)]));
  same.set("QQQ261120P00667000", 39);
  const r = mergeOpenInterest([...listed, { symbol: "QQQ261120C00690000", open_interest: "12", open_interest_date: "2026-11-06" }], same, ["2026-11-09"]);
  assert.equal(r.source, "cboe");
  assert.equal(r.date, "2026-11-06");
  assert.equal(r.oiOf({ symbol: "QQQ261120C00690000", open_interest: "12" }), 12);
});

test("no file, or one covering under half the contracts: Alpaca's throughout", () => {
  const none = mergeOpenInterest(listed, null);
  assert.equal(none.source, "alpaca");
  assert.equal(none.date, "2026-11-06");
  assert.equal(none.oiOf(listed[0]), 39);
  const thin = mergeOpenInterest(listed, new Map([["QQQ261120P00667000", 4125]]));
  assert.equal(thin.source, "alpaca");
  assert.equal(thin.oiOf(listed[0]), 39);
});
