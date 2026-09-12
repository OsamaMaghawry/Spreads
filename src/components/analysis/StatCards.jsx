import { fmtMoney } from "@/lib/format";

const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(d));

// Every card reads whatever `computeStats` was told to measure, so the labels
// have to say WHICH measurement or the page is precise and unlabelled. Three
// things vary: whether a trade's result means the whole position or its option
// legs, whether the total carries the mark on shares still held, and whether
// drawdown came from real daily values or from booked trades alone.
export default function StatCards({ stats, withheld = null }) {
  const premium = stats.view === "premium";
  // "settled trades" appears on eleven cards; under Premium only they are the
  // same trades measured a different way, and saying so once per card is how a
  // reader who scrolls past the switch still knows what they are reading.
  const basis = premium ? "Option legs, settled trades" : "Settled trades";
  // THE CAVEAT GOES ON THE FIGURES THE DOUBT TOUCHES.
  //
  // It used to sit on the Trades card, in "Risk & activity", while the figures
  // it actually qualifies -- win rate, profit factor, expectancy, payoff, the
  // largest win and loss -- sat two panels up saying only "Settled trades".
  // Removing a LOSER from that set raises every one of them, so the card that
  // moves is the card that has to say why.
  const n = withheld?.count || 0;
  const unattributed = n
    ? ` · ${n} more ${n === 1 ? "trade is" : "trades are"} in the totals but not here — we cannot say which position earned ${n === 1 ? "its" : "their"} result`
    : "";
  const totalLabel = premium
    ? "Option-leg P/L"
    : stats.includesUnrealized
      ? "Total P/L"
      : "Realized P/L";
  const totalSub = premium
    ? "Credits taken less debits paid, closed trades"
    : stats.includesUnrealized
      // fmtMoney already carries the sign, so a hard "+" printed
      // "$11,482.00 booked + -$3,200.00 on shares still held".
      // "on shares still held" was true until open option legs joined the
      // mark. On the owner's own book that mark is 210 TSLA shares AND the put
      // protecting them AND the calls written against them -- naming only the
      // shares would send a reader looking for the rest of it.
      ? `${fmtMoney(stats.bookedPL)} booked, ${stats.unrealizedPL >= 0 ? "plus" : "less"} ${fmtMoney(Math.abs(stats.unrealizedPL))} on positions still open`
      : "Money booked on closed positions";

  // Compliance rule 2: no annualized or compounded rate over a total that
  // includes an unrealized mark.
  const annualizable = stats.annualizable && !stats.includesUnrealized;

  const groups = [
    {
      title: "Returns",
      items: [
        { label: totalLabel, value: fmtMoney(stats.totalPL), sub: totalSub, tone: stats.totalPL >= 0 ? "pos" : "neg" },
        // NOT "÷ account equity" any more, and the label mattered as much as
        // the arithmetic. Account equity contains every deposit ever made, so
        // dividing by it credited a period's result to money that arrived at
        // the end of it — the owner's $700 deposit halved every rate on this
        // page. The denominator is the capital that actually earned the
        // result, weighted for when each dollar arrived, and the dash appears
        // when the transfers cannot be read rather than a rate over a
        // denominator nobody checked.
        {
          label: "Return on capital",
          value: pct(stats.roe),
          sub: stats.roe === null
            ? "Needs your deposits and withdrawals — we could not read them for this account"
            : `${totalLabel} ÷ capital at work, weighted for when it arrived`,
          tone: stats.roe === null ? undefined : stats.roe >= 0 ? "pos" : "neg"
        },
        // Withheld below 30 trades / 90 days: annualizing a short window
        // multiplies noise into a headline figure. The sub says so, so the
        // dash reads as deliberate rather than broken.
        // WITHHELD WHENEVER THE TOTAL CARRIES AN UNREALIZED MARK. A reversible
        // one-day paper gain on stock still held, divided by equity, multiplied
        // by 365 and compounded, is the one figure on this page that reads as a
        // performance advertisement. The same withholding the small-sample rule
        // already applies, for a stronger reason: below 30 trades the figure is
        // noisy, here it is built on money nobody has.
        { label: "Annualized (simple)", value: annualizable ? pct(stats.annualized) : "—", sub: annualizable ? `Return on capital × 365 ÷ ${stats.spanDays} days` : stats.includesUnrealized ? "Not annualized while the total includes an unrealized mark on open positions" : "Needs 30 closed trades and 90 days of history", tone: !annualizable || stats.annualized === null ? undefined : stats.annualized >= 0 ? "pos" : "neg" },
        { label: "Annualized (CAGR)", value: annualizable ? pct(stats.cagr) : "—", sub: annualizable ? "Compounded over the same span" : stats.includesUnrealized ? "Not annualized while the total includes an unrealized mark on open positions" : "Needs 30 closed trades and 90 days of history", tone: !annualizable || stats.cagr === null ? undefined : stats.cagr >= 0 ? "pos" : "neg" },
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
          // The basis belongs HERE most of all. On an ordinary losing wheel
          // cycle -- stock falls, put assigned -- Premium only reports 100% win
          // rate, largest loss "—" and a zero loss streak over a position that
          // lost money. Defensible as a statistic, indefensible unlabelled.
          sub: `${premium ? "Option legs only, shares excluded · " : ""}${stats.wins}W / ${stats.losses}L${stats.scratches ? ` / ${stats.scratches} flat` : ""}${
            stats.provisionalTrades ? ` · ${stats.provisionalTrades} not final, excluded` : ""
          }${unattributed}`
        },
        { label: "Profit factor", value: num(stats.profitFactor), sub: `Gross wins ÷ gross losses · ${basis.toLowerCase()}${unattributed}` },
        { label: "Expectancy / trade", value: fmtMoney(stats.avgPL), sub: `${basis}${unattributed}`, tone: stats.avgPL === null || stats.avgPL === undefined ? undefined : stats.avgPL >= 0 ? "pos" : "neg" },
        { label: "Payoff ratio", value: num(stats.payoffRatio), sub: `Avg win ÷ avg loss · ${basis.toLowerCase()}${unattributed}` },
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
        { label: "Largest loss", value: fmtMoney(stats.largestLoss), sub: `${basis}${unattributed}`, tone: stats.largestLoss === null ? undefined : "neg" },
        { label: "Avg risk / trade", value: fmtMoney(stats.avgRisk) },
        // WITHHELD ROWS ARE NAMED ON THE COUNT THEY ARE MISSING FROM, AND IN
        // DOLLARS.
        //
        // `stats.trades` counts what the arithmetic above it could use. A
        // closed trade whose figures the audit pass refused to publish is not
        // in it — and a trader comparing 43 trades at the broker against 42
        // here is owed the reason, not left to find the gap.
        //
        // The count ALONE is not enough, and the bench was blunt about why: on
        // the account this was built for, one withheld row is $189 against an
        // $814 total. "1 withheld" reads like a rounding note when it is a
        // fifth of the figure, and a confidently wrong total is worse than a
        // blank page because a blank page is obviously broken.
        //
        // The words "under review" stood here and are deleted rather than
        // softened: nothing queues a finding to a person, so they described a
        // process this product does not have.
        {
          label: "Trades",
          value: `${stats.trades}`,
          // FROM THE PAGE'S OWN SPLIT, not from `stats`.
          //
          // `computeStats` is handed an already-split set, so its own
          // `withheldTrades` is structurally always 0 and this line was dead
          // the moment the split moved higher up. That is the third time a
          // correctness fix has silently taken a disclosure off the screen,
          // which is why `analytics.test.js` now asserts the count REACHES
          // here rather than only that the totals are right.
          sub: `${stats.contracts} contracts · ${stats.expiredCount} expired worthless`
        },
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
        { label: "Green days", value: pct(stats.dayWinRate), sub: `${stats.tradingDays} closing days · ${premium ? "option legs, all rows" : "cash booked, all rows"}` },
        { label: "Avg per day", value: fmtMoney(stats.avgDayPL), sub: `${pct(stats.avgDayReturn, 3)} of equity · ${premium ? "option legs" : "money booked"}, not the mark`, tone: stats.avgDayPL >= 0 ? "pos" : "neg" },
        { label: "Median per day", value: fmtMoney(stats.medianDayPL), sub: `${pct(stats.medianDayReturn, 3)} of equity`, tone: stats.medianDayPL >= 0 ? "pos" : "neg" },
        { label: "Avg return / day", value: pct(stats.avgDayReturn, 3), sub: `${pct(stats.avgDayRiskReturn, 2)} of capital at risk`, tone: stats.avgDayReturn === null ? undefined : stats.avgDayReturn >= 0 ? "pos" : "neg" },
        { label: "Median return / day", value: pct(stats.medianDayReturn, 3), sub: `${pct(stats.medianDayRiskReturn, 2)} of capital at risk`, tone: stats.medianDayReturn === null ? undefined : stats.medianDayReturn >= 0 ? "pos" : "neg" },
        // brand.md reserves emerald for gains. An all-red account printed
        // "Best day -$412.00" in the colour that means "in your favour".
        { label: "Best day", value: fmtMoney(stats.bestDay?.pl || 0), sub: stats.bestDay?.date, tone: (stats.bestDay?.pl || 0) >= 0 ? "pos" : "neg" },
        { label: "Worst day", value: fmtMoney(stats.worstDay?.pl || 0), sub: stats.worstDay?.date, tone: (stats.worstDay?.pl || 0) > 0 ? "pos" : "neg" },
        // WITHHELD OUTRIGHT, not caveated, when anything is unattributed.
        // Removing a loser from the middle of the sequence MERGES the win runs
        // either side of it: W W L W W reports a four-trade streak that never
        // happened. That is a different statistic, not a smaller sample, and
        // no footnote makes an invented run true.
        {
          label: "Best win streak",
          value: stats.streaksKnown ? `${stats.bestStreak} ${stats.bestStreak === 1 ? "trade" : "trades"}` : "—",
          sub: stats.streaksKnown ? basis : `Not shown while ${n} ${n === 1 ? "trade cannot" : "trades cannot"} be placed in the sequence — leaving ${n === 1 ? "it" : "them"} out would join the runs on either side into one that never happened`
        },
        {
          label: "Worst loss streak",
          value: stats.streaksKnown ? `${stats.worstStreak} ${stats.worstStreak === 1 ? "trade" : "trades"}` : "—",
          sub: stats.streaksKnown ? basis : "Same reason as the win streak above"
        }
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