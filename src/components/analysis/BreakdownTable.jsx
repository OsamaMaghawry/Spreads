import { fmtMoney } from "@/lib/format";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";

export default function BreakdownTable({ title, keyLabel, rows, keyField }) {
  if (!rows.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <h3 className="text-sm font-medium text-slate-900 px-4 py-3 border-b border-slate-200">{title}</h3>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>{keyLabel}</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Win rate</th>
              <th className={`${th} text-right`}>P/L</th>
              {/* Not "expectancy": that name belongs to the settled-only
                  figure on the cards above, and this is P/L over every row. */}
              <th className={`${th} text-right`}>P/L ÷ trades</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[keyField]} className="border-b border-slate-100 last:border-0">
                <td className={`${td} font-medium text-slate-900`}>{r[keyField]}</td>
                <td className={`${td} text-right`}>
                  {r.trades}
                  {r.settled !== r.trades && (
                    // The win rate beside this runs over settled trades only.
                    // Without saying how many that was, a reader multiplies
                    // this column by that one and gets a number of wins that
                    // does not exist.
                    <span className="text-slate-400"> ({r.settled} settled)</span>
                  )}
                </td>
                {/* Over settled trades, the same population as the win rate
                    above it. Dividing settled wins by every trade would report
                    a rate lower than either measurement. */}
                <td className={`${td} text-right`}>
                  {r.settled ? `${((r.wins / r.settled) * 100).toFixed(0)}%` : "—"}
                </td>
                <td className={`${td} text-right font-semibold ${r.pl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {fmtMoney(r.pl)}
                </td>
                <td className={`${td} text-right`}>{fmtMoney(r.pl / r.trades)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}