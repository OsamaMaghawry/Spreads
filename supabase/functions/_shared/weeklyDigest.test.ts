import { test } from "node:test";
import assert from "node:assert/strict";
import { weekWindow, accountWeek } from "./weeklyDigest.ts";
import { renderAccountWeek, money, DASH } from "./weeklyDigestEmail.ts";

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

// One account, one email. The helper takes a list only because the tests that
// predate the split still hand one over; it renders the first, which is the
// account under test.
const render = (accounts: ReturnType<typeof accountWeek>[]) =>
  renderAccountWeek(accounts[0], WIN, null, { appUrl: "https://dashboard.deltamint.app" });

test("the subject carries the week and the number", () => {
  const { subject } = render([accountWeek(ACCT, ROWS, TRADES, WIN)]);
  // The ACCOUNT NAME leads it now: a person with four accounts gets four of
  // these and the inbox has to tell them apart unopened.
  assert.ok(subject.startsWith("Alton Live — "), subject);
  assert.ok(subject.includes("Sep 7"));
  assert.ok(subject.includes("Sep 11"));
  assert.ok(subject.includes("+$1,553.00"), subject);
});

test("a paper-only reader is told so in the subject line", () => {
  const { subject, html } = render([accountWeek({ id: "p", name: "Practice", is_paper: true }, ROWS, TRADES, WIN)]);
  assert.ok(subject.includes("(paper)"), subject);
  assert.ok(html.includes("simulated"));
  // ...and the whole message is banded, not one block inside it.
  assert.ok(html.includes("Paper account — every figure below is simulated"));
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
  void 0;
  assert.ok(html.includes(DASH));
  assert.ok(html.includes("MU"));
  assert.ok(/could not be valued/i.test(html));
});

test("a review copy says whose account it is, at the top", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, { previewFor: "someone@example.com" });
  assert.ok(html.includes("REVIEW COPY"));
  assert.ok(html.includes("someone@example.com"));
  assert.ok(html.includes("has not been sent to them"));
  // It must be before any figure, or the owner reads another account as his.
  assert.ok(html.indexOf("REVIEW COPY") < html.indexOf("This account's week"));
});

test("an account that traded nothing still gets an email, and it is not a grid of zeroes", () => {
  // The owner, after the first production send: *"I still see the weekly all
  // about last week premiums, not the shares not the account snapshot.
  // Nothing."* And before that: *"Even no trades this week, an account
  // snapshot in general should be sent. It's not about trades, it's about the
  // account itself."*
  //
  // So a week with no trades is no longer "quiet" and skipped -- it is an
  // account with a state worth reporting. What it must NOT do is print a
  // premium panel of zeroes.
  // No stored series at all, which is production's actual state, so there is
  // no week figure to lead with. A MEASURED week that came to zero is a
  // different case and still reads "+$0.00" -- that is a result, not an
  // absence, and the two must not be collapsed.
  const empty = accountWeek(ACCT, [], [], WIN);
  const { subject, html } = render([empty]);
  // No trades and, with no snapshot, nothing known to be held.
  assert.ok(subject.includes("nothing open"), subject);
  assert.ok(!html.includes(">Premium<"), "a premium panel of zeroes is noise");
  assert.ok(html.includes("This week's trading"));
  assert.ok(html.includes("What it holds is above"));
});

test("the subject names what is HELD when there is no week figure to stand behind", () => {
  // Production had no stored series at all, so every week figure was a dash
  // and the subject read "nothing traded" about accounts holding real
  // positions. The snapshot is what the subject falls back to.
  const snap = {
    read: true, empty: false, shareCount: 1, optionCount: 3,
    options: [], shares: [], openOrders: [], openOrderCount: 0,
    equity: 151562.83, cash: 11065.83, lastEquity: null,
    optionsValue: -420, sharesValue: 140497, optionsUnrealized: 30, sharesUnrealized: -206,
    failed: []
  } as any;
  const noSeries = accountWeek(ACCT, [], [], WIN);
  const { subject } = renderAccountWeek(noSeries, WIN, snap, {});
  assert.ok(subject.includes("holding"), subject);
  assert.ok(subject.includes("1 stock"), subject);
  assert.ok(subject.includes("3 option legs"), subject);
  assert.ok(!subject.includes("nothing"), subject);
});

test("a broker that would not answer is not reported as an empty account", () => {
  const unread = { read: false, empty: false, shareCount: 0, optionCount: 0,
    options: [], shares: [], openOrders: [], openOrderCount: null,
    equity: null, cash: null, lastEquity: null, optionsValue: null, sharesValue: null,
    optionsUnrealized: null, sharesUnrealized: null, failed: ["positions"] } as any;
  const { html } = renderAccountWeek(accountWeek(ACCT, [], [], WIN), WIN, unread, {});
  assert.ok(html.includes("could not reach your broker"));
  assert.ok(html.includes("not a statement that you hold nothing"));
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
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, [], WIN), WIN, null, { previewFor: '"><script>alert(1)</script>' });
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


// ---------------------------------------------------------------------------
// One account, one email
// ---------------------------------------------------------------------------

test("each account is measured on its own, never pooled", () => {
  const live = accountWeek(ACCT, ROWS, TRADES, WIN);
  const paper = accountWeek({ id: "p2", name: "Practice", is_paper: true }, ROWS, TRADES, WIN);
  // Two accounts, two emails, and neither figure is a sum of the other.
  const a = renderAccountWeek(live, WIN, null, {});
  const b = renderAccountWeek(paper, WIN, null, {});
  assert.notEqual(a.subject, b.subject);
  assert.ok(a.subject.startsWith("Alton Live"));
  assert.ok(b.subject.startsWith("Practice"));
  assert.ok(b.subject.includes("(paper)"));
  assert.ok(!a.subject.includes("(paper)"));
});

test("premium and stock both appear, per account", () => {
  // The owner's first ask: "each account should have the premium and stocks
  // moves". Both blocks, in every non-quiet email.
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes(">Premium<"), "premium block missing");
  assert.ok(html.includes(">Stock<"), "stock block missing");
  assert.ok(html.includes("Move on shares held this week"));
  assert.ok(html.includes("Booked on shares sold"));
  assert.ok(html.includes("Move in the option book"));
  assert.ok(html.includes("Collected on positions opened"));
});

test("a bought position's debit is shown as paid, not hidden", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes("Paid to open bought positions"));
  assert.ok(html.includes("$450.00"));
});
