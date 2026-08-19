import { fmtMoney, fmtPct } from "@/lib/format";

export default function MasterSummary({ accounts }) {
  const t = accounts.reduce(
    (acc, a) => ({
      equity: acc.equity + a.equity,
      cash: acc.cash + a.cash,
      obp: acc.obp + a.optionsBuyingPower,
      count: acc.count + a.spreads.length,
      credit: acc.credit + a.totals.credit,
      risk: acc.risk + a.totals.risk,
      pl: acc.pl + a.totals.pl
    }),
    { equity: 0, cash: 0, obp: 0, count: 0, credit: 0, risk: 0, pl: 0 }
  );

  const cards = [
    { label: "Combined Equity", value: fmtMoney(t.equity) },
    { label: "Cash", value: fmtMoney(t.cash) },
    { label: "Options Buying Power", value: fmtMoney(t.obp) },
    { label: "Open Spreads", value: t.count },
    { label: "Total Credit", value: fmtMoney(t.credit) },
    { label: "Total Max Risk", value: fmtMoney(t.risk), sub: t.equity > 0 ? `${fmtPct(t.risk / t.equity)} of equity` : null },
    {
      label: "Unrealized P/L",
      value: fmtMoney(t.pl),
      sub: t.equity > 0 ? `${fmtPct(t.pl / t.equity)} of equity` : null,
      tone: t.pl > 0 ? "text-emerald-600" : t.pl < 0 ? "text-rose-600" : ""
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{c.label}</div>
          <div className={`text-lg font-semibold tabular-nums ${c.tone || "text-slate-900"}`}>{c.value}</div>
          {c.sub && <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}