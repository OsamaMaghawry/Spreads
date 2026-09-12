import { test } from "node:test";
import assert from "node:assert/strict";
import { weekWindow, accountWeek, userWeek } from "./weeklyDigest.ts";
import { renderWeekly, money, DASH } from "./weeklyDigestEmail.ts";

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

test("the week is always a completed Monday to Friday", () => {
  // Saturday 12 Sep 2026 -> the week that just finished, Mon 7 to Fri 11.
  assert.deepEqual(weekWindow(new Date("2026-09-12T09:00:00Z")), { from: "2026-09-07", to: "2026-09-11" });
  // Sunday reports the same week, not a new one.
  assert.deepEqual(weekWindow(new Date("2026-09-13T09:00:00Z")), { from: "2026-09-07", to: "2026-09-11" });
  // Midweek -- a manual run or a retry -- reports the LAST finished week
  // rather than half of this one.
  assert.deepEqual(weekWindow(new Date("2026-09-16T09:00:00Z")), { from: "2026-09-07", to: "2026-09-11" });
  // Friday itself is that week's close.
  assert.deepEqual(weekWindow(new Date("2026-09-11T21:00:00Z")), { from: "2026-09-07", to: "2026-09-11" });
  // Monday reports the week before.
  assert.deepEqual(weekWindow(new Date("2026-09-14T09:00:00Z")), { from: "2026-09-07", to: "2026-09-11" });
});

test("consecutive weeks neither overlap nor leave a gap", () => {
  const a = weekWindow(new Date("2026-09-05T09:00:00Z"));
  const b = weekWindow(new Date("2026-09-12T09:00:00Z"));
  assert.equal(a.to, "2026-09-04");
  assert.equal(b.from, "2026-09-07");
  assert.ok(a.to < b.from);
});

// ---------------------------------------------------------------------------
// One account's week
// ---------------------------------------------------------------------------

const WIN = { from: "2026-09-07", to: "2026-09-11" };
const ACCT = { id: "acc-1", name: "Alton Live", is_paper: false };

// Friday before the window, then the week itself.
const ROWS = [
  { day: "2026-09-04", equity: 140000, premium_cum: 5000, shares_booked: 1200, shares_open: -400, shares_value: 36000, options_open: 100, performance: 5800 },
  { day: "2026-09-07", equity: 140500, premium_cum: 5300, shares_booked: 1200, shares_open: -300, shares_value: 36100, options_open: 110, performance: 6200 },
  { day: "2026-09-11", equity: 141562, premium_cum: 6100, shares_booked: 1459, shares_open: -206, shares_value: 36544, options_open: 30, performance: 7353 }
];

test("every portfolio figure is a subtraction between two stored days", () => {
  const w = accountWeek(ACCT, ROWS, [], WIN);
  // Measured from the FRIDAY BEFORE, not from Monday's close -- measuring from
  // Monday would silently drop Monday itself.
  assert.equal(w.measuredFrom, "2026-09-04");
  assert.equal(w.measuredTo, "2026-09-11");
  assert.equal(w.performance, 7353 - 5800);
  assert.equal(w.premiumLine, 6100 - 5000);
  assert.equal(w.sharesBooked, 1459 - 1200);
  assert.equal(w.sharesMark, -206 - -400);
  assert.equal(w.optionsMark, 30 - 100);
  assert.equal(w.equityChange, 141562 - 140000);
  assert.equal(w.equityEnd, 141562);
});

test("an account whose history starts inside the week reports the column itself", () => {
  // Its first week. There is no earlier row to difference against, and the
  // cumulative column IS the week's change.
  const w = accountWeek(ACCT, ROWS.slice(1), [], WIN);
  assert.equal(w.measuredFrom, null);
  assert.equal(w.performance, 7353);
});

test("a null on either end is null, never a number we did not have", () => {
  const withGap = [
    { ...ROWS[0], performance: null },
    ROWS[2]
  ];
  assert.equal(accountWeek(ACCT, withGap, [], WIN).performance, null);
  const endGap = [ROWS[0], { ...ROWS[2], performance: null }];
  assert.equal(accountWeek(ACCT, endGap, [], WIN).performance, null);
  // ...and the other columns still answer. One unpriced lot must not blank
  // the premium line, which does not depend on a price at all.
  assert.equal(accountWeek(ACCT, endGap, [], WIN).premiumLine, 1100);
});

test("the tickers that cost a day are named", () => {
  const rows = [ROWS[0], { ...ROWS[1], unpriced: ["MU"] }, { ...ROWS[2], unpriced: ["MU", "AAPL"] }];
  assert.deepEqual(accountWeek(ACCT, rows, [], WIN).unpriced, ["AAPL", "MU"]);
});

// ---------------------------------------------------------------------------
// Premium, in the two senses a trader means it
// ---------------------------------------------------------------------------

const TRADES = [
  // Opened and still open: a credit taken this week, not yet kept.
  { ticker: "TSLA", open_date: "2026-09-08", close_date: null, qty: 2, net_credit: 3.10 },
  // Closed this week: bought back for 0.40 having taken 2.00.
  { ticker: "NVDA", open_date: "2026-08-20", close_date: "2026-09-09", qty: 1, net_credit: 2.00,
    close_debit: 0.40, premium_pl: 160, early_close_pl: 0, stock_pl: 0, realized_pl: 160, close_reason: "closed" },
  // Expired worthless: nothing paid to close.
  { ticker: "MU", open_date: "2026-09-01", close_date: "2026-09-11", qty: 3, net_credit: 1.00,
    close_debit: 0, premium_pl: 300, early_close_pl: 0, stock_pl: 0, realized_pl: 300, close_reason: "expired" },
  // A BOUGHT position opened this week: negative net_credit is premium PAID
  // OUT, and folding it into "collected" would overstate the cash taken in.
  { ticker: "AAPL", open_date: "2026-09-10", close_date: null, qty: 1, net_credit: -4.50 },
  // Outside the window entirely.
  { ticker: "WMT", open_date: "2026-08-01", close_date: "2026-08-28", qty: 1, net_credit: 1.50,
    close_debit: 0.10, premium_pl: 140, realized_pl: 140, close_reason: "closed" },
  // Provisional: excluded from every outcome figure, as everywhere else.
  { ticker: "GME", open_date: "2026-09-08", close_date: "2026-09-10", qty: 5, net_credit: 9.99,
    close_debit: 0, premium_pl: 4995, realized_pl: 4995, provisional: true, close_reason: "expired" }
];

test("premium collected counts credits taken to open, in dollars", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  // 3.10 x 2 contracts x 100. The multiplier is the most common way a premium
  // figure comes out a hundred times too small.
  assert.equal(w.premium.collected, 620);
  // The bought AAPL position is premium PAID, not collected.
  assert.equal(w.premium.paidToOpen, 450);
});

test("premium paid to close is what buying back cost, and an expiry costs nothing", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  // NVDA 0.40 x 1 x 100 = 40; MU expired at 0.
  assert.equal(w.premium.paidToClose, 40);
});

test("premium kept is the outcome of what closed, not the cash flow", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  assert.equal(w.premium.kept, 160 + 300);
});

test("a provisional row reaches no outcome figure", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  assert.equal(w.closed.count, 2);
  assert.ok(!w.closed.rows.some((t) => t.ticker === "GME"));
  assert.equal(w.closed.realized, 460);
  // ...and its credit is not counted as collected either.
  assert.equal(w.premium.collected, 620);
});

test("trades outside the window are not in it", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  assert.ok(!w.closed.rows.some((t) => t.ticker === "WMT"));
  assert.equal(w.opened.count, 2);
});

// ---------------------------------------------------------------------------
// Across accounts
// ---------------------------------------------------------------------------

test("paper and live are never added together", () => {
  const live = accountWeek(ACCT, ROWS, TRADES, WIN);
  const paper = accountWeek({ id: "acc-2", name: "Practice", is_paper: true }, ROWS, TRADES, WIN);
  const w = userWeek([live, paper], WIN);
  assert.equal(w.live.accounts, 1);
  assert.equal(w.paper.accounts, 1);
  assert.equal(w.live.performance, 1553);
  assert.equal(w.paper.performance, 1553);
  // Two separate totals, and no third one adding simulated money to real.
  assert.ok(!("performance" in (w as Record<string, unknown>)));
});

test("a total containing an unvaluable account is null, not a partial sum", () => {
  const good = accountWeek(ACCT, ROWS, [], WIN);
  const bad = accountWeek({ id: "acc-3", name: "Other", is_paper: false }, [ROWS[0], { ...ROWS[2], performance: null }], [], WIN);
  assert.equal(userWeek([good, bad], WIN).live.performance, null);
});

// ---------------------------------------------------------------------------
// The email itself
// ---------------------------------------------------------------------------

const render = (accounts: ReturnType<typeof accountWeek>[]) =>
  renderWeekly(userWeek(accounts, WIN), { appUrl: "https://dashboard.deltamint.app" });

test("the subject carries the week and the number", () => {
  const { subject } = render([accountWeek(ACCT, ROWS, TRADES, WIN)]);
  assert.ok(subject.includes("Sep 7"));
  assert.ok(subject.includes("Sep 11"));
  assert.ok(subject.includes("+$1,553.00"), subject);
});

test("a paper-only reader is told so in the subject line", () => {
  const { subject, html } = render([accountWeek({ id: "p", name: "Practice", is_paper: true }, ROWS, TRADES, WIN)]);
  assert.ok(subject.includes("(paper)"), subject);
  assert.ok(html.includes("simulated"));
});

test("the email never advises", () => {
  const { html, text } = render([accountWeek(ACCT, ROWS, TRADES, WIN)]);
  for (const body of [html, text]) {
    // Scanned up to the disclosure, which necessarily contains the word
    // "recommendation" in order to disclaim one. Everything a reader takes as
    // the product's voice about their positions is before it.
    assert.ok(/not advice/i.test(body), "the disclosure is missing");
    const copy = body.split(/not advice/i)[0];
    for (const banned of [/\bshould\b/i, /\bconsider\b/i, /\brecommend/i, /\bsuggest/i, /\bopportunit/i, /\bbuy now\b/i, /\broll\b/i]) {
      assert.ok(!banned.test(copy), `advice-shaped wording in email: ${banned}`);
    }
  }
});

test("an unvaluable week renders a dash and says which ticker cost it", () => {
  const rows = [ROWS[0], { ...ROWS[2], performance: null, unpriced: ["MU"] }];
  const { html } = render([accountWeek(ACCT, rows, TRADES, WIN)]);
  assert.ok(html.includes(DASH));
  assert.ok(html.includes("MU"));
  assert.ok(/could not be valued/i.test(html));
});

test("a review copy says whose account it is, at the top", () => {
  const w = userWeek([accountWeek(ACCT, ROWS, TRADES, WIN)], WIN);
  const { html } = renderWeekly(w, { previewFor: "someone@example.com" });
  assert.ok(html.includes("REVIEW COPY"));
  assert.ok(html.includes("someone@example.com"));
  assert.ok(html.includes("has not been sent to them"));
  // It must be before any figure, or the owner reads another account as his.
  assert.ok(html.indexOf("REVIEW COPY") < html.indexOf("Your positions this week"));
});

test("a quiet week is short and does not print a grid of zeroes", () => {
  const empty = accountWeek(ACCT, [{ day: "2026-09-11", performance: 0, equity: 1000, shares_value: 0, options_open: 0 }], [], WIN);
  assert.equal(empty.quiet, true);
  const { subject, html } = render([empty]);
  assert.ok(subject.includes("nothing traded"));
  assert.ok(!html.includes("Premium</div>"));
});

test("money formats to the cent, signs only where asked, and dashes a null", () => {
  assert.equal(money(1553), "$1,553.00");
  assert.equal(money(1553, true), "+$1,553.00");
  assert.equal(money(-206), "-$206.00");
  assert.equal(money(-206, true), "-$206.00");
  assert.equal(money(null), DASH);
  assert.equal(money(undefined), DASH);
  assert.equal(money(NaN), DASH);
  assert.equal(money(0, true), "+$0.00");
});

test("an address is escaped rather than interpolated into the markup", () => {
  const w = userWeek([accountWeek(ACCT, ROWS, [], WIN)], WIN);
  const { html } = renderWeekly(w, { previewFor: '"><script>alert(1)</script>' });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

// ---------------------------------------------------------------------------
// Connected but never measured
//
// Found on staging before the first send: of eight accounts, five have trade
// records and NO `account_equity_daily` rows at all, because that series is
// built the first time somebody opens the account's history and nobody ever
// opened those. One user has 128 trades and no series whatsoever.
//
// Treated as "could not be priced" it drags every total to a dash; treated as
// zero it is a silent omission inside a figure presented as complete. It is
// neither, so it is its own state.
// ---------------------------------------------------------------------------

test("an account with no stored history is not measured, and says so", () => {
  const w = accountWeek({ id: "never", name: "Alpaca Live (603453690)", is_paper: false }, [], TRADES, WIN);
  assert.equal(w.measured, false);
  assert.equal(w.performance, null);
  // ...but its TRADES still count. A trade is recorded whether or not anybody
  // has built that account's daily series.
  assert.equal(w.closed.count, 2);
  assert.equal(w.premium.collected, 620);
});

test("an unmeasured account neither nulls the portfolio total nor is added to it", () => {
  const real = accountWeek(ACCT, ROWS, TRADES, WIN);
  const never = accountWeek({ id: "never", name: "Alpaca Live (603453690)", is_paper: false }, [], TRADES, WIN);
  const w = userWeek([real, never], WIN);
  // The portfolio figure is the measured account's, not a dash.
  assert.equal(w.live.performance, 1553);
  assert.equal(w.live.accounts, 1);
  assert.deepEqual(w.live.unmeasured, ["Alpaca Live (603453690)"]);
  // The trade figures cover BOTH, because both really traded.
  assert.equal(w.live.closed, 4);
  assert.equal(w.live.premiumCollected, 1240);
});

test("the email names the account it left out of the portfolio figures", () => {
  const real = accountWeek(ACCT, ROWS, TRADES, WIN);
  const never = accountWeek({ id: "never", name: "Alpaca Live (603453690)", is_paper: false }, [], TRADES, WIN);
  const { html } = renderWeekly(userWeek([real, never], WIN), {});
  assert.ok(html.includes("Not in the portfolio figures above"));
  assert.ok(html.includes("Alpaca Live (603453690)"));
  assert.ok(/no stored day-by-day history/.test(html));
  // ...and does not claim the portfolio was unreadable.
  assert.ok(html.includes("$141,562.00"), "the measured account's value should still show");
});
