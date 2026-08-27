import { fmtMoney } from "@/lib/format";
import { heldToExpiry } from "@/lib/analytics";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

const BUCKETS = [
  { label: "Loss (< 0%)", min: -Infinity, max: 0 },
  { label: "0 – 50%", min: 0, max: 0.5 },
  { label: "50 – 70%", min: 0.5, max: 0.7 },
  { label: "70 – 80%", min: 0.7, max: 0.8 },
  { label: "80 – 90%", min: 0.8, max: 0.9 },
  { label: "90 – 100%", min: 0.9, max: Infinity }
];

// Per-trade share of the sold credit that was actually kept.
const rowsOf = (trades) =>
  trades
    .map((t) => {
      const credit = (t.net_credit || 0) * (t.qty || 0) * 100;
      return credit > 0 ? { credit, pl: t.realized_pl || 0, capture: (t.realized_pl || 0) / credit } : null;
    })
    .filter(Boolean);

const agg = (rows) => {
  const credit = rows.reduce((a, r) => a + r.credit, 0);
  const pl = rows.reduce((a, r) => a + r.pl, 0);
  return {
    trades: rows.length,
    credit,
    pl,
    weighted: credit > 0 ? pl / credit : null,
    avg: rows.length ? rows.reduce((a, r) => a + r.capture, 0) / rows.length : null
  };
};

export default function CaptureBreakdown({ trades }) {
  const early = rowsOf(trades.filter((t) => !heldToExpiry(t)));
  const expired = rowsOf(trades.filter(heldToExpiry));
  const all = agg([...early, ...expired]);
  const e = agg(early);
  const x = agg(expired);
  if (all.trades === 0) return null;

  const summary = [
    { label: "Held to expiry", data: x, note: "Expired, assigned or exercised" },
    { label: "Closed early", data: e, note: "Bought back before expiry" },
    { label: "All trades", data: all, note: "Overall credit capture" }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-900">Credit capture on early exits</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          How much of the premium sold was kept when positions were bought back instead of left to expire.
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
              <th className={th}>Credit kept (early exits)</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Share of early exits</th>
              <th className={`${th} text-right`}>Avg capture</th>
              <th className={`${th} text-right`}>Credit sold</th>
              <th className={`${th} text-right`}>P/L kept</th>
            </tr>
          </thead>
          <tbody>
            {BUCKETS.map((b) => {
              const rows = early.filter((r) => r.capture >= b.min && r.capture < b.max);
              const a = agg(rows);
              return (
                <tr key={b.label} className="border-b border-slate-100 last:border-0">
                  <td className={`${td} font-medium text-slate-900`}>{b.label}</td>
                  <td className={`${td} text-right`}>{a.trades}</td>
                  <td className={`${td} text-right`}>{pct(e.trades ? a.trades / e.trades : 0, 0)}</td>
                  <td className={`${td} text-right`}>{pct(a.avg)}</td>
                  <td className={`${td} text-right`}>{fmtMoney(a.credit)}</td>
                  <td className={`${td} text-right ${a.pl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtMoney(a.pl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}