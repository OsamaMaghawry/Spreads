import { fmtMoney } from "@/lib/format";

// What this report is, and what it is not.
//
// Lifted verbatim out of AccountAnalysis so two layouts cannot drift apart on
// it. This is a compliance surface -- it says the figures are not taxable gain
// or loss, names the money on the page that no statistic counts, and tells the
// reader to reconcile against a 1099-B. A second copy is a second thing to
// keep correct, and the copy that gets forgotten is the one a user forwards to
// an accountant in March.
//
// Every word, conditional and comment below came from that file unchanged.
// Moving it must not be an opportunity to edit it.
//
// It renders inside `reportRef` in both layouts, on purpose: the site-wide
// disclaimer lives in Layout, OUTSIDE the captured element, so without this
// the exported PDF left carrying an account name, a date range and a table of
// monthly realized P/L -- a document shaped exactly like a tax schedule,
// saying nothing about what it is.
export default function AnalysisDisclosure({
  view, stats, book, optionBook, orphanFigure, provisionalCount
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
      <span className="font-semibold text-slate-700">DeltaMint — economic performance report. Not a tax document.</span>{" "}
      Figures cover only positions an option opened or closed and exclude the rest of this
      account.{" "}
      {/* VIEW-AWARE, because the block named a card that does not exist
          under one of them and described figures that are no longer
          what it says they are. Under Premium only there is no card
          called Realized P/L; under Whole view three of the things it
          called "money booked" now carry a mark-to-market. */}
      {view === "premium" ? (
        <>
          This view shows the option legs alone and excludes every share sale, which are the
          largest lines on a wheel trader&rsquo;s 1099-B. Nothing here is taxable gain or loss:
          wash sales, straddle rules, Section 1256 treatment and the premium&rsquo;s effect on
          stock basis at assignment are not applied.
        </>
      ) : (
        <>
          P/L here is not taxable gain or loss: wash sales, straddle rules, Section 1256
          treatment and cost-basis adjustments on assignment are not applied.
          {/* "on shares still held" named the WRONG HALF. On a book
              carrying -$287.25 of mark, the share half was +$102.75 and
              the option half -$390.00 -- it named the half with the
              opposite sign and omitted the half that dominates. This
              block sits inside reportRef, so it is what the exported
              PDF says. */}
          {stats?.includesUnrealized && (
            <> The total, return on equity and return on risk also include an{" "}
            <strong>unrealized</strong> mark on positions still open
            {book.lots > 0 && optionBook.count > 0
              ? " — shares held and option legs not yet closed"
              : optionBook.count > 0
                ? " — option legs not yet closed"
                : " — shares still held"}
            . Nothing is owed on a position that has not been closed, and that figure moves
            with the market until it is.</>
          )}
        </>
      )}
      {/* Share results that reached no trade row, so no statistic here
          counts them. Real money, in the account, invisible to every
          figure on this page -- and the daily chart reads the lots
          directly and DOES see it, so unsaid the two disagree in
          silence. */}
      {Math.abs(orphanFigure) >= 0.005 && (
        <> {fmtMoney(orphanFigure)} of share results could not be matched to an option in this
        account &mdash; shares bought or sold outside DeltaMint, or a position that began before
        the broker&rsquo;s activity feed does. That money is in the account and in none of the
        figures above.</>
      )}
      {provisionalCount > 0 && (
        <> {provisionalCount} position{provisionalCount === 1 ? "" : "s"} closed by assignment
        {provisionalCount === 1 ? " still has" : " still have"} shares held, so
        {provisionalCount === 1 ? " its result is" : " their results are"} not final. Anything
        that calls a trade a win or a loss &mdash; win rate, profit factor, expectancy, payoff,
        average and largest win and loss, per-trade return, the streaks, and the win-rate
        columns in the tables above &mdash; is measured without
        {provisionalCount === 1 ? " it" : " them"}. Anything that measures money booked &mdash;
        the totals, the equity curve, drawdown, and the per-day and per-month figures &mdash;
        counts {provisionalCount === 1 ? "it" : "them"} in full.</>
      )}{" "}
      Reconcile against your broker&rsquo;s Form 1099-B before using any figure for a return.
    </div>
  );
}
