import { fmtMoney } from "@/lib/format";

const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(d));

// Every card reads whatever `computeStats` was told to measure, so the labels
// have to say WHICH measurement or the page is precise and unlabelled. Three
// things vary: whether a trade's result means the whole position or its option
// legs, whether the total carries the mark on shares still held, and whether
// drawdown came from real daily values or from booked trades alone.
export default function StatCards({ stats }) {
  const premium = stats.view === "premium";
  // "settled trades" appears on eleven cards; under Premium only they are the
  // same trades measured a different way, and saying so once per card is how a
  // reader who scrolls past the switch still knows what they are reading.
  const basis = premium ? "Option legs, settled trades" : "Settled trades";
  const totalLabel = premium
    ? "Option-leg P/L"
    : stats.includesUnrealized
      ? "Total P/L"
      : "Realized P/L";
  const totalSub = premium
    ? "Credits taken less debits paid, closed trades"
    : stats.includesUnrealized
      ? `${fmtMoney(stats.bookedPL)} booked + ${fmtMoney(stats.unrealizedPL)} on shares still held`
      : "Money booked on closed positions";

  const groups = [
    {
      title: "Returns",
      items: [
        { label: totalLabel, value: fmtMoney(stats.totalPL), sub: totalSub, tone: stats.totalPL >= 0 ? "pos" : "neg" },
        { label: "Return on equity", value: pct(stats.roe), sub: `${totalLabel} ÷ account equity`, tone: stats.roe === null ? undefined : stats.roe >= 0 ? "pos" : "neg" },
        // Withheld below 30 trades / 90 days: annualizing a short window
        // multiplies noise into a headline figure. The sub says so, so the
        // dash reads as deliberate rather than broken.
        { label: "Annualized (simple)", value: pct(stats.annualized), sub: stats.annualizable ? `ROE × 365 ÷ ${stats.spanDays} days` : "Needs 30 closed trades and 90 days of history", tone: stats.annualized === null ? undefined : stats.annualized >= 0 ? "pos" : "neg" },
        { label: "Annualized (CAGR)", value: pct(stats.cagr), sub: stats.annualizable ? "Compounded over the same span" : "Needs 30 closed trades and 90 days of history", tone: stats.cagr === null ? undefined : stats.cagr >= 0 ? "pos" : "neg" },
        { label: "Return on risk", value: pct(stats.returnOnRisk), sub: `vs ${fmtMoney(stats.peakRisk)} peak capital at risk` },
        { label: "Avg return / trade", value: pct(stats.avgTradeRoR, 2), sub: `Each trade's P/L ÷ its own collateral · ${basis.toLowerCase()}` },
        { label: "Credit collected", value: fmtMoney(stats.creditCollected) },
        // The one figure that does not follow the view, and the sub says
        // so. Fold assigned shares into the numerator and a put assigned
        // into stock that recovered reports capture above 100%.
        { label: "Credit capture", value: pct(stats.captureRate), sub: "Kept share of premium sold — option legs, both views" }
      ]
    },
    {
      title: "Consistency",
      items: [
        // Every figure in this group is measured over settled trades only: a
        // position whose shares are still held has a partial result, and
        // counting it as a win would flatter the page and then correct itself
        // downwards. The sub says how many were left out rather than leaving
        // the reader to wonder why the counts do not add up to Trades.
        {
          label: "Win rate",
          value: pct(stats.winRate),
          sub: `${stats.wins}W / ${stats.losses}L${stats.scratches ? ` / ${stats.scratches} flat` : ""}${
            stats.provisionalTrades ? ` · ${stats.provisionalTrades} not final, excluded` : ""
          }`
        },
        { label: "Profit factor", value: num(stats.profitFactor), sub: `Gross wins ÷ gross losses · ${basis.toLowerCase()}` },
        { label: "Expectancy / trade", value: fmtMoney(stats.avgPL), sub: basis, tone: stats.avgPL === null || stats.avgPL === undefined ? undefined : stats.avgPL >= 0 ? "pos" : "neg" },
        { label: "Payoff ratio", value: num(stats.payoffRatio), sub: `Avg win ÷ avg loss · ${basis.toLowerCase()}` },
        // A dash is not a positive number. Painting it green said "no settled
        // wins yet" in the colour reserved for winning.
        { label: "Avg win", value: fmtMoney(stats.avgWin), sub: basis, tone: stats.avgWin === null ? undefined : "pos" },
        { label: "Avg loss", value: fmtMoney(stats.avgLoss), sub: basis, tone: stats.avgLoss === null ? undefined : "neg" }
      ]
    },
    {
      title: "Risk & activity",
      items: [
        // Two different measurements under one name, so the sub names
        // which one. Booked trade by trade, a position that fell $9,000
        // and recovered registers NOTHING, because no trade closed while
        // it happened. The daily series has a mark for every day, so the
        // trough is the trough the account actually sat in.
        { label: "Max drawdown", value: fmtMoney(stats.maxDrawdown ? -stats.maxDrawdown : 0), sub: stats.drawdownFromDaily ? "Peak to trough, day by day" : "Peak to trough of money booked — daily values not stored yet", tone: "neg" },
        { label: "Largest win", value: fmtMoney(stats.largestWin), sub: basis, tone: stats.largestWin === null ? undefined : "pos" },
        { label: "Largest loss", value: fmtMoney(stats.largestLoss), sub: basis, tone: stats.largestLoss === null ? undefined : "neg" },
        { label: "Avg risk / trade", value: fmtMoney(stats.avgRisk) },
        { label: "Trades", value: `${stats.trades}`, sub: `${stats.contracts} contracts · ${stats.expiredCount} expired worthless` },
        { label: "Avg hold", value: `${num(stats.avgHoldDays, 1)} days` }
      ]
    },
    {
      title: "By trading day",
      items: [
        // Days, not trades: a green day is a day that booked money, and money
        // booked includes a position whose shares are still open. Said here
        // because it is the one figure in this group that reads like a win
        // rate and is not measured like one.
        { label: "Green days", value: pct(stats.dayWinRate), sub: `${stats.tradingDays} closing days · cash booked, all rows` },
        { label: "Avg per day", value: fmtMoney(stats.avgDayPL), sub: `${pct(stats.avgDayReturn, 3)} of equity · money booked, not the mark`, tone: stats.avgDayPL >= 0 ? "pos" : "neg" },
        { label: "Median per day", value: fmtMoney(stats.medianDayPL), sub: `${pct(stats.medianDayReturn, 3)} of equity`, tone: stats.medianDayPL >= 0 ? "pos" : "neg" },
        { label: "Avg return / day", value: pct(stats.avgDayReturn, 3), sub: `${pct(stats.avgDayRiskReturn, 2)} of capital at risk`, tone: stats.avgDayReturn === null ? undefined : stats.avgDayReturn >= 0 ? "pos" : "neg" },
        { label: "Median return / day", value: pct(stats.medianDayReturn, 3), sub: `${pct(stats.medianDayRiskReturn, 2)} of capital at risk`, tone: stats.medianDayReturn === null ? undefined : stats.medianDayReturn >= 0 ? "pos" : "neg" },
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