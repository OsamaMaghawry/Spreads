// The weekly email: what happened to this account in the week just gone.
//
// The owner: *"I want to have a weekly email that has the premium paid, the
// premium earned, anything related to the premium, and the overall portfolio
// performance, stocks, everything related to their portfolio. A very nice
// weekly email to get to their email to summarize what happened on a weekly
// basis."*
//
// WHERE THE NUMBERS COME FROM, and why this file can be pure.
//
// `account_equity_daily` already stores, for every session day, the whole of
// what this email needs to say: the broker's account value, the cumulative
// premium line, shares booked, the mark on shares still held, the mark on
// option legs still open, and the whole-view performance line. So a week is
// not a new calculation -- it is a SUBTRACTION between two stored days, the
// last one on or before the window's start and the last one inside it.
//
// That matters for more than tidiness. Every figure below therefore agrees
// with the Analysis page by construction, because it is the same column the
// chart is drawn from; and the whole email can be built and tested without a
// broker, a key or a network.
//
// WHAT A MISSING DAY DOES. Those columns are null -- never zero -- on a day
// any part of the book could not be valued, because zero is a statement about
// a portfolio and "not priced" is not that statement. A subtraction with a
// null on either end is null here too, renders as "—", and says which ticker
// cost it. Nothing in this file substitutes a number it does not have.
//
// WHAT IT MAY NOT SAY. Compliance rules 5 and 6: no advice, no
// recommendation, no signal. This email reports what happened and what is
// held. It never suggests an action, never ranks a position as good or bad,
// and never tells anyone what to do next. "Your short 225 put is $2 from its
// strike" is a fact about their book; "consider rolling it" is not ours to
// write. A paper account says on every screen and in every email that its
// money is simulated.

export type Window = { from: string; to: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The week the email covers: the most recently COMPLETED Monday-to-Friday.
 *
 * Anchored on Friday rather than on "seven days back" so the window is always
 * a whole trading week and two consecutive sends can never overlap or leave a
 * day uncovered. Run on a Saturday it reports the week that just finished; run
 * midweek -- a manual test, a retry -- it reports the last finished one rather
 * than half of this one.
 */
export function weekWindow(now: Date = new Date()): Window {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // 0 = Sunday. Step back to the most recent Friday, today included.
  const back = (d.getUTCDay() + 2) % 7;
  const friday = new Date(d.getTime() - back * 86400000);
  const monday = new Date(friday.getTime() - 4 * 86400000);
  return { from: iso(monday), to: iso(friday) };
}

export type DailyRow = {
  day: string;
  equity?: number | null;
  premium_cum?: number | null;
  shares_booked?: number | null;
  shares_open?: number | null;
  shares_value?: number | null;
  options_open?: number | null;
  performance?: number | null;
  unpriced?: string[] | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// The change in one stored column across the window.
//
// `open` is the last row ON OR BEFORE the window opens -- the state the week
// STARTED from, which is the previous Friday's close, not Monday's. Measuring
// from Monday's close would silently drop Monday itself, which on a week whose
// whole result was Monday is the entire answer.
const delta = (open: DailyRow | null, close: DailyRow | null, key: keyof DailyRow): number | null => {
  const a = open ? num(open[key] as unknown) : null;
  const b = close ? num(close[key] as unknown) : null;
  if (b === null) return null;
  // No row before the window means the account's history starts inside it, so
  // the cumulative column IS the week's change. This is a real case: it is
  // every account's first week.
  if (!open) return b;
  if (a === null) return null;
  return b - a;
};

export type TradeRow = {
  ticker?: string;
  strategy?: string;
  open_date?: string | null;
  close_date?: string | null;
  qty?: number | null;
  net_credit?: number | null;
  close_debit?: number | null;
  realized_pl?: number | null;
  premium_pl?: number | null;
  early_close_pl?: number | null;
  stock_pl?: number | null;
  provisional?: boolean | null;
  close_reason?: string | null;
  short_strike?: number | null;
  expiry?: string | null;
};

const inWindow = (date: string | null | undefined, w: Window) =>
  Boolean(date) && String(date) >= w.from && String(date) <= w.to;

const sum = (rows: TradeRow[], pick: (t: TradeRow) => number | null) =>
  rows.reduce((s, t) => s + (pick(t) ?? 0), 0);

// A contract's premium in dollars. `net_credit` and `close_debit` are per
// share, the way an option is quoted, so both need the multiplier and the
// contract count -- the single most common way a premium figure comes out a
// hundred times too small.
const dollars = (perShare: number | null, qty: number | null) =>
  perShare === null ? null : perShare * (qty ?? 1) * 100;

export type AccountWeek = ReturnType<typeof accountWeek>;

/**
 * One account's week.
 *
 * @param account { id, name, is_paper }
 * @param rows    account_equity_daily rows, any order, spanning at least from
 *                before `win.from` to `win.to`
 * @param trades  this account's trade_records (all of them; filtered here)
 */
export function accountWeek(
  account: { id: string; name?: string | null; is_paper?: boolean | null },
  rows: DailyRow[],
  trades: TradeRow[],
  win: Window
) {
  const sorted = (rows || []).filter((r) => r?.day).slice().sort((a, b) => a.day.localeCompare(b.day));
  const before = sorted.filter((r) => r.day < win.from);
  const inside = sorted.filter((r) => r.day >= win.from && r.day <= win.to);
  const open = before.length ? before[before.length - 1] : null;
  const close = inside.length ? inside[inside.length - 1] : null;

  // PROVISIONAL ROWS ARE EXCLUDED FROM OUTCOME FIGURES, as everywhere else in
  // this product: a row the reconstruction had to guess at must not be
  // summed into a number presented as what the week earned.
  const real = (trades || []).filter((t) => !t.provisional);
  const closed = real.filter((t) => inWindow(t.close_date, win));
  const opened = real.filter((t) => inWindow(t.open_date, win));

  // PREMIUM, in the two senses a trader means it, kept apart because they
  // answer different questions and netting them answers neither.
  //
  //   collected  what was TAKEN IN on positions opened this week -- the cash
  //              that arrived. A bought position carries a negative net_credit
  //              and is therefore premium PAID OUT, so the two are split by
  //              sign rather than assumed to be credits.
  //   paid       what was paid to CLOSE positions this week: buying back a
  //              short before expiry. Zero on an expiry, which costs nothing.
  //   kept       what the closed legs actually came to, net -- the outcome,
  //              not the cash flow. Signed.
  const openedDollars = opened.map((t) => dollars(num(t.net_credit), num(t.qty)) ?? 0);
  const premiumCollected = openedDollars.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const premiumPaidToOpen = -openedDollars.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const premiumPaidToClose = sum(closed, (t) => dollars(num(t.close_debit), num(t.qty)));
  const premiumKept = sum(closed, (t) => (num(t.premium_pl) ?? 0) + (num(t.early_close_pl) ?? 0));

  const winners = closed.filter((t) => (num(t.realized_pl) ?? 0) > 0).length;
  const expired = closed.filter((t) => t.close_reason === "expired").length;

  // Which tickers cost the week a valuation, named once. The reader is told
  // WHICH position is missing rather than shown an unexplained dash.
  const unpriced = [
    ...new Set(inside.flatMap((r) => (Array.isArray(r.unpriced) ? r.unpriced : [])))
  ].sort();

  return {
    accountId: account.id,
    name: account.name || "Account",
    isPaper: Boolean(account.is_paper),
    // What was actually measured, so the email can say so rather than imply a
    // full week it did not have.
    measuredFrom: open?.day || null,
    measuredTo: close?.day || null,
    days: inside.length,

    // NOT MEASURED IS NOT THE SAME AS NOT PRICED, and conflating them is a
    // real defect rather than a nicety. `account_equity_daily` is built when
    // an account's history is first read, so a connected account nobody has
    // opened has no rows at all -- not a gap in a series, no series. Three of
    // the eight accounts on staging are in exactly that state.
    //
    // Treated as "unpriced" it would drag every total it touched to null, and
    // the reader would be told their whole portfolio could not be valued
    // because of an empty account they connected once and never used. Treated
    // as zero it would be worse: a silent omission inside a figure presented
    // as complete. So it is its own state -- the account is named, its rows
    // are excluded from the totals, and the email says which accounts were
    // left out and why.
    measured: Boolean(close),

    // --- the portfolio, as the week moved it -------------------------------
    // The whole-view line: premium closed, shares sold, and the marks on
    // everything still open, differenced across the window. This IS the
    // windowed mark -- the change in the open book across the week rather
    // than today's mark shown beside a week's booked money.
    performance: delta(open, close, "performance"),
    premiumLine: delta(open, close, "premium_cum"),
    sharesBooked: delta(open, close, "shares_booked"),
    sharesMark: delta(open, close, "shares_open"),
    optionsMark: delta(open, close, "options_open"),
    // The broker's own account value. Labelled separately and never added to
    // anything above: it moves with deposits and withdrawals, which are not a
    // trading result.
    equityChange: delta(open, close, "equity"),
    equityEnd: close ? num(close.equity) : null,

    // --- what is held right now --------------------------------------------
    sharesValue: close ? num(close.shares_value) : null,
    sharesOpenMark: close ? num(close.shares_open) : null,
    optionsOpenMark: close ? num(close.options_open) : null,

    // --- premium ------------------------------------------------------------
    premium: {
      collected: premiumCollected,
      paidToOpen: premiumPaidToOpen,
      paidToClose: premiumPaidToClose,
      kept: premiumKept
    },

    // --- the trades themselves ---------------------------------------------
    closed: {
      count: closed.length,
      winners,
      expired,
      realized: sum(closed, (t) => num(t.realized_pl)),
      stock: sum(closed, (t) => num(t.stock_pl)),
      rows: closed
    },
    opened: { count: opened.length, rows: opened },

    unpriced,
    // Nothing happened AND nothing is held: the one shape that deserves a
    // shorter email rather than a grid of zeroes.
    quiet:
      closed.length === 0 && opened.length === 0 &&
      !(close && ((num(close.shares_value) ?? 0) !== 0 || (num(close.options_open) ?? 0) !== 0))
  };
}

export type UserWeek = ReturnType<typeof userWeek>;

/**
 * Every account one person holds, and the totals across them.
 *
 * PAPER AND LIVE ARE NEVER ADDED TOGETHER. A total mixing simulated money with
 * real money is not a number about anything, and it is exactly the number a
 * reader would quote back as their result. They are totalled separately and
 * labelled.
 */
export function userWeek(accounts: AccountWeek[], win: Window) {
  const live = accounts.filter((a) => !a.isPaper);
  const paper = accounts.filter((a) => a.isPaper);

  // WHICH SIDE THE EMAIL LEADS WITH. Merely HOLDING a live account is not the
  // test: a connected live account that has never traded and has no stored
  // history would otherwise make the email lead with an empty live summary and
  // bury the paper account where the person's actual week is. A live account
  // counts once it has been measured or has traded -- and a genuinely flat
  // live week still counts, because it was measured.
  const liveActive = live.filter((a) => a.measured || a.closed.count > 0 || a.opened.count > 0);

  const totalOf = (all: AccountWeek[]) => {
    // Accounts with no stored history at all are not in the portfolio totals
    // -- see `measured` on accountWeek. Their trades still are, because
    // `trade_records` exists for them whether or not the daily series does,
    // and a week's premium is a fact about the trades rather than about the
    // series.
    const list = all.filter((a) => a.measured);
    // Among the accounts that WERE measured, a null anywhere makes the total
    // null: a sum that silently skipped an account the broker would not price
    // reads as a complete answer.
    const perf = list.map((a) => a.performance);
    return {
      accounts: list.length,
      // NOTHING MEASURED IS NOT A FLAT WEEK. An empty list reduces to 0, and
      // 0 renders as "+$0.00" -- which reads as "your week came to nothing"
      // rather than "there was no week here". Caught on staging before the
      // first send: a user whose only live account is a dead connection with
      // no trades was shown +$0.00 for a live week that does not exist, while
      // the paper account holding all 43 of his trades was the one with the
      // result in it.
      unmeasured: all.filter((a) => !a.measured).map((a) => a.name),
      performance:
        list.length === 0 || perf.some((v) => v === null)
          ? null
          : perf.reduce((s, v) => s + (v as number), 0),
      // Trade figures come from ALL accounts, measured or not. A trade is a
      // fact recorded in `trade_records`, which exists whether or not anybody
      // has ever built that account's daily series -- and on staging one user
      // has 128 trades and no series at all. Summing these over the measured
      // accounts alone would report an empty week to somebody who traded.
      premiumCollected: all.reduce((s, a) => s + a.premium.collected, 0),
      premiumPaidToClose: all.reduce((s, a) => s + a.premium.paidToClose, 0),
      premiumKept: all.reduce((s, a) => s + a.premium.kept, 0),
      realized: all.reduce((s, a) => s + a.closed.realized, 0),
      closed: all.reduce((s, a) => s + a.closed.count, 0),
      opened: all.reduce((s, a) => s + a.opened.count, 0)
    };
  };

  return {
    window: win,
    accounts,
    live: totalOf(live),
    paper: totalOf(paper),
    hasLive: liveActive.length > 0,
    hasPaper: paper.length > 0,
    // Every account this person holds that has no stored history for the week,
    // named once, so the email can say what is NOT in its figures.
    unmeasured: accounts.filter((a) => !a.measured).map((a) => a.name),
    quiet: accounts.every((a) => a.quiet)
  };
}
