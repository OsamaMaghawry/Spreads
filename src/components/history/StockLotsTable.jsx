import { fmtMoney } from "@/lib/format";

// Shares, kept deliberately separate from premium.
//
// When a short call is assigned, the option keeps its full premium and the
// result lands on the stock: called away at 470 against shares bought at
// 472.50 on exercise is a $250 loss that belongs here, not in the option row.
// Merging the two would hide which half of a wheel cycle actually worked, and
// a merged cost basis can always be derived from these two figures — the
// reverse cannot.

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-2.5 whitespace-nowrap tabular-nums";

const SOURCE = {
  assignment: "bg-amber-100 text-amber-800",
  exercise: "bg-violet-100 text-violet-700",
  trade: "bg-slate-100 text-slate-600"
};

const Tag = ({ value }) =>
  value ? (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SOURCE[value] || SOURCE.trade}`}>
      {value.toUpperCase()}
    </span>
  ) : (
    <span className="text-slate-400">—</span>
  );

export default function StockLotsTable({ lots }) {
  if (!lots || lots.length === 0) return null;

  // Only closed lots contribute. Shares still held are unrealized, and were
  // never a result to begin with.
  const realized = lots.reduce((a, l) => a + (l.realized_pl || 0), 0);
  const openQty = lots.filter((l) => !l.disposed_date).reduce((a, l) => a + Number(l.qty || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-900">Shares from assignment</h2>
        <p className="text-xs text-slate-500">
          Only shares an option put into or took out of the account. Stock you bought and sold
          yourself is not part of a strategy and is not shown. Each lot's result is already counted
          above against the option that sold the shares — this is the same money in detail, not more
          of it.
        </p>
        <p className="text-xs text-slate-500">
          Share price in and share price out are the option&rsquo;s strike where the Via column says
          assignment or exercise, and the traded price where it says trade. Neither is your tax basis, and the realized P/L here is simply the
          difference between the two &mdash; it is not your taxable gain or loss. Premium on a short
          put reduces the basis of shares put to you, and premium on a short call is added to the
          proceeds when shares are called away; neither adjustment is made here. Lots are matched
          first-in-first-out, which may not be the method your broker used.
        </p>
      </div>

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className={th}>Ticker</th>
              <th className={`${th} text-right`}>Shares</th>
              <th className={th}>Acquired</th>
              {/* Not "Cost" and "Proceeds". Those are Form 8949's own column
                  names -- "Cost or other basis" and "Proceeds" -- and these are
                  not those figures: an assignment records the bare strike, with
                  the option's premium kept as a separate record. Naming them
                  after the tax form invites the reader to copy them onto it.

                  Not "Strike" either, which was the correction that overshot:
                  a lot disposed of on the open market carries the price it sold
                  at, and a column headed "Strike received" printed that sale
                  price as though a contract had set it.

                  So: what the cells contain, in words that belong to neither
                  the tax form nor the option chain. Via says which kind each
                  one is, row by row, and the note above disclaims the figure
                  they produce as well as the figures themselves -- Realized P/L
                  is the column most likely to be copied onto a return. */}
              <th className={`${th} text-right`}>Share price in</th>
              <th className={th}>Via</th>
              <th className={th}>Disposed</th>
              <th className={`${th} text-right`}>Share price out</th>
              <th className={th}>Via</th>
              <th className={`${th} text-right`}>Realized P/L</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id || l.lot_key} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className={`${td} font-semibold text-slate-900`}>{l.ticker}</td>
                <td className={`${td} text-right`}>{Number(l.qty)}</td>
                <td className={`${td} text-slate-500`}>{l.acquired_date || "—"}</td>
                <td className={`${td} text-right`}>
                  {l.acquired_price == null ? (
                    // Bought before the window the broker's activity feed
                    // covers, so the basis genuinely is not known. Saying so
                    // beats inventing one.
                    <span className="text-slate-400" title="Purchase predates the available activity history">
                      unknown
                    </span>
                  ) : (
                    fmtMoney(l.acquired_price)
                  )}
                </td>
                <td className={td}><Tag value={l.acquired_source} /></td>
                <td className={`${td} text-slate-500`}>{l.disposed_date || "—"}</td>
                <td className={`${td} text-right`}>{l.disposed_price == null ? "—" : fmtMoney(l.disposed_price)}</td>
                <td className={td}><Tag value={l.disposed_source} /></td>
                <td className={`${td} text-right font-semibold ${
                  l.realized_pl > 0 ? "text-emerald-600" : l.realized_pl < 0 ? "text-rose-600" : ""
                }`}>
                  {l.realized_pl == null ? (
                    <span className="font-normal text-slate-400" title="Still held — not a realized result">
                      open
                    </span>
                  ) : (
                    fmtMoney(l.realized_pl)
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className={`${td} text-[11px] uppercase tracking-wider text-slate-500`}>Realized</td>
              <td className={td} colSpan={7}>
                {openQty > 0 && (
                  <span className="text-[11px] font-normal normal-case text-slate-500">
                    {openQty} share{openQty === 1 ? "" : "s"} still held, excluded
                  </span>
                )}
              </td>
              <td className={`${td} text-right ${realized > 0 ? "text-emerald-600" : realized < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(realized)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
