import { fmtMoney } from "@/lib/format";

const LABELS = { all: "All", spreads: "Spreads", wheel: "Wheel", unknown: "Untagged" };

export default function StrategyTabs({ trades, active, onChange }) {
  const keys = ["all", "spreads", "wheel", "unknown"];
  const stats = {};
  keys.forEach((k) => {
    const rows = k === "all" ? trades : trades.filter((t) => (t.strategy || "unknown") === k);
    stats[k] = { count: rows.length, pl: rows.reduce((a, t) => a + (t.realized_pl || 0), 0) };
  });

  return (
    <div className="flex flex-wrap gap-2">
      {keys.filter((k) => k === "all" || stats[k].count > 0).map((k) => {
        const isActive = active === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`px-3.5 py-2 rounded-lg border text-sm transition-colors ${
              isActive
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium">{LABELS[k]}</span>
            <span className="ml-2 text-xs text-slate-500">{stats[k].count}</span>
            <span className={`ml-2 text-xs font-medium tabular-nums ${stats[k].pl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtMoney(stats[k].pl)}
            </span>
          </button>
        );
      })}
    </div>
  );
}