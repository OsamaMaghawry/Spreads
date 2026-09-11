import { fmtMoney } from "@/lib/format";

// The option legs still open, and what they are worth right now.
//
// The owner, 11 Sep: *"did you add the Put position that is open now? You
// included only the long position... make sure the analysis has the open
// positions too, not only the closed ones."* Nothing on this page had ever
// shown an open option. `computeStats` reads closed trades; `openBook` reads
// share lots; an option still open fell between them.
//
// Priced only in Whole view, the same rule the share panel follows: Premium
// only reports the option legs that have CLOSED, and pricing an open one into
// that view would put an unrealized mark inside the figure defined to exclude
// them.

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";

const money = (v) => (v === null || v === undefined ? "—" : fmtMoney(v));

export default function OpenOptionsPanel({ book, priced = true }) {
  if (!book || book.count === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-slate-900">Option positions still open</h3>
        <span className="text-[11px] text-slate-500">
          {book.count} {book.count === 1 ? "position" : "positions"} · {book.contracts}{" "}
          {book.contracts === 1 ? "contract" : "contracts"}
        </span>
        {priced && (
          <span className="ml-auto text-sm font-semibold tabular-nums">
            {book.unrealized === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span className={book.unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {book.unrealized >= 0 ? "+" : ""}
                {fmtMoney(book.unrealized)}{" "}
                <span className="font-normal text-slate-500">unrealized</span>
              </span>
            )}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>Contract</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Paid / taken</th>
              {priced && <th className={`${th} text-right`}>Worth now</th>}
              {priced && <th className={`${th} text-right`}>Unrealized</th>}
            </tr>
          </thead>
          <tbody>
            {book.positions.map((p) => (
              <tr key={p.symbol} className="border-b border-slate-100 last:border-0">
                <td className={`${td} font-medium text-slate-900`}>
                  {p.underlying || p.ticker} {p.strike ?? ""}
                  {p.optionType === "call" ? "C" : p.optionType === "put" ? "P" : ""}
                  {p.expiry && <span className="ml-2 text-[11px] font-normal text-slate-400">exp {p.expiry}</span>}
                  {/* A corporate action changed what this contract delivers, so
                      the 100 multiplier no longer holds. Named rather than
                      quietly priced -- the same rule the close ticket applies. */}
                  {p.adjusted && (
                    <span className="ml-2 text-[10px] font-normal text-amber-700">adjusted contract</span>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <span className={p.side === "short" ? "text-rose-700" : "text-slate-900"}>
                    {p.qty > 0 ? `+${p.qty}` : p.qty}
                  </span>
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">{p.side}</span>
                </td>
                {/* One column, not two, because a short position's "cost" is a
                    credit received. The sign says which, and the heading names
                    both so neither reading is a guess. */}
                <td className={`${td} text-right`}>{money(p.costBasis)}</td>
                {priced && <td className={`${td} text-right`}>{money(p.marketValue)}</td>}
                {priced && (
                  <td className={`${td} text-right font-medium ${
                    p.unrealized === null
                      ? "text-slate-400"
                      : p.unrealized >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                  }`}>
                    {money(p.unrealized)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
        {priced ? (
          <>
            Marked at the broker&rsquo;s current price. <strong>Unrealized</strong> &mdash; none of it is
            booked, and it moves with the market until each leg is closed or expires. A short
            leg&rsquo;s figure is a credit taken against what it would cost to buy back now.
          </>
        ) : (
          <>
            Not priced in Premium only, which reports the option legs that have <em>closed</em>.
            Switch to Whole view to mark these.
          </>
        )}
        {book.unmarked.length > 0 && (
          <>
            {" "}
            <span className="text-amber-700">
              The broker returned no value for {book.unmarked.join(", ")}, so no total is shown for
              this book.
            </span>
          </>
        )}
      </p>
    </div>
  );
}
