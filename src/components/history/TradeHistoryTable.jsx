import { fmtMoney } from "@/lib/format";

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-2.5 whitespace-nowrap tabular-nums";

export default function TradeHistoryTable({ trades }) {
  const totalPL = trades.reduce((a, t) => a + (t.realized_pl || 0), 0);

  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
      <table className="w-full text-sm text-slate-700">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className={th}>Ticker</th>
            <th className={th}>Opened</th>
            <th className={th}>Closed</th>
            <th className={th}>Expiry</th>
            <th className={`${th} text-right`}>Short Strike</th>
            <th className={`${th} text-right`}>Long Strike</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Short Entry</th>
            <th className={`${th} text-right`}>Long Entry</th>
            <th className={`${th} text-right`}>Net Credit</th>
            <th className={`${th} text-right`}>Short Exit</th>
            <th className={`${th} text-right`}>Long Exit</th>
            <th className={`${th} text-right`}>Close Debit</th>
            <th className={`${th} text-right`}>Realized P/L</th>
            <th className={`${th} text-center`}>Result</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className={`${td} font-semibold text-slate-900`}>{t.ticker}</td>
              <td className={`${td} text-slate-500`}>{t.open_date}</td>
              <td className={`${td} text-slate-500`}>{t.close_date}</td>
              <td className={`${td} text-slate-500`}>{t.expiry}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.short_strike)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.long_strike)}</td>
              <td className={`${td} text-right`}>{t.qty}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.short_entry)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.long_entry)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.net_credit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.short_exit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.long_exit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.close_debit)}</td>
              <td className={`${td} text-right font-semibold ${t.realized_pl > 0 ? "text-emerald-600" : t.realized_pl < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(t.realized_pl)}
              </td>
              <td className={`${td} text-center`}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  t.close_reason === "expired" ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-700"
                }`}>
                  {t.close_reason === "expired" ? "EXPIRED" : "CLOSED"}
                </span>
              </td>
            </tr>
          ))}
          {trades.length > 0 && (
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className={`${td} text-[11px] uppercase tracking-wider text-slate-500`}>Totals</td>
              <td className={td} colSpan={12}></td>
              <td className={`${td} text-right ${totalPL > 0 ? "text-emerald-600" : totalPL < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(totalPL)}
              </td>
              <td className={td}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}