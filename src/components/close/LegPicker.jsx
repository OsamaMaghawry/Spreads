import { legLabel } from "@/lib/spreadLegs";

export default function LegPicker({ legs, selected, onToggle, units }) {
  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
      {legs.map((leg) => {
        const isOn = selected.includes(leg.symbol);
        return (
          <button
            key={leg.symbol}
            onClick={() => onToggle(leg.symbol)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              isOn ? "bg-emerald-50" : "bg-white hover:bg-slate-50"
            }`}
          >
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                isOn ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="flex-1">
              <span className={leg.side === "short" ? "text-rose-700" : "text-slate-700"}>{legLabel(leg)}</span>
              <span className="text-slate-400"> · {leg.side === "short" ? "buy to close" : "sell to close"}</span>
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {units * (leg.ratio || 1)} contract{units * (leg.ratio || 1) > 1 ? "s" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}