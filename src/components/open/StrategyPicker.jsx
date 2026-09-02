import { STRATEGY_LABEL } from "@/lib/setupUnit";

// Five ways to sell premium, plus -- on the screener only -- the wheel, which
// is the last two run together: puts on the universe, calls on the shares
// this account holds.
const OPTIONS = [
  { value: "put_spread", label: STRATEGY_LABEL.put_spread, hint: "Bullish / neutral" },
  { value: "call_spread", label: STRATEGY_LABEL.call_spread, hint: "Bearish / neutral" },
  { value: "iron_condor", label: STRATEGY_LABEL.iron_condor, hint: "Neutral, 4 legs" },
  { value: "cash_secured_put", label: STRATEGY_LABEL.cash_secured_put, hint: "Sell a put, hold the cash" },
  { value: "covered_call", label: STRATEGY_LABEL.covered_call, hint: "Sell a call on shares you hold" }
];
const WHEEL = { value: "wheel", label: "Wheel", hint: "Both, on this account" };

export default function StrategyPicker({ value, onChange, withWheel = false }) {
  const options = withWheel ? [...OPTIONS, WHEEL] : OPTIONS;
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
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
