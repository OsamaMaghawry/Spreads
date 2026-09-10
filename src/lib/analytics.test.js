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

test("no figure that classifies a trade counts an unfinished one, and none of them reads zero", () => {
  // The screen the bench reproduced: two settled winners and one assignment
  // still holding shares thousands of dollars underwater. Applying the
  // settled-only rule to some of the figures and not the rest produced, on one
  // page, "Win rate 100% · Largest loss $0.00" beside a five-figure realized
  // loss -- and every mixed figure erred flattering.
  const win = trade({ open: "2026-03-01", close: "2026-03-10", pl: 150 });
  const win2 = trade({ open: "2026-03-02", close: "2026-03-11", pl: 150 });
  const notFinal = { ...trade({ open: "2026-03-03", close: "2026-03-12", pl: -6200 }), provisional: true };

  const s = computeStats([win, win2, notFinal], 10000);

  // Money: every row.
  assert.equal(s.totalPL, -5900);
  assert.equal(s.trades, 3);
  assert.equal(s.maxDrawdown, 6200);

  // Outcome: settled only, and no settled loss exists to report.
  assert.equal(s.winRate, 1);
  assert.equal(s.largestLoss, null, "not $0.00 — there is no settled loss, which is not the same as a loss of zero");
  assert.equal(s.avgLoss, null);
  assert.equal(s.largestWin, 150);

  // The breakdown tables ask the same question and must answer it the same way.
  const march = s.byMonth.find((m) => m.month === "2026-03");
  assert.equal(march.trades, 3, "P/L covers every row");
  assert.equal(march.settled, 2, "the win rate's denominator does not");
  assert.equal(march.wins, 2);
  assert.equal(march.pl, -5900);
});

// ---------------------------------------------------------------------------
// The view drives every figure
//
// The owner: "When I say whole view, everything should be whole view. What's
// difficult about this?" These are the tests that make the switch real rather
// than cosmetic — before them, every figure below read `realized_pl` whichever
// way it was flipped.
// ---------------------------------------------------------------------------

// A wheel put: the option leg was a clean credit, the shares it delivered lost
// more than the credit was worth. Whole view calls it a loss; Premium only
// calls it a win. Both are true statements about different questions, and the
// page must not report one under the other's label.
const wheelPut = {
  open_date: "2026-01-02",
  close_date: "2026-01-10",
  premium_pl: 400,
  early_close_pl: 0,
  stock_pl: -1500,
  realized_pl: -1100,
  net_credit: 4,
  qty: 1,
  short_strike: 100,
  short_symbol: "S",
  ticker: "X",
  close_reason: "assigned"
};

test("win rate follows the view", () => {
  const whole = computeStats([wheelPut], 0, "whole");
  const premium = computeStats([wheelPut], 0, "premium");
  assert.equal(whole.winRate, 0);
  assert.equal(premium.winRate, 1);
  assert.equal(whole.totalPL, -1100);
  assert.equal(premium.totalPL, 400);
});

test("largest win, largest loss and payoff all follow the view", () => {
  const whole = computeStats([wheelPut], 0, "whole");
  const premium = computeStats([wheelPut], 0, "premium");
  assert.equal(whole.largestLoss, -1100);
  assert.equal(whole.largestWin, null);
  assert.equal(premium.largestWin, 400);
  assert.equal(premium.largestLoss, null);
});

test("the month and ticker tables follow the view", () => {
  const whole = computeStats([wheelPut], 0, "whole");
  const premium = computeStats([wheelPut], 0, "premium");
  assert.equal(whole.byMonth[0].pl, -1100);
  assert.equal(premium.byMonth[0].pl, 400);
  assert.equal(whole.byTicker[0].pl, -1100);
  assert.equal(premium.byTicker[0].pl, 400);
  // And the win column inside them agrees with the headline win rate.
  assert.equal(whole.byMonth[0].wins, 0);
  assert.equal(premium.byMonth[0].wins, 1);
});

test("the mark on shares still held joins the money figures and nothing else", () => {
  const s = computeStats([wheelPut], 10000, "whole", { unrealized: 2500 });
  assert.equal(s.bookedPL, -1100);
  assert.equal(s.unrealizedPL, 2500);
  assert.equal(s.totalPL, 1400);
  assert.equal(s.includesUnrealized, true);
  assert.equal(s.roe, 1400 / 10000);
  // The outcome statistics are untouched by an open position.
  assert.equal(s.winRate, 0);
  assert.equal(s.largestWin, null);
});

test("Premium only refuses the mark even when it is handed one", () => {
  // The switch must not be able to produce a premium headline with share
  // appreciation inside it.
  const s = computeStats([wheelPut], 10000, "premium", { unrealized: 2500 });
  assert.equal(s.unrealizedPL, null);
  assert.equal(s.includesUnrealized, false);
  assert.equal(s.totalPL, 400);
});

test("credit capture stays on the option legs in both views", () => {
  // Capture asks what share of the premium sold was kept. Fold the assigned
  // shares in and the ratio can exceed its own maximum, which measures nothing.
  const whole = computeStats([wheelPut], 0, "whole");
  const premium = computeStats([wheelPut], 0, "premium");
  assert.equal(whole.captureRate, 400 / 400);
  assert.equal(premium.captureRate, 400 / 400);
});

test("drawdown comes from the daily series when there is one", () => {
  // Booked trade by trade, a position that fell $9,000 and recovered registers
  // nothing at all, because no trade closed while it happened.
  const points = [
    { date: "2026-01-02", value: 0 },
    { date: "2026-01-05", value: 3000 },
    { date: "2026-01-06", value: -6000 },
    { date: "2026-01-10", value: 1000 }
  ];
  const withDaily = computeStats([wheelPut], 0, "whole", { dailyPoints: points });
  assert.equal(withDaily.maxDrawdown, 9000);
  assert.equal(withDaily.drawdownFromDaily, true);

  const without = computeStats([wheelPut], 0, "whole");
  assert.equal(without.drawdownFromDaily, false);
  assert.equal(without.maxDrawdown, 1100);
});

test("a day the book could not be valued is skipped, not read as zero", () => {
  // Reading a null as zero would manufacture the deepest drawdown on the chart.
  const points = [
    { date: "2026-01-02", value: 5000 },
    { date: "2026-01-05", value: null },
    { date: "2026-01-06", value: 4000 }
  ];
  const s = computeStats([wheelPut], 0, "whole", { dailyPoints: points });
  assert.equal(s.maxDrawdown, 1000);
});

test("per-day figures measure booked cash, never the mark", () => {
  const s = computeStats([wheelPut], 10000, "whole", { unrealized: 2500 });
  // One closing day, -$1,100 booked on it. The $2,500 mark belongs to no day.
  assert.equal(s.avgDayPL, -1100);
  assert.equal(s.bestDay.pl, -1100);
});

test("the default view is whole, so an un-passed call behaves as before", () => {
  const a = computeStats([wheelPut], 5000);
  const b = computeStats([wheelPut], 5000, "whole");
  assert.equal(a.totalPL, b.totalPL);
  assert.equal(a.view, "whole");
});
