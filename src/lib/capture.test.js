// The owner's capture table printed -$8,067 under "early exits", two thirds
// of it spreads bought back in the last half hour of expiry day.
//
//   node --test src/lib/capture.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { captureBreakdown, exitedEarly, tradeLabel } from "./capture.js";

// Shapes and figures from the account that raised it.
const arkk = {
  ticker: "ARKK", strategy: "spreads", qty: 8, net_credit: 0.22, close_debit: 3.02,
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

test("a buyback on expiry day is the expiry outcome, not an early exit", () => {
  assert.equal(exitedEarly(arkk), false);
  assert.equal(exitedEarly(tslaCall), true);
  assert.equal(exitedEarly(expired), false);
  assert.equal(exitedEarly(assigned), false);
  // Timestamps and dates compare by day.
  assert.equal(exitedEarly({ ...arkk, close_date: "2026-08-21T19:34:51Z" }), false);
  assert.equal(exitedEarly({ ...arkk, close_date: "2026-08-20" }), true);
});

test("the loss row holds only trades closed before expiry day, worst first, with the trades themselves", () => {
  const b = captureBreakdown([arkk, tslaCall, longCall, assigned, expired]);
  const loss = b.buckets[0];
  assert.equal(loss.trades, 1);
  assert.equal(loss.rows[0].trade, tslaCall);
  assert.equal(loss.pl, -1832);
  assert.equal(b.early.trades, 1);
  // ARKK, the assigned put and the expired spread.
  assert.equal(b.held.trades, 3);
  assert.equal(b.held.pl, -2240 + 144 + 50);
  // Held to expiry no longer reads a perfect 100% while its losses sit elsewhere.
  assert.ok(b.held.weighted < 0);
});

test("the table adds up to the booked total, shares and bought options included", () => {
  const all = [arkk, tslaCall, longCall, assigned, expired];
  const { reconcile: r } = captureBreakdown(all);
  assert.equal(r.bought, 1182);
  assert.equal(r.shares, 1258.91);
  assert.ok(Math.abs(r.total - all.reduce((a, t) => a + t.realized_pl, 0)) < 1e-9);
  assert.ok(Math.abs(r.early + r.held + r.bought + r.shares - r.total) < 1e-9);
  assert.equal(r.adds, true);
});

test("a stored total that is not its own parts hides the line rather than print a sum that does not add", () => {
  const { reconcile: r } = captureBreakdown([{ ...expired, realized_pl: 80 }]);
  assert.equal(r.adds, false);
});

test("labels name ticker, strikes and right", () => {
  assert.equal(tradeLabel(arkk), "ARKK 82/85 C");
  assert.equal(tradeLabel(tslaCall), "TSLA 362.5 C");
  assert.equal(tradeLabel(assigned), "TSLA 362.5 P");
  assert.equal(tradeLabel(longCall), "TSLA 352.5 C");
});
