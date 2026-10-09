import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { tradeEndings, tradeLabel } from "@/lib/tradeEndings";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const tone = (v) => (v >= 0 ? "text-emerald-600" : "text-rose-600");

const STRATEGY = {
  spreads: "spread",
  covered_call: "covered call",
  cash_secured_put: "cash-secured put",
  iron_condor: "iron condor",
  long_call: "long call",
  long_put: "long put"
};

// How each closed trade ended. Every trade sits in one row, so the rows add
// up to the booked total. Grouping and why: src/lib/tradeEndings.js.
export default function TradeEndings({ trades, view = "whole" }) {
  const [open, setOpen] = useState(null);
  const e = tradeEndings(trades, view);
  if (e.count === 0) return null;
  const premium = view === "premium";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-900">How your trades ended</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {premium ? "Option legs only. " : ""}Tap a row to see its trades.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>How it ended</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Result</th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map((r) => {
              const expanded = open === r.key;
              return (
                <Fragment key={r.key}>
                  <tr className="border-b border-slate-100">
                    <td className={`${td} font-medium text-slate-900`}>
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : r.key)}
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 hover:text-slate-600"
                      >
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
                        {r.label}
                        {r.key === "assigned" && !premium && <span className="font-normal text-slate-400">(shares included)</span>}
                      </button>
                    </td>
                    <td className={`${td} text-right`}>{r.count}</td>
                    <td className={`${td} text-right ${tone(r.pl)}`}>{fmtMoney(r.pl)}</td>
                  </tr>
                  {expanded &&
                    r.trades.map(({ trade: t, pl }) => (
                      <tr key={t.id || `${t.trade_key}-${t.open_date}-${t.short_symbol}-${t.long_symbol}`} className="border-b border-slate-100 bg-slate-50/60 text-xs">
                        <td className={`${td} pl-8`}>
                          <span className="text-slate-900">{tradeLabel(t)}</span>
                          <span className="text-slate-400"> · {STRATEGY[t.strategy] || t.strategy}</span>
                        </td>
                        <td className={`${td} text-right text-slate-500`}>
                          {t.open_date} → {String(t.close_date).slice(0, 10)}
                        </td>
                        <td className={`${td} text-right ${tone(pl)}`}>{fmtMoney(pl)}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            <tr className="bg-slate-50">
              <td className={`${td} pl-[30px] font-semibold text-slate-900`}>Total</td>
              <td className={`${td} text-right font-semibold text-slate-900`}>{e.count}</td>
              <td className={`${td} text-right font-semibold ${tone(e.total)}`}>{fmtMoney(e.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
