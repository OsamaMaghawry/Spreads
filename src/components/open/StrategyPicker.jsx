const OPTIONS = [
  { value: "put_spread", label: "Put spread", hint: "Bullish / neutral" },
  { value: "call_spread", label: "Call spread", hint: "Bearish / neutral" },
  { value: "iron_condor", label: "Iron condor", hint: "Neutral, 4 legs" }
];

export default function StrategyPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
            value === o.value
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className={`text-sm font-medium ${value === o.value ? "text-emerald-700" : "text-slate-800"}`}>{o.label}</div>
          <div className="text-[11px] text-slate-500">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}