// The client half of the audit layer: one predicate, read everywhere.
//
// The server decides WHAT to withhold (supabase/functions/_shared/integrity.ts)
// and stamps `integrity_code` on the row. This file is how every screen agrees
// about it.
//
// WHY IT IS A MODULE AND NOT A FILTER IN THREE PLACES. The first version of the
// withholding was applied in `analytics.js`, the equity walk and the weekly
// email, and that looked like enough. It was not: the bench found the same
// account reading -$1,003 on Trade History and -$814 on Analysis, because
// `AccountHistory`, `TradeHistoryTable`, `openBook`, `headline`,
// `CaptureBreakdown`, `equityCurve` and the PDF all sum the same rows through
// other paths. Patching each of them is how the seventh one gets missed.
//
// So the rule is: SPLIT ONCE, AS HIGH AS POSSIBLE. A page filters its rows at
// the top, hands the trustworthy set to everything below, and renders the
// withheld count and dollars beside the total they were taken out of.

/** The one predicate. Null `integrity_code` means the figures are ours to publish. */
export const isWithheld = (t) => !!t?.integrity_code;

/**
 * Split a set of trades into what may be published and what may not.
 *
 * Returns the withheld DOLLARS as well as the count, because a count alone
 * cannot be sized. On the owner's paper account the single withheld row is
 * $189 against an $814 total -- 19% of what is shown -- and "1 withheld" reads
 * like a rounding note. The bench was blunt about it: a confidently wrong total
 * is worse than a blank page, because a blank page is obviously broken.
 *
 * `realized` is the whole-view figure and `premium` the option-only one, so a
 * page can quote the number that matches the view it is showing rather than
 * mixing the two.
 */
export function splitWithheld(trades) {
  const all = Array.isArray(trades) ? trades : [];
  const withheld = all.filter(isWithheld);
  const rows = all.filter((t) => !isWithheld(t));
  const sum = (list, f) => list.reduce((a, t) => a + (f(t) || 0), 0);
  return {
    rows,
    withheld,
    count: withheld.length,
    realized: sum(withheld, (t) => t.realized_pl),
    premium: sum(withheld, (t) => (t.premium_pl || 0) + (t.early_close_pl || 0)),
    // Enough to FIND the line. A reader reconciling against a broker statement
    // or a 1099-B needs to know which row we left out, not only how much it
    // came to — a dollar figure with no ticker is a number they cannot chase.
    // `close_date` on a trade, `disposed_date` on a share lot — the lots table
    // has no `close_date`, so reading only that printed a lot note with no
    // date at all. The disclosure test missed it because its fixture was
    // trade-shaped, which is the fourth instance of the pattern that suite
    // exists to catch.
    names: withheld
      .map((t) => [t.ticker, t.close_date || t.disposed_date].filter(Boolean).join(" "))
      .filter(Boolean)
  };
}

/**
 * The sentence that goes beside a page carrying withheld rows.
 *
 * WHAT IT NO LONGER SAYS. The first version read "Excludes 1 trade (−$189.00)
 * … your broker's own total includes it", because the withheld row's money had
 * been taken out of every total. That was the wrong design and the sentence
 * was its symptom: the defect is MISFILING, so the account total was never in
 * doubt, and removing one side of a transfer published a figure outside the
 * range the account's own arithmetic permits -- on the flattering side.
 *
 * The money is in the totals now and they tie to the broker. What is withheld
 * is the per-trade claim, so that is what the sentence is about.
 */
export function withheldNote(split, view = "whole", noun = "trade") {
  if (!split || !split.count) return null;
  const n = split.count;
  // Named, so the reader can find the row. Capped: a sentence listing thirty
  // tickers stops being read.
  const which = split.names.length
    ? ` (${split.names.slice(0, 3).join(", ")}${split.names.length > 3 ? `, +${split.names.length - 3} more` : ""})`
    : "";
  return `${n} ${n === 1 ? noun : `${noun}s`}${which} ${n === 1 ? "carries a result" : "carry results"} ` +
    `we cannot attribute to the right position — the money is real and is IN the totals ` +
    `below, which match your broker; what we cannot say is which ${noun} earned or lost it. ` +
    `Win rate, averages and streaks are measured without ${n === 1 ? "it" : "them"}.`;
}
