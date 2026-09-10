import { fmtMoney } from "@/lib/format";

// Whole view / Premium only.
//
// The owner's names, kept over the ones the bench proposed, because they say
// what each view is FOR rather than what it technically contains:
//
//   Whole view    "How is the strategy doing?"      -> judging performance
//   Premium only  "What have I actually banked?"    -> reconciling to a 1099-B
//
// WHOLE VIEW IS THE DEFAULT, and the reason is not prudence. A wheel trader who
// is assigned has not lost: he has been paid a premium and bought stock at a
// discount he chose in advance. Half his return lives in the shares by design.
// Reporting only the premium describes a different strategy from the one being
// run -- on the account this was built for, +$1,737 against roughly +$11,000.
//
// The symmetry is what makes the default honest rather than promotional: in a
// week those shares are down, Whole view shows the loss just as loudly.

export default function ViewSwitch({ value, onChange, whole, premium, wholeUnknown }) {
  const opts = [
    {
      key: "whole",
      label: "Whole view",
      sub: "Options + shares",
      figure: wholeUnknown ? null : whole
    },
    {
      key: "premium",
      label: "Premium only",
      sub: "Option legs",
      figure: premium
    }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-1.5 inline-flex gap-1.5 flex-wrap">
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`text-left px-3.5 py-2 rounded-lg transition-colors ${
              on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="block text-xs font-semibold">{o.label}</span>
            <span className={`block text-[10px] ${on ? "text-slate-300" : "text-slate-400"}`}>{o.sub}</span>
            <span className={`block text-sm font-semibold tabular-nums mt-0.5 ${
              o.figure === null
                ? on ? "text-slate-400" : "text-slate-400"
                : o.figure >= 0
                  ? on ? "text-emerald-300" : "text-emerald-600"
                  : on ? "text-rose-300" : "text-rose-600"
            }`}>
              {o.figure === null ? "—" : `${o.figure >= 0 ? "+" : ""}${fmtMoney(o.figure)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
