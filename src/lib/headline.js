import { fmtMoney } from "./format.js";

// The one figure at the top of the Analysis page, and what it is allowed to
// claim.
//
// THE DEFECT THIS EXISTS FOR. The headline used to render "—" the moment a
// strategy tab or a date range was set, under the note "No whole-account total
// while a strategy tab or date range is set". The owner, looking at a page
// carrying $785.91 of closed trades, -$206.00 of shares held and +$30.00 of
// open option legs, all three printed inches below the blank:
//
//   *"Why this??!! Should be a number here"*
//
// He is right, and the reason the dash was wrong is worth stating precisely,
// because the instinct that produced it was sound.
//
// Whole view's total is booked P/L PLUS the mark on everything still open. The
// mark cannot be filtered: a share lot is held today, not "during last week",
// and it belongs to the account rather than to one strategy. So under a filter
// the mark was dropped, and a figure labelled "Whole view total" that silently
// excluded everything still open would have been a lie. Withholding it was the
// safe answer to that.
//
// It was not the honest one. The booked total for the window is a real,
// knowable, useful number -- it is the same number the strategy tabs print --
// and refusing to show it does not protect the reader from a mixed figure, it
// just refuses to answer. The fix is to show what IS true and rename the
// figure to match: the label stops promising the mark, and a line underneath
// says what is still open, what it is worth now, and why it sits outside.
//
// That is the same discipline as before -- a number never claims more than it
// contains -- applied by relabelling rather than by blanking.

const money = (v) => fmtMoney(v);

/**
 * @param view      "whole" | "premium"
 * @param stats     the output of computeStats, or null
 * @param premium   the premium-only total for the same rows
 * @param hasOpen   is anything still open at all
 * @param liveMark  what everything still open is worth now, or null if any part
 *                  of it could not be priced
 * @param narrowing { strategy: string|null, when: string|null } -- the strategy
 *                  tab's label and a phrase naming the date window, each null
 *                  when that control is not narrowing the page
 * @returns { figure, label, note } -- `figure` is null only when there is
 *          nothing to measure at all.
 */
export function analysisHeadline({ view, stats, premium, hasOpen, liveMark, narrowing = {} }) {
  const { strategy = null, when = null } = narrowing;

  // Premium only never contained a mark and never claimed to: it is closed
  // option legs, and the view's own description says so. A filter narrows the
  // rows it sums and changes nothing about what the figure means.
  if (view === "premium") {
    return {
      figure: premium ?? null,
      label: "Premium only total",
      note: null
    };
  }

  if (!stats) return { figure: null, label: "Whole view total", note: null };

  // The unfiltered, fully priced case: the mark is inside the figure, the
  // label may say "total", and the view's description has already explained
  // what that covers.
  if (stats.includesUnrealized) {
    return { figure: stats.totalPL, label: "Whole view total", note: null };
  }

  // Everything below shows REALIZED money. The label leads with that word for
  // two reasons: it is the weight-bearing half, and a skimmer drops whatever
  // follows a middot in 10px uppercase; and it is the word the rest of the
  // page already uses for this exact value -- StatCards and StrategyComparison
  // both switch their heading to "Realized P/L" on the same condition. Three
  // names for one number on one screen is its own defect.
  const label = "Realized P/L · whole view";
  const figure = stats.totalPL;

  if (!hasOpen) {
    // Nothing is open, so realized money IS the whole of it. Unreachable from
    // the Analysis page, which only renders this control when something is
    // open -- and `openMark` returns 0 rather than null on an empty book, so a
    // page with nothing open takes the branch above. Kept as a module contract
    // for any caller without that guarantee: never point at an empty book.
    return { figure, label, note: null };
  }

  // A missing price is its own reason and outranks every other. An unfiltered
  // page reaches here only this way, and saying "not inside that window" when
  // no window is set would invent one.
  if (liveMark === null || liveMark === undefined) {
    return {
      figure,
      label,
      note:
        `Nothing still open is in this figure: part of it has no price, so it cannot be ` +
        `totalled. See the positions below.`
    };
  }

  // WHY the open book is outside, in the words that are actually true of this
  // page. The two reasons are different and must not be merged: a date range
  // excludes open positions because they are held TODAY, and a strategy tab
  // excludes them because the book belongs to the account rather than to one
  // strategy. Getting this wrong would tell a reader on the cash-secured put
  // tab that his open puts are not cash-secured puts.
  // "What closed between X and Y" is the half that overclaims: `realized_pl`
  // carries `stock_pl`, the share result written back onto the option row that
  // delivered the shares, and that row's close_date is not the day the shares
  // moved. "What the trades that closed in the window booked" is what the
  // filter actually selects, and it is the true statement.
  const closedPart =
    `This is what the trades that closed${strategy ? ` in ${strategy}` : ""}${when ? ` ${when}` : ""} booked.`;
  // The strategy reason is deliberately NARROW. "The open book belongs to the
  // account rather than to one strategy" is the argument the chart makes about
  // SHARE LOTS, and it is false of open option legs, which carry a ticker, a
  // type, a strike and an expiry and plainly can belong to a strategy. On the
  // cash-secured put tab it would tell a user holding an open short put that
  // his open short put is not a cash-secured put -- the exact misreading this
  // sentence exists to prevent. What is true is that the open book is not
  // split by strategy anywhere in this product, and that is enough.
  const why = strategy
    ? "The open book is not split by strategy"
    : "What is still open is held today, not inside that window";

  return {
    figure,
    label,
    // "it is marked at X below" pointed at a number that is not below: the
    // share panel prints the share mark and the option panel prints the option
    // mark, and nothing prints their sum. Say that the sum is of the two
    // panels, not that it is printed in one of them.
    note: `${closedPart} ${why}, so it is not in this figure — the open positions below come to ${money(liveMark)} between them.`
  };
}
