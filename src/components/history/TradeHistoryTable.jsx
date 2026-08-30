import { fmtMoney } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { strategyOf, strategyLabel, strategyBadge, sumBy } from "@/lib/strategies";

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-2.5 whitespace-nowrap tabular-nums";

// Assignment and exercise are outcomes in their own right, not "closed". An
// assigned short keeps its whole premium and moves the result onto shares, so
// showing it as CLOSED hid where the money actually went.
const RESULT = {
  expired: "bg-slate-100 text-slate-600",
  closed: "bg-sky-100 text-sky-700",
  assigned: "bg-amber-100 text-amber-800",
  exercised: "bg-violet-100 text-violet-700"
};

// A signed figure, coloured, with nothing rendered for a component a position
// never had — a spread that expired has no early close, and printing $0.00
// three times a row buries the numbers that are real.
function Money({ value }) {
  const n = Number(value) || 0;
  if (n === 0) return <span className="text-slate-300">—</span>;
  return <span className={n > 0 ? "text-emerald-600" : "text-rose-600"}>{fmtMoney(n)}</span>;
}

export default function TradeHistoryTable({ trades }) {
  const total = (field) => sumBy(trades, field);

  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
      <table className="w-full text-sm text-slate-700">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className={th}>Ticker</th>
            <th className={th}>Strategy</th>
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
            <th className={`${th} text-right`}>Premium</th>
            <th className={`${th} text-right`}>Early Close</th>
            <th className={`${th} text-right`}>From Assignment</th>
            <th className={`${th} text-right`}>Total P/L</th>
            <th className={`${th} text-center`}>Result</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className={`${td} font-semibold text-slate-900`}>
                <span className="inline-flex items-center gap-1.5">
                  {t.ticker}
                  {t.unpaired && (
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-amber-500"
                      aria-label="Unpaired leg"
                      // A leg with no counterpart is either a genuinely single-leg
                      // position or a gap in what the broker reported. Flagging it
                      // beats the old behaviour, which booked an unpaired short as
                      // naked and dropped an unpaired long's cost entirely.
                      title="This leg has no counterpart — check it against your broker"
                    />
                  )}
                  {t.provisional && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                      // The option closed but the shares it delivered are still
                      // open, so this row's result is not final: when the shares
                      // are sold their result lands here, under this same close
                      // date. Without saying so, every assignment reads as a
                      // full-premium winner until the shares go.
                      title="Shares from this assignment are still held — this result will change when they are sold"
                    >
                      not final
                    </span>
                  )}
                </span>
              </td>
              <td className={td}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${strategyBadge(strategyOf(t))}`}>
                  {strategyLabel(strategyOf(t))}
                </span>
              </td>
              <td className={`${td} text-slate-500`}>{t.open_date}</td>
              <td className={`${td} text-slate-500`}>{t.close_date}</td>
              <td className={`${td} text-slate-500`}>{t.expiry}</td>
              <td className={`${td} text-right`}>{t.short_symbol ? fmtMoney(t.short_strike) : "—"}</td>
              <td className={`${td} text-right`}>{t.long_symbol ? fmtMoney(t.long_strike) : "—"}</td>
              <td className={`${td} text-right`}>{t.qty}</td>
              <td className={`${td} text-right`}>{t.short_symbol ? fmtMoney(t.short_entry) : "—"}</td>
              <td className={`${td} text-right`}>{t.long_symbol ? fmtMoney(t.long_entry) : "—"}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.net_credit)}</td>
              <td className={`${td} text-right`}>{t.short_symbol ? fmtMoney(t.short_exit) : "—"}</td>
              <td className={`${td} text-right`}>{t.long_symbol ? fmtMoney(t.long_exit) : "—"}</td>
              <td className={`${td} text-right`}>{fmtMoney(t.close_debit)}</td>
              <td className={`${td} text-right`}><Money value={t.premium_pl} /></td>
              <td className={`${td} text-right`}><Money value={t.early_close_pl} /></td>
              <td className={`${td} text-right`}><Money value={t.stock_pl} /></td>
              <td className={`${td} text-right font-semibold`}><Money value={t.realized_pl} /></td>
              <td className={`${td} text-center`}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RESULT[t.close_reason] || RESULT.closed}`}>
                  {(t.close_reason || "closed").toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
          {trades.length > 0 && (
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className={`${td} text-[11px] uppercase tracking-wider text-slate-500`}>Totals</td>
              <td className={td} colSpan={13}></td>
              <td className={`${td} text-right`}><Money value={total("premium_pl")} /></td>
              <td className={`${td} text-right`}><Money value={total("early_close_pl")} /></td>
              <td className={`${td} text-right`}><Money value={total("stock_pl")} /></td>
              <td className={`${td} text-right`}><Money value={total("realized_pl")} /></td>
              <td className={td}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}