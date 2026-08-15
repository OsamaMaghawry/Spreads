import { Calendar } from "lucide-react";

const presets = [
  { label: "All", days: null },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "6M", days: 182 },
  { label: "YTD", ytd: true },
  { label: "1Y", days: 365 }
];

const iso = (d) => d.toISOString().slice(0, 10);

export default function DateRangeFilter({ from, to, onChange, bounds }) {
  const applyPreset = (p) => {
    if (p.days === null && !p.ytd) return onChange({ from: "", to: "" });
    const end = new Date();
    const start = p.ytd ? new Date(end.getFullYear(), 0, 1) : new Date(end.getTime() - p.days * 86400000);
    onChange({ from: iso(start), to: iso(end) });
  };

  const inputCls = "bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
      <Calendar className="w-4 h-4 text-slate-400" />
      <span className="text-xs text-slate-500 mr-1">Date range</span>
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <input
          type="date"
          value={from}
          min={bounds?.min}
          max={to || bounds?.max}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className={inputCls}
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="date"
          value={to}
          min={from || bounds?.min}
          max={bounds?.max}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className={inputCls}
        />
        {(from || to) && (
          <button onClick={() => onChange({ from: "", to: "" })} className="text-[11px] text-slate-500 hover:text-slate-900 underline">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}