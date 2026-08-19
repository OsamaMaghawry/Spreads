import { fmtMoney } from "@/lib/format";

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
              <span className="font-semibold text-slate-900">{c.ticker}</span>
              <span className="text-emerald-600 font-medium tabular-nums">
                {(c.returnOnRisk * 100).toFixed(1)}% on risk
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span>
                {c.expiry} · Δ {c.targetDelta} · width {fmtMoney(c.wingWidth)}
              </span>
              <span>
                credit {fmtMoney(c.credit)} · risk {fmtMoney(c.maxRisk)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}