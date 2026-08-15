// Performance analytics derived from closed TradeRecord rows.

const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));

export function computeStats(trades, equity = 0) {
  const rows = trades.filter((t) => t.close_date);
  if (rows.length === 0) return null;

  const sorted = rows.slice().sort((a, b) => a.close_date.localeCompare(b.close_date));
  const pls = sorted.map((t) => t.realized_pl || 0);
  const wins = sorted.filter((t) => (t.realized_pl || 0) > 0);
  const losses = sorted.filter((t) => (t.realized_pl || 0) < 0);

  const totalPL = pls.reduce((a, v) => a + v, 0);
  const grossWin = wins.reduce((a, t) => a + t.realized_pl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.realized_pl, 0));

  const creditCollected = sorted.reduce((a, t) => a + (t.net_credit || 0) * (t.qty || 0) * 100, 0);
  const riskOf = (t) => {
    const width = t.long_symbol ? Math.abs((t.short_strike || 0) - (t.long_strike || 0)) : t.short_strike || 0;
    return Math.max(0, (width - (t.net_credit || 0)) * (t.qty || 0) * 100);
  };
  const totalRisk = sorted.reduce((a, t) => a + riskOf(t), 0);
  const avgRisk = totalRisk / sorted.length;

  // Equity curve + max drawdown of cumulative realized P/L.
  let cum = 0, peak = 0, maxDD = 0;
  const curve = sorted.map((t) => {
    cum += t.realized_pl || 0;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
    return { date: t.close_date, cum, pl: t.realized_pl || 0 };
  });

  // Per-day aggregation.
  const byDayMap = {};
  sorted.forEach((t) => {
    byDayMap[t.close_date] = (byDayMap[t.close_date] || 0) + (t.realized_pl || 0);
  });
  const byDay = Object.entries(byDayMap).map(([date, pl]) => ({ date, pl })).sort((a, b) => a.date.localeCompare(b.date));
  const winDays = byDay.filter((d) => d.pl > 0).length;

  // Per-month aggregation.
  const byMonthMap = {};
  sorted.forEach((t) => {
    const m = t.close_date.substring(0, 7);
    const b = (byMonthMap[m] = byMonthMap[m] || { month: m, pl: 0, trades: 0, wins: 0 });
    b.pl += t.realized_pl || 0;
    b.trades += 1;
    if ((t.realized_pl || 0) > 0) b.wins += 1;
  });
  const byMonth = Object.values(byMonthMap).sort((a, b) => a.month.localeCompare(b.month));

  // Per-ticker aggregation.
  const byTickerMap = {};
  sorted.forEach((t) => {
    const b = (byTickerMap[t.ticker] = byTickerMap[t.ticker] || { ticker: t.ticker, pl: 0, trades: 0, wins: 0 });
    b.pl += t.realized_pl || 0;
    b.trades += 1;
    if ((t.realized_pl || 0) > 0) b.wins += 1;
  });
  const byTicker = Object.values(byTickerMap).sort((a, b) => b.pl - a.pl);

  // Streaks (chronological).
  let streak = 0, bestStreak = 0, worstStreak = 0;
  pls.forEach((v) => {
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
  const returnOnRisk = totalRisk > 0 ? totalPL / totalRisk : null;

  return {
    totalPL,
    trades: sorted.length,
    contracts: sorted.reduce((a, t) => a + (t.qty || 0), 0),
    winRate: wins.length / sorted.length,
    wins: wins.length,
    losses: losses.length,
    scratches: sorted.length - wins.length - losses.length,
    avgPL: totalPL / sorted.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    payoffRatio: wins.length && losses.length ? (grossWin / wins.length) / (grossLoss / losses.length) : null,
    largestWin: Math.max(...pls, 0),
    largestLoss: Math.min(...pls, 0),
    expiredCount: sorted.filter((t) => t.close_reason === 'expired').length,
    creditCollected,
    captureRate: creditCollected > 0 ? totalPL / creditCollected : null,
    totalRisk,
    avgRisk,
    returnOnRisk,
    roe,
    annualized: roe !== null ? roe * (365 / span) : null,
    maxDrawdown: maxDD,
    avgHoldDays: holdDays,
    tradingDays: byDay.length,
    dayWinRate: byDay.length ? winDays / byDay.length : 0,
    avgDayPL: byDay.length ? totalPL / byDay.length : 0,
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