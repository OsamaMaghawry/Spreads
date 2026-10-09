// "How your trades ended" must add up to the account's booked total — the
// table it replaced never did, which is why its -$8,067 could not be placed.
//
//   node --test src/lib/tradeEndings.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { endingOf, tradeEndings, tradeLabel } from "./tradeEndings.js";

// Shapes and figures from the account that raised it.
const arkk = {
  ticker: "ARKK", strategy: "spreads", qty: 8, net_credit: 0.22,
  short_symbol: "ARKK260821C00082000", long_symbol: "ARKK260821C00085000", short_strike: 82, long_strike: 85,
  open_date: "2026-08-18", close_date: "2026-08-21", expiry: "2026-08-21", close_reason: "closed",
  premium_pl: 176, early_close_pl: -2416, stock_pl: 0, realized_pl: -2240
};
const tslaCall = {
  ticker: "TSLA", strategy: "covered_call", qty: 2, net_credit: 8.69,
  short_symbol: "TSLA260918C00362500", long_symbol: "", short_strike: 362.5, long_strike: 0,
  open_date: "2026-09-08", close_date: "2026-09-09", expiry: "2026-09-18", close_reason: "closed",
  premium_pl: 1738, early_close_pl: -3570, stock_pl: 0, realized_pl: -1832
};
const longCall = {
  ticker: "TSLA", strategy: "long_call", qty: 1, net_credit: -13.57,
  short_symbol: "", long_symbol: "TSLA260918C00352500", short_strike: 0, long_strike: 352.5,
  open_date: "2026-09-08", close_date: "2026-09-09", expiry: "2026-09-18", close_reason: "closed",
  premium_pl: -1357, early_close_pl: 2539, stock_pl: 0, realized_pl: 1182
};
const assigned = {
  ticker: "TSLA", strategy: "cash_secured_put", qty: 1, net_credit: 1.44,
  short_symbol: "TSLA260904P00362500", long_symbol: "", short_strike: 362.5,
  open_date: "2026-09-03", close_date: "2026-09-07", expiry: "2026-09-04", close_reason: "assigned",
  premium_pl: 144, early_close_pl: 0, stock_pl: 1258.91, realized_pl: 1402.91
};
const expired = {
  ticker: "SPY", strategy: "spreads", qty: 1, net_credit: 0.5,
  short_symbol: "SPY260918P00600000", long_symbol: "SPY260918P00595000", short_strike: 600, long_strike: 595,
  open_date: "2026-09-10", close_date: "2026-09-18", expiry: "2026-09-18", close_reason: "expired",
  premium_pl: 50, early_close_pl: 0, stock_pl: 0, realized_pl: 50
};
const all = [arkk, tslaCall, longCall, assigned, expired];

test("each trade lands in one ending", () => {
  assert.equal(endingOf(arkk), "expiryDay");
  assert.equal(endingOf({ ...arkk, close_date: "2026-08-21T19:34:51Z" }), "expiryDay");
  assert.equal(endingOf({ ...arkk, close_date: "2026-08-20" }), "early");
  assert.equal(endingOf(tslaCall), "early");
  assert.equal(endingOf(longCall), "bought");
  assert.equal(endingOf(assigned), "assigned");
  assert.equal(endingOf(expired), "expired");
  assert.equal(endingOf({ ...expired, close_reason: "something_new" }), "other");
});

test("the rows add up to the booked total, trade for trade", () => {
  const e = tradeEndings(all);
  assert.equal(e.count, all.length);
  assert.equal(e.rows.reduce((a, r) => a + r.count, 0), all.length);
  assert.ok(Math.abs(e.total - all.reduce((a, t) => a + t.realized_pl, 0)) < 1e-9);
  // Empty endings are not printed.
  assert.deepEqual(e.rows.map((r) => r.key), ["expired", "assigned", "expiryDay", "early", "bought"]);
});

test("the premium view counts option legs alone, so the total matches that view's headline", () => {
  const e = tradeEndings(all, "premium");
  const assignedRow = e.rows.find((r) => r.key === "assigned");
  assert.equal(assignedRow.pl, 144);
  assert.ok(Math.abs(e.total - (176 - 2416 + 1738 - 3570 - 1357 + 2539 + 144 + 50)) < 1e-9);
});

test("each row lists its trades worst first and counts its losers", () => {
  const e = tradeEndings([...all, { ...tslaCall, realized_pl: 200 }]);
  const early = e.rows.find((r) => r.key === "early");
  assert.equal(early.count, 2);
  assert.equal(early.losers, 1);
  assert.equal(early.trades[0].pl, -1832);
});

test("labels name ticker, strikes and right", () => {
  assert.equal(tradeLabel(arkk), "ARKK 82/85 C");
  assert.equal(tradeLabel(tslaCall), "TSLA 362.5 C");
  assert.equal(tradeLabel(longCall), "TSLA 352.5 C");
});
