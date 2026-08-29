import { fmtMoney } from "@/lib/format";
import { STRATEGIES, strategyOf, sumBy } from "@/lib/strategies";

// A tab per category, each carrying its own three-part breakdown rather than
// one figure. "How much of this came from premium" is the first question anyone
// asks of a credit strategy, and a single number cannot answer it.
export default function StrategyTabs({ trades, active, onChange }) {
  const groups = [{ key: "all", label: "All", rows: trades }].concat(
    STRATEGIES.map((s) => ({
      key: s.key,
      label: s.label,
      rows: trades.filter((t) => strategyOf(t) === s.key)
    }))
  );

  return (
    <div className="flex flex-wrap gap-2">
      {groups
        .filter((g) => g.key === "all" || g.rows.length > 0)
        .map((g) => {
          const total = sumBy(g.rows, "realized_pl");
          const isActive = active === g.key;
          return (
            <button
              key={g.key}
              onClick={() => onChange(g.key)}
              className={`rounded-lg border px-3.5 py-2 text-left transition-colors ${
                isActive
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{g.label}</span>
                <span className="text-xs text-slate-500">{g.rows.length}</span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    total >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {fmtMoney(total)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                {fmtMoney(sumBy(g.rows, "premium_pl"))} premium ·{" "}
                {fmtMoney(sumBy(g.rows, "early_close_pl"))} close ·{" "}
                {fmtMoney(sumBy(g.rows, "stock_pl"))} shares
              </div>
            </button>
          );
        })}
    </div>
  );
}
