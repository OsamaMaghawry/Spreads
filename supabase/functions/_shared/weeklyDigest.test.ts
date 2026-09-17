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
//
// EVERY ROW SATISFIES THE STORED INVARIANT: `performance` is the sum of the
// other four, which is what `dailyPortfolio` writes
// (`realized_cum + shares_open + options_open`, and `realized_cum` is
// `premium_cum + shares_booked`). These three rows did not, for a while: they
// were written when the line was the THREE, and `options_open` joining the sum
// on 12 September 2026 left them 100 and 30 short. No assertion here noticed,
// because every one of them differenced two columns and never added four --
// which is exactly the blind spot that let the email show three parts of a
// four-part figure for as long as it did.
const ROWS = [
  { day: "2026-09-04", equity: 140000, premium_cum: 5000, shares_booked: 1200, shares_open: -400, shares_value: 36000, options_open: 100, performance: 5900 },
  { day: "2026-09-07", equity: 140500, premium_cum: 5300, shares_booked: 1200, shares_open: -300, shares_value: 36100, options_open: 110, performance: 6310 },
  { day: "2026-09-11", equity: 141562, premium_cum: 6100, shares_booked: 1459, shares_open: -206, shares_value: 36544, options_open: 30, performance: 7383 }
];

// The invariant itself, asserted once, so a fixture can never drift off it
// again without a test saying so.
test("the fixture obeys the stored invariant: performance is the other four", () => {
  for (const r of ROWS) {
    assert.equal(
      r.performance,
      r.premium_cum + r.shares_booked + r.shares_open + r.options_open,
      `${r.day} does not add up`
    );
  }
});

test("every portfolio figure is a subtraction between two stored days", () => {
  const w = accountWeek(ACCT, ROWS, [], WIN);
  // Measured from the FRIDAY BEFORE, not from Monday's close -- measuring from
  // Monday would silently drop Monday itself.
  assert.equal(w.measuredFrom, "2026-09-04");
  assert.equal(w.measuredTo, "2026-09-11");
  assert.equal(w.performance, 7383 - 5900);
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
  assert.equal(w.performance, 7383);
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
  // Provisional: counted in every MONEY figure (the cash moved) and excluded
  // from every OUTCOME figure (it has not won or lost yet) -- the same rule
  // src/lib/analytics.js applies, so the email and the page agree.
  { ticker: "GME", open_date: "2026-09-08", close_date: "2026-09-10", qty: 5, net_credit: 9.99,
    close_debit: 0, premium_pl: 4995, realized_pl: 4995, provisional: true, close_reason: "expired" }
];

test("premium collected counts credits taken to open, in dollars", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  // 3.10 x 2 contracts x 100, plus the provisional GME credit of 9.99 x 5 x
  // 100: cash that arrived is cash that arrived. The multiplier is the most
  // common way a premium figure comes out a hundred times too small.
  assert.equal(w.premium.collected, 620 + 4995);
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
  assert.equal(w.premium.kept, 160 + 300 + 4995);
});

test("a provisional row counts as money and never as an outcome", () => {
  // The owner met the old behaviour as a contradiction: the Analysis page said
  // $785.91 booked for the week, the email said $625.91 realized, and the gap
  // was one assignment whose shares were still open. The email's own four-part
  // headline already carried that cash, so the trade line disagreed with the
  // hero above it. Money over every row; wins and losses over settled rows.
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  assert.equal(w.closed.count, 3);
  assert.equal(w.closed.provisional, 1);
  assert.ok(w.closed.rows.some((t) => t.ticker === "GME"));
  assert.equal(w.closed.realized, 460 + 4995);
  // GME's 4995 would have been a "win"; it is not counted as one.
  assert.equal(w.closed.winners, 2);
  assert.equal(w.closed.expired, 1);
});

test("trades outside the window are not in it", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  assert.ok(!w.closed.rows.some((t) => t.ticker === "WMT"));
  // AAPL, MSFT and the provisional GME open: money counts every row.
  assert.equal(w.opened.count, 3);
});

// ---------------------------------------------------------------------------
// Across accounts
// ---------------------------------------------------------------------------

// One account, one email. The helper takes a list only because the tests that
// predate the split still hand one over; it renders the first, which is the
// account under test.
const render = (accounts: ReturnType<typeof accountWeek>[]) =>
  renderAccountWeek(accounts[0], WIN, null, { appUrl: "https://dashboard.deltamint.app" });

test("the subject is one line, and carries no money", () => {
  // The owner's words on the send that starts reaching real users: "change
  // the subject to DeltaMint Weekly Digest". What it replaces led with the
  // account name and the week's result -- right for him, holding eight
  // accounts, and wrong for a user whose account's P/L would then sit in a
  // notification preview on a lock screen.
  const { subject, html } = render([accountWeek(ACCT, ROWS, TRADES, WIN)]);
  assert.equal(subject, "DeltaMint Weekly Digest");
  assert.ok(!/\$|\d/.test(subject), "no figure and no date in a subject line");
  // Nothing is lost to a reader who opens it: the account, the week and the
  // figure are the first three things inside.
  assert.ok(html.includes("Alton Live"));
  assert.ok(html.includes("Sep 7"));
  assert.ok(html.includes(money(accountWeek(ACCT, ROWS, TRADES, WIN).performance, true)));
});

test("a paper-only reader is told so, in the body where it is unmissable", () => {
  // "(paper)" left the subject with everything else. It cost no warning: the
  // banner is full width and first inside the message, which is a louder
  // statement than five characters after a colon.
  const { subject, html } = render([accountWeek({ id: "p", name: "Practice", is_paper: true }, ROWS, TRADES, WIN)]);
  assert.equal(subject, "DeltaMint Weekly Digest");
  assert.ok(html.includes("simulated"));
  // ...and the whole message is banded, not one block inside it.
  assert.ok(html.includes("Paper account — every figure below is simulated"));
});

test("the email never advises", () => {
  const { html, text } = render([accountWeek(ACCT, ROWS, TRADES, WIN)]);
  for (const body of [html, text]) {
    // Scanned up to the disclosure, which necessarily contains the words
    // "recommendation" and "advice" in order to disclaim them. Everything a
    // reader takes as the product's voice about their positions is before it.
    //
    // The marker is the disclaimer's OPENING line rather than a phrase inside
    // it, so a future rewording of the disclaimer cannot quietly shrink the
    // region this test scans.
    const MARK = /DeltaMint is not a broker or a broker-dealer/;
    assert.ok(MARK.test(body), "the disclosure is missing");
    const copy = body.split(MARK)[0];
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

test("an owner copy is now indistinguishable from what the user gets", () => {
  // The owner removed the review banner so his copy is EXACTLY the user's.
  // That is the point, and it has a cost worth pinning: in owner mode the
  // email is addressed to one person and delivered to another, and nothing
  // on screen says so any more. The send log is where that fact now lives.
  const withPreview = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, { previewFor: "someone@example.com" });
  const without = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.equal(withPreview.html, without.html);
  assert.ok(!withPreview.html.includes("someone@example.com"));
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
  const { html } = render([empty]);
  // The subject no longer describes the week at all -- see the subject test
  // above. What must still hold is the BODY: no trades is a state to report,
  // not a premium panel of zeroes.
  assert.ok(!html.includes(">Premium<"), "a premium panel of zeroes is noise");
  assert.ok(html.includes("This week's trading"));
  assert.ok(html.includes("What it holds is above"));
});

test("an account with no week figure still reports what it HOLDS", () => {
  // Production had no stored series at all, so every week figure was a dash
  // and the email read as empty about accounts holding real positions. The
  // snapshot is what answers instead -- and since the subject stopped
  // describing the account, the body carries the whole of that answer.
  const snap = {
    read: true, empty: false, shareCount: 1, optionCount: 3,
    options: [], shares: [], openOrders: [], openOrderCount: 0,
    equity: 151562.83, cash: 11065.83, lastEquity: null,
    optionsValue: -420, sharesValue: 140497, optionsUnrealized: 30, sharesUnrealized: -206,
    failed: []
  } as any;
  const noSeries = accountWeek(ACCT, [], [], WIN);
  const { subject, html } = renderAccountWeek(noSeries, WIN, snap, {});
  assert.equal(subject, "DeltaMint Weekly Digest");
  // The account's own value leads the message even with no week to report.
  assert.ok(html.includes("$151,562.83"), "the account value is the headline");
  assert.ok(html.includes("The account"));
  // Four positions, counted where the reader can see them.
  assert.ok(html.includes(">4<"), "1 stock + 3 option legs");
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

test("an intended recipient never reaches the markup at all", () => {
  // This used to assert that `previewFor` was ESCAPED into the review-copy
  // banner. The banner is gone at the owner's word, so the address no longer
  // reaches the HTML by any path -- which is strictly safer than escaping it,
  // and is the assertion worth keeping so a future banner cannot reintroduce
  // an unescaped one.
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, [], WIN), WIN, null, {
    previewFor: '"><script>alert(1)</script>'
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("alert(1)"));
  assert.ok(!html.includes("REVIEW COPY"), "the owner banner was removed");
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
  assert.equal(w.closed.count, 3);
  assert.equal(w.premium.collected, 620 + 4995);
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
  // The SUBJECT is now one line for everybody -- the account is told apart in
  // the body, not the inbox. What must still never be pooled is the content.
  assert.equal(a.subject, "DeltaMint Weekly Digest");
  assert.equal(b.subject, a.subject);
  assert.notEqual(a.html, b.html);
  assert.ok(a.html.includes("Alton Live"));
  assert.ok(b.html.includes("Practice"));
  // And the paper warning moved out of the subject into the body, where it is
  // a full-width banner rather than five characters after a colon.
  assert.ok(b.html.includes("every figure below is simulated"));
  assert.ok(!a.html.includes("every figure below is simulated"));
});

test("premium and the week's parts both appear, per account", () => {
  // The owner's first ask: "each account should have the premium and stocks
  // moves". Both blocks, in every non-quiet email.
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes(">Premium<"), "premium block missing");
  assert.ok(html.includes(">How the week adds up<"), "breakdown block missing");
  assert.ok(html.includes("Premium booked in the week"));
  assert.ok(html.includes("Booked on shares sold"));
  assert.ok(html.includes("Move on shares still held"));
  assert.ok(html.includes("Move in the option book"));
  assert.ok(html.includes("Collected on positions opened"));
});

// THE OWNER COULD NOT READ THE PANEL THIS REPLACES: *"The attached part is
// confusing. I don't understand it so for sure it would confuse users."*
//
// It showed three of the week's four parts under the heading "Stock" with a
// caption telling him not to add two of them together -- so the numbers on
// screen came to something the same email's own headline contradicted.
//
// The contract now: every part is shown, and they add to the headline. This
// test asserts the arithmetic a reader would do by hand.
test("the week's four parts are all shown and add to the headline", () => {
  const w = accountWeek(ACCT, ROWS, TRADES, WIN);
  const parts = [w.premiumLine, w.sharesBooked, w.sharesMark, w.optionsMark] as number[];
  assert.equal(parts.reduce((a, b) => a + b, 0), w.performance);

  const { html, text } = renderAccountWeek(w, WIN, null, {});
  // Each part, and the total, as a reader sees them -- in BOTH renderings.
  for (const v of parts) {
    assert.ok(html.includes(money(v, true)), `${money(v, true)} missing from html`);
    assert.ok(text.includes(money(v, true)), `${money(v, true)} missing from text`);
  }
  // The label now carries a caption div after it, so match the label alone.
  assert.ok(/>\s*The week\s*</.test(html), "the total row is missing");
  assert.ok(/your broker's statement is the total that counts/.test(html),
    "the record reminder must sit at the total, where the eye lands");
  assert.ok(html.includes(money(w.performance, true)));
  assert.ok(text.includes("HOW THE WEEK ADDS UP"));
  // And the instruction not to add them is gone, because now they add.
  assert.ok(!html.includes("not added together"));
});

test("a breakdown that does not reconcile is withheld, not shown wrong", () => {
  // A stored row whose parts do not make its own `performance` -- the shape
  // the fixture itself was in before this session. The hero still carries the
  // week; a four-line breakdown that contradicts it does not run.
  const broken = [ROWS[0], { ...ROWS[2], options_open: 999 }];
  const w = accountWeek(ACCT, broken, TRADES, WIN);
  const { html, text } = renderAccountWeek(w, WIN, null, {});
  assert.ok(!html.includes(">How the week adds up<"));
  // AND THE TEXT PART, which is the half the first version of this left
  // unguarded: it printed the heading over four numbers that did not add to
  // the total under them -- the owner's own screenshot, reproduced as text,
  // in the release written to remove it. Gmail's plain-text mode,
  // policy-stripped Outlook and some screen readers all render this branch.
  assert.ok(!text.includes("HOW THE WEEK ADDS UP"));
  // The headline is untouched -- this withholds a breakdown, not a figure.
  assert.ok(html.includes(money(w.performance, true)));
});

test("a part that could not be valued withholds the breakdown too", () => {
  const gap = [ROWS[0], { ...ROWS[2], shares_open: null }];
  const { html, text } = renderAccountWeek(accountWeek(ACCT, gap, TRADES, WIN), WIN, null, {});
  assert.ok(!html.includes(">How the week adds up<"));
  // Text too: three numbers and a dash under a heading promising arithmetic
  // is the same defect in a different font.
  assert.ok(!text.includes("HOW THE WEEK ADDS UP"));
});

// A cent, and it is not a nicety. `dailyPortfolio` rounds the four columns
// independently and rounds `performance` from the UNROUNDED sum, so the two
// can disagree by a cent or two per row -- and this panel differences two
// rows. What the reader adds up must be what the total says.
test("a part that is a cent off its own headline withholds rather than misprints", () => {
  const off = [ROWS[0], { ...ROWS[2], options_open: ROWS[2].options_open + 0.01 }];
  const { html, text } = renderAccountWeek(accountWeek(ACCT, off, TRADES, WIN), WIN, null, {});
  assert.ok(!html.includes(">How the week adds up<"));
  assert.ok(!text.includes("HOW THE WEEK ADDS UP"));
});

// The two premium figures in one email are DIFFERENT figures and must not
// carry the same claim. `premium_cum` is built with no filter (a withheld
// row's premium belongs in an account-level sum); the Premium panel's "Kept
// on what closed" excludes withheld and provisional rows.
test("the two premium lines are named apart, not stated twice", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes("Premium booked in the week"));
  assert.ok(html.includes("Kept on what closed"));
  assert.ok(!html.includes("Premium on trades that closed"),
    "the old label made two different figures the same claim");
  assert.ok(html.includes("including any trade held back from the figures above"));
});

// A plain-text reader is told what their shares are worth. `holdingsPanel` is
// HTML only and `snap` can be null, so without this line the figure appears
// nowhere in the text rendering at all.
test("the text email still states what the shares are worth", () => {
  const { text } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(text.includes("Shares still held"));
});

test("a bought position's debit is shown as paid, not hidden", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes("Paid to open bought positions"));
  assert.ok(html.includes("$450.00"));
});

// ---------------------------------------------------------------------------
// The account first, and the three bars
//
// The owner: *"Make the first section the total account, not the holding, then
// go down to the rest of the email. I want also to add some nice graphs.
// Collateral to the Equity, Risk to Equity ... Options BP."*
// ---------------------------------------------------------------------------

// A snapshot in the shape `snapshotOf` returns, with the fields the lead panel
// reads. Numbers from the Options Wheel staging account.
const SNAP: any = {
  equity: 141577.61,
  cash: 68021.10,
  optionsBuyingPower: 52310.44,
  collateral: 73000,
  options: [], shares: [], optionCount: 3, shareCount: 1,
  optionsValue: -2420, sharesValue: 36544,
  optionsUnrealized: -682, sharesUnrealized: -206,
  openOrders: [], openOrderCount: 2,
  failed: [], read: true, empty: false
};

test("the email opens on the account, before anything it holds", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, SNAP, {});
  const account = html.indexOf("The account");
  const holdings = html.indexOf("What this account holds");
  assert.ok(account > -1, "the account panel must be present");
  // Either ordering renders; only one of them answers a Saturday's first
  // question before its second.
  assert.ok(holdings === -1 || account < holdings, "the account must come before the holdings");
  // And the account's own value is the headline figure of that panel.
  assert.ok(html.includes("$141,577.61"));
});

test("the two bars are there, and the risk bar is not", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, SNAP, {});
  assert.ok(html.includes("Collateral held"), "collateral bar missing");
  assert.ok(html.includes("Options buying power"), "options BP bar missing");
  // The owner asked for it, saw it and removed it. It must not drift back.
  assert.ok(!html.includes("Risk if it all went wrong"), "the risk bar was removed");
  // 73,000 / 141,577.61 = 51.6%
  assert.ok(html.includes("51.6%"), "collateral share missing");
  assert.ok(html.includes("$73,000.00"));
  assert.ok(html.includes("$52,310.44"));
});

test("the bars are tables — no image and no SVG reaches the inbox", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, SNAP, {});
  assert.ok(!/<svg|<img|background-image/i.test(html), "an email must carry no image or SVG");
});


test("no snapshot, no invented bars — the stored account panel stands in", () => {
  const { html } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  assert.ok(html.includes("The account"), "the lead panel still renders from stored rows");
  assert.ok(!html.includes("Collateral held"), "bars need a broker answer, not a guess");
});


// ---------------------------------------------------------------------------
// What we are not
//
// The owner: *"add on disclaimer of the email that DeltaMint is not a
// broker/dealer. We don't hold any positions or cash [...] mistakes, bugs,
// downtime can happen."* Compliance rule 2 is the standing requirement never
// to imply broker-dealer status, and this is the surface where the product's
// figures leave the product.
// ---------------------------------------------------------------------------

test("the email says plainly that DeltaMint is not a broker-dealer", () => {
  const { html, text } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  for (const part of [html, text]) {
    assert.ok(/not a broker or a broker-dealer/.test(part), "the broker-dealer denial is missing");
    assert.ok(/do not hold your money or your\s+positions/.test(part), "custody denial missing");
    assert.ok(/not place trades on your behalf/.test(part));
    assert.ok(/advice, a\s*\n?\s*recommendation or a signal/.test(part), "advice denial missing");
    assert.ok(/broker's own\s*\n?\s*statement is the record/.test(part));
    assert.ok(/reconstructed/.test(part));
    assert.ok(/marks, not money/.test(part));
    // The owner's own point, and the one most products leave out.
    // Whitespace-tolerant: the HTML wraps this sentence across source lines.
    assert.ok(/bug, an outage, a late or\s+corrected/.test(part), "the fallibility line is missing");
    // Somebody to tell, with the address.
    assert.ok(part.includes("support@deltamint.app"), "no address to report a wrong number to");
    // Cut at compliance's request: an unverifiable effort claim sitting
    // immediately before "can differ" softens the warning it introduces.
    assert.ok(!/work hard/i.test(part), "the effort claim undercuts the disclaimer");
    // The broker must be the named executing party in the same clause.
    assert.ok(/send your own orders to your broker/.test(part));
  }
});

test("the disclaimer keeps the brand's words and never names the broker", () => {
  const { html, text } = renderAccountWeek(accountWeek(ACCT, ROWS, TRADES, WIN), WIN, null, {});
  for (const part of [html, text]) {
    // `docs/context/brand.md` bans "journal" in favour of Trade History.
    assert.ok(!/journal/i.test(part), "the brand table bans 'journal'");
    // Compliance rule 1: the broker is not named outside the places that need it.
    assert.ok(!/alpaca/i.test(part), "the broker must not be named here");
  }
});

test("a paper account's disclaimer says its money is simulated, in both parts", () => {
  const paper = accountWeek({ id: "p", name: "Practice", is_paper: true }, ROWS, TRADES, WIN);
  const { html, text } = renderAccountWeek(paper, WIN, null, {});
  assert.ok(html.includes("its money is simulated"));
  assert.ok(text.includes("its money is simulated"));
});

// ---------------------------------------------------------------------------
// The same rows the Analysis page is tested on -- src/lib/windowParts.test.js
// carries this fixture verbatim. Two implementations, one arithmetic: if
// either side changes what a week's four parts are, one of the two suites
// fails on the owner's own numbers.
// ---------------------------------------------------------------------------

const ALTON = [
  { day: "2026-09-03", equity: 140844.76, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -23, performance: -1597 },
  { day: "2026-09-04", equity: 138870.97, premium_cum: -757, shares_booked: -817, shares_open: 0, options_open: -1831, performance: -3405 },
  { day: "2026-09-08", equity: 141530.46, premium_cum: -495, shares_booked: -817, shares_open: 632, options_open: -500, performance: -1180 },
  { day: "2026-09-09", equity: 141547.64, premium_cum: -1686, shares_booked: 441.91, shares_open: 31, options_open: 230, performance: -983.09 },
  { day: "2026-09-10", equity: 141247.97, premium_cum: -1473, shares_booked: 441.91, shares_open: -394, options_open: 317, performance: -1108.09 },
  { day: "2026-09-11", equity: 141577.61, premium_cum: -1230, shares_booked: 441.91, shares_open: -206, options_open: 45, performance: -949.09 },
  { day: "2026-09-14", equity: 141294.56, premium_cum: -809, shares_booked: 441.91, shares_open: -853, options_open: 134, performance: -1086.09 }
];

test("Alton's week of 7-11 September: the email's four parts are the page's four parts", () => {
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const w = accountWeek({ id: "alton", name: "Alton Live", is_paper: false }, ALTON, [], { from: "2026-09-07", to: "2026-09-11" });
  assert.equal(w.measuredFrom, "2026-09-04");
  assert.equal(w.measuredTo, "2026-09-11");
  assert.equal(r2(w.premiumLine), -473);
  assert.equal(r2(w.sharesBooked), 1258.91);
  assert.equal(r2(w.sharesMark), -206);
  assert.equal(r2(w.optionsMark), 1876);
  assert.equal(r2(w.performance), 2455.91);
  assert.equal(r2(w.equityChange), 2706.64);
  assert.equal(r2(w.equityEnd), 141577.61);
});
