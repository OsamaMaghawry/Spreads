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
  short_symbol: "S",
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

test("a lone long option risks only what was paid for it", () => {
  // short_strike 0 with a long_symbol read as a 470-wide spread:
  // (470 + 2.72) x 100 = $47,272 of risk for a $272 position.
  const orphanLong = {
    open_date: "2026-03-01", close_date: "2026-03-10", realized_pl: -100,
    net_credit: -2.72, qty: 1, short_strike: 0, long_strike: 470,
    short_symbol: "", long_symbol: "AMD260828C00470000", ticker: "AMD", close_reason: "closed"
  };
  const s = computeStats([orphanLong], 10000);
  assert.equal(s.totalRisk, 272, "the premium paid, not the strike");
  assert.equal(s.peakRisk, 272);
});

test("a position still holding its shares is in the totals but not the win rate", () => {
  // The option leg is booked at +$150 of premium; the shares that will decide
  // the rest of the row are still open, and on an assignment they usually
  // decide it downwards. Counted as a win, the page reads 100% and then
  // corrects itself later -- the worst possible order to learn it in.
  const settledWin = trade({ open: "2026-03-01", close: "2026-03-10", pl: 200 });
  const settledLoss = trade({ open: "2026-03-02", close: "2026-03-11", pl: -100 });
  const notFinal = { ...trade({ open: "2026-03-03", close: "2026-03-12", pl: 150 }), provisional: true };

  const s = computeStats([settledWin, settledLoss, notFinal], 10000);

  assert.equal(s.totalPL, 250, "the cash already booked stays in the total");
  assert.equal(s.trades, 3, "and the position is still a position");
  assert.equal(s.settledTrades, 2);
  assert.equal(s.provisionalTrades, 1);
  assert.equal(s.winRate, 0.5, "one settled win of two, not two of three");
  assert.equal(s.wins, 1);
  assert.equal(s.avgPL, 50, "expectancy over settled results only");
  assert.equal(s.profitFactor, 2);
  assert.equal(s.largestWin, 200, "not the unfinished +$150 row if it were larger");
  assert.equal(s.bestStreak, 1, "an unfinished row cannot extend a winning streak");
});

test("with nothing settled yet the outcome figures are withheld, not zero", () => {
  const notFinal = { ...trade({ open: "2026-03-03", close: "2026-03-12", pl: 150 }), provisional: true };
  const s = computeStats([notFinal], 10000);
  assert.equal(s.totalPL, 150);
  assert.equal(s.winRate, null, "0% would be a claim; there is no settled trade to make it about");
  assert.equal(s.avgPL, null);
});
