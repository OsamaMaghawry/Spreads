import { fmtMoney } from "@/lib/format";

const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(d));

export default function StatCards({ stats }) {
  const groups = [
    {
      title: "Returns",
      items: [
        { label: "Realized P/L", value: fmtMoney(stats.totalPL), tone: stats.totalPL >= 0 ? "pos" : "neg" },
        { label: "Return on equity", value: pct(stats.roe), sub: "Realized P/L ÷ account equity", tone: stats.roe >= 0 ? "pos" : "neg" },
        { label: "Annualized return", value: pct(stats.annualized), sub: `Over ${stats.spanDays} days of history`, tone: stats.annualized >= 0 ? "pos" : "neg" },
        { label: "Return on risk", value: pct(stats.returnOnRisk), sub: `vs ${fmtMoney(stats.peakRisk)} peak capital at risk` },
        { label: "Avg return / trade", value: pct(stats.avgTradeRoR, 2), sub: "Each trade's P/L ÷ its own collateral" },
        { label: "Credit collected", value: fmtMoney(stats.creditCollected) },
        { label: "Credit capture", value: pct(stats.captureRate), sub: "Kept share of premium sold" }
      ]
    },
    {
      title: "Consistency",
      items: [
        { label: "Win rate", value: pct(stats.winRate), sub: `${stats.wins}W / ${stats.losses}L${stats.scratches ? ` / ${stats.scratches} flat` : ""}` },
        { label: "Profit factor", value: num(stats.profitFactor), sub: "Gross wins ÷ gross losses" },
        { label: "Expectancy / trade", value: fmtMoney(stats.avgPL), tone: stats.avgPL >= 0 ? "pos" : "neg" },
        { label: "Payoff ratio", value: num(stats.payoffRatio), sub: "Avg win ÷ avg loss" },
        { label: "Avg win", value: fmtMoney(stats.avgWin), tone: "pos" },
        { label: "Avg loss", value: fmtMoney(stats.avgLoss), tone: "neg" }
      ]
    },
    {
      title: "Risk & activity",
      items: [
        { label: "Max drawdown", value: fmtMoney(stats.maxDrawdown ? -stats.maxDrawdown : 0), sub: "Peak-to-trough realized", tone: "neg" },
        { label: "Largest win", value: fmtMoney(stats.largestWin), tone: "pos" },
        { label: "Largest loss", value: fmtMoney(stats.largestLoss), tone: "neg" },
        { label: "Avg risk / trade", value: fmtMoney(stats.avgRisk) },
        { label: "Trades", value: `${stats.trades}`, sub: `${stats.contracts} contracts · ${stats.expiredCount} expired worthless` },
        { label: "Avg hold", value: `${num(stats.avgHoldDays, 1)} days` }
      ]
    },
    {
      title: "By trading day",
      items: [
        { label: "Green days", value: pct(stats.dayWinRate), sub: `${stats.tradingDays} closing days` },
        { label: "Avg per day", value: fmtMoney(stats.avgDayPL), tone: stats.avgDayPL >= 0 ? "pos" : "neg" },
        { label: "Best day", value: fmtMoney(stats.bestDay?.pl || 0), sub: stats.bestDay?.date, tone: "pos" },
        { label: "Worst day", value: fmtMoney(stats.worstDay?.pl || 0), sub: stats.worstDay?.date, tone: "neg" },
        { label: "Best win streak", value: `${stats.bestStreak} ${stats.bestStreak === 1 ? "trade" : "trades"}` },
        { label: "Worst loss streak", value: `${stats.worstStreak} ${stats.worstStreak === 1 ? "trade" : "trades"}` }
      ]
    }
  ];

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">{g.title}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {g.items.map((it) => (
              <div key={it.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="text-[11px] text-slate-500">{it.label}</div>
                <div
                  className={`text-lg font-semibold tabular-nums mt-1 ${
                    it.tone === "pos" ? "text-emerald-600" : it.tone === "neg" ? "text-rose-600" : "text-slate-900"
                  }`}
                >
                  {it.value}
                </div>
                {it.sub && <div className="text-[10px] text-slate-400 mt-1 leading-snug">{it.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}