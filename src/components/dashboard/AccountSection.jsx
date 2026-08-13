import { fmtMoney, fmtPct } from "@/lib/format";
import SpreadTable from "./SpreadTable";
import { AlertTriangle } from "lucide-react";

export default function AccountSection({ account, onCloseSpread }) {
  const stats = [
    { label: "Equity", value: fmtMoney(account.equity) },
    { label: "Cash", value: fmtMoney(account.cash) },
    { label: "Options BP", value: fmtMoney(account.optionsBuyingPower) },
    { label: "Risk / Equity", value: fmtPct(account.riskPct) },
    {
      label: "P/L / Equity",
      value: fmtPct(account.plPct),
      tone: account.totals.pl > 0 ? "text-emerald-400" : account.totals.pl < 0 ? "text-rose-400" : ""
    }
  ];

  return (
    <section className="bg-[#111725] border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-white">{account.name}</h2>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              account.type === "Live"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-sky-500/10 text-sky-400 border-sky-500/25"
            }`}
          >
            {account.type}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 ml-auto">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-sm font-medium tabular-nums ${s.tone || "text-slate-200"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      {!account.ok ? (
        <div className="px-5 py-6 flex items-center gap-3 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Connection failed — check the API keys for this account. ({account.error})
        </div>
      ) : account.spreads.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-500">No open put credit spreads in this account.</div>
      ) : (
        <SpreadTable spreads={account.spreads} onClose={(spread) => onCloseSpread(account, spread)} />
      )}
    </section>
  );
}