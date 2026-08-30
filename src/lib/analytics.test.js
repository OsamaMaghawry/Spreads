// The bench's finding: the single most-quoted figure in the P/L work -- peak
// concurrent capital at risk -- rested on a one-character comparator with zero
// coverage, and nothing would have caught it being flipped back.
//
//   node --test src/lib/analytics.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { computeStats } from "./analytics.js";

const trade = ({ open, close, credit = 0.5, pl = 0, width = 5, qty = 1 }) => ({
  open_date: open,
  close_date: close,
  realized_pl: pl,
  net_credit: credit,
  qty,
  short_strike: 100,
  long_strike: 100 - width,
  long_symbol: "L",
  ticker: "X",
  close_reason: "closed"
});

test("a same-day trade still counts toward peak risk", () => {
  // Sorting closes before opens released collateral before the position
  // needing it was on, so a trade opened and closed the same day contributed
  // exactly zero however much it tied up.
  const s = computeStats(
    [trade({ open: "2026-01-05", close: "2026-01-05" }), trade({ open: "2026-01-05", close: "2026-01-10" })],
    10000
  );
  assert.equal(s.peakRisk, 900, "both positions were on together");
});

test("capital at risk never goes negative", () => {
  // The proof the old ordering was wrong: on real data the running total
  // reached -$61,440, an impossible amount of capital at risk.
  const trades = [];
  for (let i = 0; i < 40; i++) {
    const d = `2026-02-${String((i % 20) + 1).padStart(2, "0")}`;
    trades.push(trade({ open: d, close: d, pl: i % 3 ? 40 : -60 }));
  }
  const s = computeStats(trades, 50000);
  assert.ok(s.peakRisk > 0, "peak must be positive");
  assert.ok(s.peakRisk >= 450, "at least one position's collateral");
});

test("sequential trades reusing collateral are not double counted", () => {
  const s = computeStats(
    [trade({ open: "2026-01-05", close: "2026-01-10" }), trade({ open: "2026-01-11", close: "2026-01-20" })],
    10000
  );
  assert.equal(s.peakRisk, 450, "never on at the same time");
});

test("annualized figures are withheld below 30 trades or 90 days", () => {
  const small = computeStats([trade({ open: "2026-01-05", close: "2026-01-10", pl: 50 })], 10000);
  assert.equal(small.annualizable, false);
  assert.equal(small.annualized, null);
  assert.equal(small.cagr, null);
});

test("and shown once the sample supports them", () => {
  const trades = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i * 4)).toISOString().slice(0, 10);
    trades.push(trade({ open: day, close: day, pl: 20 }));
  }
  const s = computeStats(trades, 10000);
  assert.equal(s.annualizable, true);
  assert.ok(s.annualized !== null && s.cagr !== null);
});
