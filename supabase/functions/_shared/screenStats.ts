// The stock screener's daily numbers for one symbol, from its daily candles:
// averages, volume norms, the 52-week range, past closes for performance, and
// the running averages behind RSI and ATR.
//
// The owner, 24 Oct 2026: "Stock Screener, with some extensive filtrations
// like the advanced tools to see the stocks in play." These numbers move once
// a day, so they are read once a day (from the account's own Alpaca data,
// consolidated volume) and the screen combines them with the live price in
// the browser (src/lib/screener.js). RSI and ATR are handed over as Wilder's
// running averages rather than finished values, so today's price can be
// folded in live, as a charting platform does.
//
// Only finished days count: a bar dated today is today's partial candle.

export type DailyBar = { t: string; o: number; h: number; l: number; c: number; v: number };

export type DailyStats = {
  lastDate: string;
  lastClose: number;
  bars: number;
  closes: { d5: number | null; d21: number | null; d63: number | null; d126: number | null; d252: number | null; ytd: number | null };
  avgVol20: number | null;
  avgVol50: number | null;
  avgDollar20: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: { gain: number; loss: number } | null;   // Wilder's 14-day averages at the last close
  atr14: number | null;
  high52: number | null;
  low52: number | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const tail = <T>(xs: T[], n: number) => (xs.length >= n ? xs.slice(-n) : null);

export function dailyStats(all: DailyBar[], today: string): DailyStats | null {
  const bars = (Array.isArray(all) ? all : [])
    .filter((b) => b && typeof b.t === "string" && b.t.slice(0, 10) < today && Number.isFinite(b.c))
    .sort((a, b) => a.t.localeCompare(b.t));
  if (!bars.length) return null;
  const closes = bars.map((b) => b.c);
  const last = bars[bars.length - 1];
  const back = (n: number) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const year = today.slice(0, 4);
  const beforeYear = [...bars].reverse().find((b) => b.t.slice(0, 4) < year);

  const sma = (n: number) => { const t = tail(closes, n); return t ? mean(t) : null; };
  const vol = (n: number) => { const t = tail(bars, n); return t ? mean(t.map((b) => b.v)) : null; };
  const dollar20 = tail(bars, 20);

  // Wilder: a simple average of the first 14 changes, then each day
  // avg = (avg * 13 + today) / 14. Run over everything there is.
  let rsi: DailyStats["rsi"] = null;
  if (closes.length > 14) {
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= 14; i++) {
      const d = closes[i] - closes[i - 1];
      gain += Math.max(d, 0);
      loss += Math.max(-d, 0);
    }
    gain /= 14;
    loss /= 14;
    for (let i = 15; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      gain = (gain * 13 + Math.max(d, 0)) / 14;
      loss = (loss * 13 + Math.max(-d, 0)) / 14;
    }
    rsi = { gain, loss };
  }

  let atr14: number | null = null;
  if (bars.length > 14) {
    const tr = (i: number) => Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    let a = 0;
    for (let i = 1; i <= 14; i++) a += tr(i);
    a /= 14;
    for (let i = 15; i < bars.length; i++) a = (a * 13 + tr(i)) / 14;
    atr14 = a;
  }

  const yearBars = bars.slice(-252);
  return {
    lastDate: last.t.slice(0, 10),
    lastClose: last.c,
    bars: bars.length,
    closes: { d5: back(5), d21: back(21), d63: back(63), d126: back(126), d252: back(252), ytd: beforeYear ? beforeYear.c : null },
    avgVol20: vol(20),
    avgVol50: vol(50),
    avgDollar20: dollar20 ? mean(dollar20.map((b) => b.c * b.v)) : null,
    sma20: sma(20),
    sma50: sma(50),
    sma200: sma(200),
    rsi,
    atr14,
    high52: Math.max(...yearBars.map((b) => b.h)),
    low52: Math.min(...yearBars.map((b) => b.l))
  };
}

/** A fund by its name, since the broker's asset list does not say: ETF, ETN, trust, fund, and the big issuers' brands. */
export const FUND_NAME = /\b(ETFs?|ETNs?|Fund|Trust)\b|iShares|SPDR|ProShares|Direxion|Invesco|Vanguard|WisdomTree|Global X|VanEck|GraniteShares|Defiance|YieldMax|Roundhill|Tidal|T-Rex|Leverage Shares/i;
export const isFundName = (name: unknown) => FUND_NAME.test(String(name || ""));
