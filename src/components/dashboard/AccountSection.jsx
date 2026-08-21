import { useState } from "react";
import { fmtMoney, fmtPct } from "@/lib/format";
import SpreadTable from "./SpreadTable";
import PositionCards from "./PositionCards";
import { AlertTriangle, LayoutGrid, Table2 } from "lucide-react";

export default function AccountSection({ account, onCloseSpread }) {
  const [view, setView] = useState("simple");
  const stats = [
    { label: "Equity", value: fmtMoney(account.equity) },
    {
      label: "Equity at Exp",
      value: account.equityAtExp != null ? fmtMoney(account.equityAtExp) : "—",
      tone:
        account.equityAtExp > account.equity
          ? "text-emerald-600"
          : account.equityAtExp < account.equity
            ? "text-rose-600"
            : ""
    },
    { label: "Cash", value: fmtMoney(account.cash) },
    { label: "Options BP", value: fmtMoney(account.optionsBuyingPower) },
    { label: "Risk / Equity", value: fmtPct(account.riskPct) },
    {
      label: "P/L / Equity",
      value: fmtPct(account.plPct),
      tone: account.totals.pl > 0 ? "text-emerald-600" : account.totals.pl < 0 ? "text-rose-600" : ""
    }
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-slate-900">{account.name}</h2>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              account.type === "Live"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-sky-50 text-sky-700 border-sky-200"
            }`}
          >
            {account.type}
          </span>
          <div className="ml-1 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {[
              { id: "simple", label: "Simple", Icon: LayoutGrid },
              { id: "detailed", label: "Detailed", Icon: Table2 }
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 ml-auto">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-sm font-medium tabular-nums ${s.tone || "text-slate-800"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      {!account.ok ? (
        <div className="px-5 py-6 flex items-center gap-3 text-amber-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {/rate limit/i.test(account.error || "")
            ? "Alpaca is rate-limiting this account right now — data will reappear on the next refresh."
            : `Connection failed — check the API keys for this account. (${account.error})`}
        </div>
      ) : account.spreads.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-500">No open put credit spreads in this account.</div>
      ) : view === "simple" ? (
        <PositionCards
          spreads={account.spreads}
          accountId={account.id}
          onClose={(spread) => onCloseSpread(account, spread)}
        />
      ) : (
        <SpreadTable
          spreads={account.spreads}
          accountId={account.id}
          onClose={(spread) => onCloseSpread(account, spread)}
        />
      )}
    </section>
  );
}