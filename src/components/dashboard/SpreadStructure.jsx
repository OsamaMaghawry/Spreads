import { fmtMoney } from "@/lib/format";
import { isSingle, kindOf } from "@/lib/positionKind";

const strikes = (a, b) => `${fmtMoney(a)} / ${fmtMoney(b)}`;

// Compact one-glance identity of a position: the legs that define it.
export default function SpreadStructure({ spread: s }) {
  // A single leg has one strike, not two, and shares have none at all. Passing
  // them through the two-strike renderer printed "$465.00 / $0.00".
  if (isSingle(s)) {
    if (s.type === "shares") {
      return (
        <span className="text-xs text-slate-600">
          {s.shareQty} {Math.abs(s.shareQty) === 1 ? "share" : "shares"}{" "}
          <span className="text-slate-400">@ {fmtMoney(s.longEntryPrice)}</span>
        </span>
      );
    }
    const leg = s.legs?.[0];
    if (!leg) return <span className="text-xs text-slate-600">{kindOf(s)?.label}</span>;
    return (
      <span className="text-xs text-slate-600">
        {fmtMoney(leg.strike)} <span className="text-slate-400">{leg.kind === "call" ? "C" : "P"}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span className="text-slate-400">{kindOf(s)?.label}</span>
      </span>
    );
  }

  if (s.type === "iron_condor") {
    return (
      <span className="text-xs text-slate-600">
        <span className="text-slate-400">{s.putRatio}× </span>
        {strikes(s.shortStrike, s.longStrike)} <span className="text-slate-400">P</span>
        <span className="text-slate-300 mx-1">·</span>
        <span className="text-slate-400">{s.callRatio}× </span>
        {strikes(s.callShortStrike, s.callLongStrike)} <span className="text-slate-400">C</span>
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-600">
      {strikes(s.shortStrike, s.longStrike)}{" "}
      <span className="text-slate-400">{s.type === "call_spread" ? "C" : "P"}</span>
    </span>
  );
}