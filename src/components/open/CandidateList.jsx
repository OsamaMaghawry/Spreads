import { fmtMoney } from "@/lib/format";
import EarningsWarning from "@/components/common/EarningsWarning";

// Ranked scan results inside the account's own open-position dialog.
//
// Counterpart: components/screener/ResultsTable.jsx renders the same candidate
// objects for the screener. What a candidate row tells a trader has to match in
// both — change one, change the other.
export default function CandidateList({ candidates, selected, onSelect }) {
  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50 sticky top-0">
        {candidates.length} setups — ranked by return on risk
      </div>
      {candidates.map((c) => {
        const key = c.legs.map((l) => l.symbol).join("|");
        const isSel = selected === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(c)}
            className={`w-full text-left px-3 py-2 transition-colors ${isSel ? "bg-emerald-50" : "hover:bg-slate-50"}`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                {c.ticker}
                <EarningsWarning earnings={c.earnings} ticker={c.ticker} compact />
              </span>
              <span className="text-emerald-600 font-medium tabular-nums">
                {(c.returnOnRisk * 100).toFixed(1)}% on risk
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              {/* c.width is the actual strike distance; c.wingWidth is only what
                  was requested. Showing the requested one here put "width $1.00"
                  next to a risk figure derived from a real $2.50 spread. */}
              <span>
                {c.expiry} · Δ {c.targetDelta} · width {fmtMoney(c.width)}
              </span>
              {/* Per contract, matching SetupPreview — a row saying $0.93 above a
                  preview saying $93.00 for the same trade reads as a bug. */}
              <span>
                credit {fmtMoney(c.credit * 100)} · risk {fmtMoney(c.maxRisk)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}