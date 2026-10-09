import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { captureBreakdown, tradeLabel } from "@/lib/capture";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const tone = (v) => (v >= 0 ? "text-emerald-600" : "text-rose-600");
const signed = (v) => (v >= 0 ? `+${fmtMoney(v)}` : fmtMoney(v));

const STRATEGY = {
  spreads: "spread",
  covered_call: "covered call",
  cash_secured_put: "cash-secured put",
  iron_condor: "iron condor"
};

// What share of the premium sold was kept. Grouping, the reason a buyback on
// expiry day counts as held to expiry, and the line that ties the table to
// the booked total: src/lib/capture.js.
export default function CaptureBreakdown({ trades }) {
  const [open, setOpen] = useState(null);
  const b = captureBreakdown(trades);
  if (b.all.trades === 0) return null;
  const r = b.reconcile;

  const summary = [
    { label: "Held to expiry day", data: b.held, note: "Expired, assigned, or bought back on expiry day" },
    { label: "Closed early", data: b.early, note: "Bought back before expiry day" },
    { label: "All trades", data: b.all, note: "Overall credit capture" }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-900">Credit capture</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          Share of the premium sold that was kept. Option legs only; shares are added in the last line.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
        {summary.map((s) => (
          <div key={s.label} className="p-4">
            <div className="text-[11px] text-slate-500">{s.label}</div>
            <div className="text-lg font-semibold tabular-nums text-slate-900 mt-1">{pct(s.data.weighted)}</div>
            <div className="text-[10px] text-slate-400 mt-1 leading-snug">
              {s.data.trades} trades · {fmtMoney(s.data.credit)} credit sold · {fmtMoney(s.data.pl)} kept
              <br />
              {s.note}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>Kept, early exits</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Share</th>
              <th className={`${th} text-right`}>Avg capture</th>
              <th className={`${th} text-right`}>Credit sold</th>
              <th className={`${th} text-right`}>Option P/L</th>
            </tr>
          </thead>
          <tbody>
            {b.buckets.map((k) => {
              const expanded = open === k.label;
              return (
                <Fragment key={k.label}>
                  <tr className="border-b border-slate-100">
                    <td className={`${td} font-medium text-slate-900`}>
                      {k.trades > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : k.label)}
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1 hover:text-slate-600"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
                          {k.label}
                        </button>
                      ) : (
                        <span className="pl-[18px]">{k.label}</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>{k.trades}</td>
                    <td className={`${td} text-right`}>{pct(b.early.trades ? k.trades / b.early.trades : 0, 0)}</td>
                    <td className={`${td} text-right`}>{pct(k.avg)}</td>
                    <td className={`${td} text-right`}>{fmtMoney(k.credit)}</td>
                    <td className={`${td} text-right ${tone(k.pl)}`}>{fmtMoney(k.pl)}</td>
                  </tr>
                  {expanded &&
                    k.rows.map(({ trade: t, credit, pl, capture }) => (
                      <tr key={t.id || `${t.trade_key}-${t.open_date}-${t.short_symbol}`} className="border-b border-slate-100 bg-slate-50/60 text-xs">
                        <td className={`${td} pl-8`}>
                          <span className="text-slate-900">{tradeLabel(t)}</span>
                          <span className="text-slate-400"> · {STRATEGY[t.strategy] || t.strategy}</span>
                        </td>
                        <td className={`${td} text-right text-slate-500`} colSpan={2}>
                          {t.open_date} → {String(t.close_date).slice(0, 10)}
                        </td>
                        <td className={`${td} text-right`}>{pct(capture)}</td>
                        <td className={`${td} text-right`}>
                          {fmtMoney(credit)}
                          <span className="text-slate-400"> · paid {fmtMoney(-(Number(t.early_close_pl) || 0))}</span>
                        </td>
                        <td className={`${td} text-right ${tone(pl)}`}>{fmtMoney(pl)}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {r.adds && (
        <p className="px-4 py-3 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed tabular-nums">
          Early exits {signed(r.early)} · held to expiry day {signed(r.held)} · options bought {signed(r.bought)} · shares{" "}
          {signed(r.shares)} = <span className={`font-medium ${tone(r.total)}`}>{signed(r.total)}</span> booked on closed trades.
        </p>
      )}
    </div>
  );
}
