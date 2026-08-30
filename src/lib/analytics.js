// Performance analytics derived from closed TradeRecord rows.

const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));

export function computeStats(trades, equity = 0) {
  const rows = trades.filter((t) => t.close_date);
  if (rows.length === 0) return null;

  const sorted = rows.slice().sort((a, b) => a.close_date.localeCompare(b.close_date));
  const pls = sorted.map((t) => t.realized_pl || 0);

  // A position closed by assignment whose shares are still held has a result so
  // far, not a result. Its option leg is booked and the shares that decide the
  // rest of it are still open, so it is almost always sitting at a partial
  // figure — usually the premium, positive, before a loss on the shares lands
  // on the same row.
  //
  // One rule, applied everywhere rather than to some of the figures that
  // answer the same question:
  //
  //   Anything that calls a trade a win or a loss is measured over settled
  //   trades. Anything that measures money booked is measured over every row.
  //
  // Money aggregates keep it because the cash from the option really did move,
  // and a total that quietly dropped it would not match the account. Outcome
  // statistics do not, because they ask a question it cannot yet answer. A win
  // rate that counts unfinished positions as wins is the single most flattering
  // thing this page could do, and it would correct itself downwards later,
  // which is the worst possible order to learn it in.
  //
  // Applying that to thirteen figures and not the rest was worse than either
  // basis on its own: an account could read "Win rate 100%, Largest loss
  // $0.00" beside "Realized P/L -$5,900", and every mixed figure erred
  // flattering. Where a settled figure has nothing to measure it returns null,
  // never zero -- $0.00 is a statement about an account, and "no settled
  // losses yet" is not that statement.
  const settled = sorted.filter((t) => !t.provisional);
  const settledPLs = settled.map((t) => t.realized_pl || 0);
  const provisionalCount = sorted.length - settled.length;
  const wins = settled.filter((t) => (t.realized_pl || 0) > 0);
  const losses = settled.filter((t) => (t.realized_pl || 0) < 0);

  const totalPL = pls.reduce((a, v) => a + v, 0);
  const grossWin = wins.reduce((a, t) => a + t.realized_pl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.realized_pl, 0));

  const creditCollected = sorted.reduce((a, t) => a + (t.net_credit || 0) * (t.qty || 0) * 100, 0);
  const riskOf = (t) => {
    const qty = t.qty || 0;
    // A leg with no short is a long option, and the most it can lose is what
    // was paid for it. The width formula read its strike as if it were a
    // spread's: a lone 470 long came out at (470 + 2.72) x 100 = $47,272 of
    // "capital at risk" for a position whose max loss is the $272 premium.
    // That inflated total risk, average risk and the peak the whole return-on-
    // risk figure divides by.
    if (!t.short_symbol) return Math.max(0, -(t.net_credit || 0) * qty * 100);
    const width = t.long_symbol ? Math.abs((t.short_strike || 0) - (t.long_strike || 0)) : t.short_strike || 0;
    return Math.max(0, (width - (t.net_credit || 0)) * qty * 100);
  };
  const totalRisk = sorted.reduce((a, t) => a + riskOf(t), 0);
  const avgRisk = totalRisk / sorted.length;

  // Peak concurrent capital at risk: sweep open/close events so sequential trades
  // that reuse the same collateral are not double counted.
  const events = [];
  sorted.forEach((t) => {
    const risk = riskOf(t);
    if (risk <= 0) return;
    events.push({ date: t.open_date || t.close_date, delta: risk });
    events.push({ date: t.close_date, delta: -risk, close: true });
  });
  // Opens before closes when they fall on the same date. Reading the closes
  // first pretends collateral was released before the position needing it was
  // put on, which understates the peak and — on real data — drove the running
  // total to -$61,440, a negative amount of capital at risk. It also gave a
  // trade opened and closed the same day a peak contribution of zero, however
  // much it tied up. The tie-break is the whole of the bug: on 99 real trades
  // it reported $119,014 against a true $162,678.
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.close ? 1 : 0) - (b.close ? 1 : 0));
  let openRisk = 0, peakRisk = 0;
  events.forEach((e) => {
    openRisk += e.delta;
    peakRisk = Math.max(peakRisk, openRisk);
  });

  // Average of each trade's own return on its collateral.
  // Settled only: this is each trade's own result, and an unfinished row's
  // result is the premium half of one.
  const perTradeRoRs = sorted.filter((t) => !t.provisional).map((t) => {
    const risk = riskOf(t);
    return risk > 0 ? (t.realized_pl || 0) / risk : null;
  }).filter((v) => v !== null);
  const avgTradeRoR = perTradeRoRs.length
    ? perTradeRoRs.reduce((a, v) => a + v, 0) / perTradeRoRs.length
    : null;

  // Equity curve + max drawdown of cumulative realized P/L.
  let cum = 0, peak = 0, maxDD = 0;
  const curve = sorted.map((t) => {
    cum += t.realized_pl || 0;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
    return { date: t.close_date, cum, pl: t.realized_pl || 0 };
  });

  // Per-day aggregation, over every row: a day's figure is the cash booked that
  // day, which is a money question. "Green days" therefore counts days that
  // booked money, not days that finished winning trades, and the card says so.
  const byDayMap = {};
  sorted.forEach((t) => {
    byDayMap[t.close_date] = (byDayMap[t.close_date] || 0) + (t.realized_pl || 0);
  });
  const byDay = Object.entries(byDayMap).map(([date, pl]) => ({ date, pl })).sort((a, b) => a.date.localeCompare(b.date));
  const winDays = byDay.filter((d) => d.pl > 0).length;
  const median = (arr) => {
    if (arr.length === 0) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const medianDayPL = median(byDay.map((d) => d.pl));

  // Per-month aggregation.
  // P/L over every row; the win count and its denominator over settled ones,
  // so the win rate these produce is the same measurement as the headline.
  const byMonthMap = {};
  sorted.forEach((t) => {
    const m = t.close_date.substring(0, 7);
    const b = (byMonthMap[m] = byMonthMap[m] || { month: m, pl: 0, trades: 0, settled: 0, wins: 0 });
    b.pl += t.realized_pl || 0;
    b.trades += 1;
    if (t.provisional) return;
    b.settled += 1;
    if ((t.realized_pl || 0) > 0) b.wins += 1;
  });
  const byMonth = Object.values(byMonthMap).sort((a, b) => a.month.localeCompare(b.month));

  // Per-ticker aggregation.
  const byTickerMap = {};
  sorted.forEach((t) => {
    const b = (byTickerMap[t.ticker] = byTickerMap[t.ticker] || {
      ticker: t.ticker, pl: 0, trades: 0, settled: 0, wins: 0
    });
    b.pl += t.realized_pl || 0;
    b.trades += 1;
    if (t.provisional) return;
    b.settled += 1;
    if ((t.realized_pl || 0) > 0) b.wins += 1;
  });
  const byTicker = Object.values(byTickerMap).sort((a, b) => b.pl - a.pl);

  // Streaks (chronological), over settled results only: a run of wins that
  // includes a position still waiting on its shares is not a run of wins.
  let streak = 0, bestStreak = 0, worstStreak = 0;
  settledPLs.forEach((v) => {
    if (v > 0) streak = streak > 0 ? streak + 1 : 1;
    else if (v < 0) streak = streak < 0 ? streak - 1 : -1;
    bestStreak = Math.max(bestStreak, streak);
    worstStreak = Math.min(worstStreak, streak);
  });

  const firstDate = sorted[0].close_date;
  const lastDate = sorted[sorted.length - 1].close_date;
  const span = Math.max(1, days(firstDate, lastDate) + 1);
  const holdDays = sorted.reduce((a, t) => a + (t.open_date ? days(t.open_date, t.close_date) : 0), 0) / sorted.length;

  const roe = equity > 0 ? totalPL / equity : null;
  const returnOnRisk = peakRisk > 0 ? totalPL / peakRisk : null;

  return {
    totalPL,
    trades: sorted.length,
    contracts: sorted.reduce((a, t) => a + (t.qty || 0), 0),
    // Everything from here to largestLoss is measured over settled trades
    // only, and settledTrades says how many that was.
    settledTrades: settled.length,
    provisionalTrades: provisionalCount,
    winRate: settled.length ? wins.length / settled.length : null,
    wins: wins.length,
    losses: losses.length,
    scratches: settled.length - wins.length - losses.length,
    avgPL: settled.length ? settledPLs.reduce((a, v) => a + v, 0) / settled.length : null,
    // null, not zero, when there is nothing settled to measure. "Largest loss
    // $0.00" on an account holding shares thousands of dollars underwater is
    // an affirmative false statement; "—" is the true one.
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    payoffRatio: wins.length && losses.length ? (grossWin / wins.length) / (grossLoss / losses.length) : null,
    largestWin: wins.length ? Math.max(...settledPLs) : null,
    largestLoss: losses.length ? Math.min(...settledPLs) : null,
    expiredCount: sorted.filter((t) => t.close_reason === 'expired').length,
    creditCollected,
    captureRate: creditCollected > 0 ? totalPL / creditCollected : null,
    totalRisk,
    avgRisk,
    peakRisk,
    returnOnRisk,
    avgTradeRoR,
    roe,
    // Annualizing a short window multiplies noise into a headline — a five-day
    // span scales by 73. Below 30 closed trades or 90 days of history the
    // figure is a compliance liability, not a statistic, so it is withheld
    // rather than rendered. annualizable tells the UI the blank is deliberate.
    annualizable: sorted.length >= 30 && span >= 90,
    annualized: roe !== null && sorted.length >= 30 && span >= 90 ? roe * (365 / span) : null,
    cagr:
      roe !== null && 1 + roe > 0 && sorted.length >= 30 && span >= 90
        ? Math.pow(1 + roe, 365 / span) - 1
        : null,
    maxDrawdown: maxDD,
    avgHoldDays: holdDays,
    tradingDays: byDay.length,
    dayWinRate: byDay.length ? winDays / byDay.length : 0,
    avgDayPL: byDay.length ? totalPL / byDay.length : 0,
    medianDayPL,
    avgDayReturn: equity > 0 && byDay.length ? totalPL / byDay.length / equity : null,
    medianDayReturn: equity > 0 ? medianDayPL / equity : null,
    // Per-day return on the collateral actually at work (peak concurrent risk).
    avgDayRiskReturn: peakRisk > 0 && byDay.length ? totalPL / byDay.length / peakRisk : null,
    medianDayRiskReturn: peakRisk > 0 ? medianDayPL / peakRisk : null,
    bestDay: byDay.reduce((m, d) => (d.pl > (m?.pl ?? -Infinity) ? d : m), null),
    worstDay: byDay.reduce((m, d) => (d.pl < (m?.pl ?? Infinity) ? d : m), null),
    bestStreak,
    worstStreak: Math.abs(worstStreak),
    firstDate,
    lastDate,
    spanDays: span,
    curve,
    byDay,
    byMonth,
    byTicker
  };
}