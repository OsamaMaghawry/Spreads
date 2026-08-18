import { fmtMoney } from "@/lib/format";

const strikes = (a, b) => `${fmtMoney(a)} / ${fmtMoney(b)}`;

// Compact one-glance identity of a position: the legs that define it.
export default function SpreadStructure({ spread: s }) {
  if (s.type === "iron_condor") {
    return (
      <span className="text-xs text-slate-600">
        <span className="text-slate-400">{s.putRatio > 1 ? `${s.putRatio}× ` : ""}</span>
        {strikes(s.shortStrike, s.longStrike)} <span className="text-slate-400">P</span>
        <span className="text-slate-300 mx-1">·</span>
        <span className="text-slate-400">{s.callRatio > 1 ? `${s.callRatio}× ` : ""}</span>
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