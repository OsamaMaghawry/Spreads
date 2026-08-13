import { Link } from "react-router-dom";
import { fmtMoney, fmtPct } from "@/lib/format";
import { AlertTriangle, ChevronRight } from "lucide-react";

export default function AccountSummaryCard({ account }) {
  const t = account.totals || {};
  const openOrders = (account.spreads || []).reduce((n, s) => n + (s.openOrders?.length || 0), 0);
  const stats = [
    { label: "Equity", value: fmtMoney(account.equity) },
    { label: "Cash", value: fmtMoney(account.cash) },
    { label: "Options BP", value: fmtMoney(account.optionsBuyingPower) },
    { label: "Spreads", value: (account.spreads || []).length },
    { label: "Credit", value: fmtMoney(t.credit) },
    { label: "Max risk", value: fmtMoney(t.risk), sub: `${fmtPct(account.riskPct)} of equity` },
    { label: "Cost to close", value: fmtMoney(t.closeCost) },
    {
      label: "Unrealized P/L",
      value: fmtMoney(t.pl),
      sub: fmtPct(account.plPct),
      tone: t.pl > 0 ? "text-emerald-400" : t.pl < 0 ? "text-rose-400" : ""
    }
  ];

  return (
    <Link
      to={`/account/${account.id}`}
      className="block bg-[#111725] border border-white/[0.06] rounded-xl p-5 hover:border-emerald-500/30 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <h3 className="text-base font-semibold text-white">{account.name}</h3>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            account.type === "Live"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-sky-500/10 text-sky-400 border-sky-500/25"
          }`}
        >
          {account.type}
        </span>
        {openOrders > 0 && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/25">
            {openOrders} open order{openOrders > 1 ? "s" : ""}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
      </div>

      {!account.ok ? (
        <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {/rate limit/i.test(account.error || "")
            ? "Alpaca is rate-limiting this account right now."
            : `Connection failed — check the API keys. (${account.error})`}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-sm font-medium tabular-nums ${s.tone || "text-slate-200"}`}>{s.value}</div>
              {s.sub && <div className="text-[11px] text-slate-500 tabular-nums">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}