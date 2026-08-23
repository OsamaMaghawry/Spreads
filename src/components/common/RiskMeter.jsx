import { riskBand, riskStyle } from "@/lib/risk";
import { fmtMoney } from "@/lib/format";

// How much of the account one order puts at risk.
//
// The bar is scaled so 70% of equity fills it: the interesting range for a
// defined-risk position is the bottom of the scale, and a bar that only moves
// once you are betting the account is a bar that never moves.
export default function RiskMeter({ risk, equity }) {
  if (!(equity > 0)) {
    return (
      <div className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
        Account equity unavailable, so this order&rsquo;s share of the account can&rsquo;t be shown.
      </div>
    );
  }

  const fraction = risk / equity;
  const band = riskBand(fraction);
  const style = riskStyle(band.key);
  const width = Math.min((fraction / 0.7) * 100, 100);

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500">Share of account at risk</span>
        <span className={`text-sm font-semibold tabular-nums ${style.text}`}>
          {(fraction * 100).toFixed(1)}%
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${style.bar} transition-all`} style={{ width: `${width}%` }} />
        {/* Band boundaries, drawn on the same 0–70% scale as the fill. */}
        {[0.10, 0.25, 0.50].map((t) => (
          <span key={t} className="absolute top-0 bottom-0 w-px bg-white/80" style={{ left: `${(t / 0.7) * 100}%` }} />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-medium ${style.text}`}>{band.label}</span>
        <span className="text-slate-500 tabular-nums">
          {fmtMoney(risk)} of {fmtMoney(equity)}
        </span>
      </div>

      <p className="text-xs text-slate-500">{band.note}</p>
    </div>
  );
}
