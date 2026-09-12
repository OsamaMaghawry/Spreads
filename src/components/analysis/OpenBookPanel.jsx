import { fmtMoney } from "@/lib/format";
import { Layers, AlertTriangle } from "lucide-react";

// The shares this account still holds, stated on every view.
//
// This panel is NOT behind the view switch, and that is the whole point. The
// switch decides whether the mark is folded into a headline; it never decides
// whether the position is mentioned. Premium only still shows every lot and
// what it cost -- it simply does not price them.
//
// The account this was built for reported +$1,737 and 100% winners while
// holding $129,700 of assigned stock that never appeared anywhere. The screen
// was not being cautious. It was describing a different strategy from the one
// being run.

// Share counts are raw numbers beside figures that all went through fmtMoney,
// and this module supports fractional quantities -- so a fractional book
// printed 699.9999999999999 in the middle of a formatted row.
const fmtQty = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });

const dt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");

export default function OpenBookPanel({ book, priced = true }) {
  if (!book || !book.lots) return null;

  const gain = book.unrealized !== null && book.unrealized >= 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 border-b border-slate-200">
        <Layers className="h-4 w-4 text-slate-400 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-900">Shares still held</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {book.lots} lot{book.lots > 1 ? "s" : ""} · {fmtQty(book.shares)} shares ·{" "}
          {/* When some shares have no recorded cost, this figure is the cost of
              the REST of them, and saying "at cost" flat would overstate how
              much of the book it describes. */}
          {book.unknownCostShares > 0
            ? `${fmtMoney(book.basis)} — cost of ${fmtQty(book.shares - book.unknownCostShares)} of ${fmtQty(book.shares)} shares`
            : `${fmtMoney(book.basis)} at cost`}
        </span>
        {priced && (
          <span className="ml-auto text-right">
            {book.unrealized === null ? (
              <span className="text-sm text-slate-400 font-mono">—</span>
            ) : (
              <span className={`text-lg font-semibold tabular-nums ${gain ? "text-emerald-600" : "text-rose-600"}`}>
                {gain ? "+" : ""}{fmtMoney(book.unrealized)}
              </span>
            )}
            <span className="block text-[11px] text-slate-400">unrealized, on price alone</span>
          </span>
        )}
      </div>

      {/* Why a total is missing, naming the position rather than the count.
          "6 of 7 lots" reads as nearly complete while a $32,000 line hides
          inside the one that is missing, so the gap is stated in DOLLARS. */}
      {priced && book.unrealized === null && (
        <div className="flex gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 leading-relaxed">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {/* The reason is READ, never assumed. The first version said "no
                current price" for every case -- including one where the price
                was present and the acquisition cost was missing, and reported
                a $0.00 gap against a book that had one. */}
            {book.mismatched.length > 0 ? (
              <>
                The broker and this page disagree on how many shares of{" "}
                <strong>{book.mismatched.join(", ")}</strong> are held, so no total is shown. The row
                below is priced on this page's count.
              </>
            ) : book.stranded.length > 0 ? (
              <>
                The broker holds <strong>{book.stranded.join(", ")}</strong>, which this page has no
                lot for. Either it was bought outside DeltaMint, or an assignment has not synced yet
                — this page cannot tell which. The figures below cover the lots it does have.
              </>
            ) : book.collided.length > 0 ? (
              <>
                Two share positions report under the name <strong>{book.collided.join(", ")}</strong>.
                They cannot be priced as one line, so no total is shown.
              </>
            ) : book.noCost.length > 0 ? (
              <>
                No recorded cost for <strong>{book.noCost.join(", ")}</strong>
                {book.unknownCostShares > 0 ? ` (${fmtQty(book.unknownCostShares)} shares)` : ""}. There is a
                price, but nothing to measure it against, so no total is shown.
              </>
            ) : book.noPosition.length > 0 ? (
              <>
                This page holds a lot for <strong>{book.noPosition.join(", ")}</strong> that the broker
                does not report as a position. That is a disagreement about what is held, not a
                missing price, so no total is shown — check it against your broker.
              </>
            ) : (
              <>
                No current price for <strong>{book.noPrice.join(", ")}</strong> —{" "}
                {fmtMoney(book.unmarkedBasis)} of {fmtMoney(book.basis)} at cost, so no total is
                shown.
              </>
            )}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ticker</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Shares</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Cost</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Held since</th>
              {priced && <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Now</th>}
              {priced && <th className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Unrealized</th>}
            </tr>
          </thead>
          <tbody>
            {book.tickers.map((t) => (
              <tr key={t.ticker} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2.5 font-medium text-slate-900">
                  {t.ticker}
                  {t.lots > 1 && <span className="ml-1.5 text-xs text-slate-400">{t.lots} lots</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtQty(t.shares)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {t.basisKnown ? fmtMoney(t.basis) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{dt(t.since)}</td>
                {priced && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {t.marked ? fmtMoney(t.marketValue) : <span className="text-slate-400">—</span>}
                  </td>
                )}
                {priced && (
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {t.marked ? (
                      <span className={t.unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {t.unrealized >= 0 ? "+" : ""}{fmtMoney(t.unrealized)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100">
        {priced ? (
          <>
            Priced at the broker's current price. <strong>Price only — no dividend is included in
            any figure on this page.</strong> This is not booked money and it can move.
          </>
        ) : (
          <>
            Not priced in this view. These shares are held and their result is still open, so they
            are not in the Premium only figure.
          </>
        )}
      </p>
    </div>
  );
}
