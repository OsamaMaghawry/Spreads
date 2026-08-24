import { useState } from "react";
import { fmtMoney } from "@/lib/format";
import { ArrowDown } from "lucide-react";
import EarningsWarning from "@/components/common/EarningsWarning";

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-2.5 whitespace-nowrap tabular-nums";

function structureLabel(c) {
  const put = c.legs.filter((l) => l.role.endsWith("_put"));
  const call = c.legs.filter((l) => l.role.endsWith("_call"));
  const side = (legs, suffix) => {
    if (legs.length === 0) return null;
    const short = legs.find((l) => l.side === "sell");
    const long = legs.find((l) => l.side === "buy");
    const ratio = short?.ratio > 1 ? `${short.ratio}× ` : "";
    return `${ratio}${short.strike}/${long.strike}${suffix}`;
  };
  return [side(put, "P"), side(call, "C")].filter(Boolean).join(" · ");
}

const SORTS = [
  { key: "returnOnRisk", label: "RoR" },
  { key: "credit", label: "Credit" },
  { key: "maxRisk", label: "Max Risk" }
];

// Ranked scan results for the screener.
//
// Counterpart: components/open/CandidateList.jsx renders the same candidate
// objects inside the account's own open-position dialog. What a candidate row
// tells a trader has to match in both — change one, change the other.
export default function ResultsTable({ candidates, onTrade }) {
  const [sortKey, setSortKey] = useState("returnOnRisk");
  const [asc, setAsc] = useState(false);

  const sorted = [...candidates].sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
  const toggle = (key) => {
    if (key === sortKey) setAsc(!asc);
    else { setSortKey(key); setAsc(key === "maxRisk"); }
  };

  const sortableTh = (key, label, align = "text-right") => (
    <th className={`${th} ${align} cursor-pointer select-none hover:text-slate-900`} onClick={() => toggle(key)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === key && <ArrowDown className={`w-3 h-3 ${asc ? "rotate-180" : ""}`} />}
      </span>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-slate-700">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className={th}>#</th>
            <th className={th}>Ticker</th>
            <th className={th}>Expiry</th>
            <th className={th}>Structure</th>
            <th className={`${th} text-right`}>Spot</th>
            <th className={`${th} text-right`}>Short Δ</th>
            {SORTS.map((s) => sortableTh(s.key, s.label))}
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const shortLeg = c.legs.find((l) => l.side === "sell");
            return (
              <tr key={c.legs.map((l) => l.symbol).join("|")} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className={`${td} text-slate-400`}>{i + 1}</td>
                <td className={`${td} font-semibold text-slate-900`}>
                  <span className="inline-flex items-center gap-1.5">
                    {c.ticker}
                    <EarningsWarning earnings={c.earnings} ticker={c.ticker} compact />
                  </span>
                </td>
                <td className={`${td} text-slate-500`}>{c.expiry}</td>
                <td className={td}>{structureLabel(c)}</td>
                <td className={`${td} text-right`}>{fmtMoney(c.spot)}</td>
                <td className={`${td} text-right`}>{Math.abs(shortLeg?.delta ?? 0).toFixed(2)}</td>
                <td className={`${td} text-right font-semibold text-emerald-600`}>{(c.returnOnRisk * 100).toFixed(1)}%</td>
                {/* Per contract, so it sits in the same unit as Max Risk beside
                    it and as the preview this row opens. Sorting uses the raw
                    value and is unaffected. */}
                <td className={`${td} text-right`}>{fmtMoney(c.credit * 100)}</td>
                <td className={`${td} text-right`}>{fmtMoney(c.maxRisk)}</td>
                <td className={td}>
                  <button
                    onClick={() => onTrade(c)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    Trade
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}