// The historical screener's arithmetic: one share's figures on a past trading
// day, from its daily candles around it, as a trader would have seen them at
// that day's open or at its close.
//
// The owner, 25 Oct 2026: "Historical screener to filter stock in history to
// get the criteria for the stocks in play at that period." So nothing from
// later than the moment chosen goes in: at the open, the day's own figures are
// its opening price and the pre-market (from its one-minute candles, 4:00 to
// 9:30 New York); at the close, the whole day. The norms (20-day volume and
// dollar volume, ATR, the 20-day average, past closes) are always those of the
// days before, as the live screen's are, so relative volume means the same in
// both. functions/terminal "screen" stage "history" reads the candles.

export type HistoryBar = { t: string; o: number; h: number; l: number; c: number; v: number; vw?: number; n?: number };

export type HistoryRow = {
  day: string;
  prevClose: number | null;
  prevVolume: number | null;
  open: number;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  vwap: number | null;
  trades: number | null;
  // The days before, as the screen's daily numbers (src/lib/screener.js).
  lastDate: string | null;
  lastClose: number | null;
  avgVol20: number | null;
  avgDollar20: number | null;
  atr14: number | null;
  sma20: number | null;
  d5: number | null;
  d21: number | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A share's row on `date` ("YYYY-MM-DD", New York), or null if it did not trade that day. */
export function historyRow(all: HistoryBar[], date: string, asOf: "open" | "close"): HistoryRow | null {
  const bars = (Array.isArray(all) ? all : [])
    .filter((b) => b && typeof b.t === "string" && Number.isFinite(b.c))
    .sort((a, b) => a.t.localeCompare(b.t));
  const i = bars.findIndex((b) => b.t.slice(0, 10) === date);
  if (i === -1 || !Number.isFinite(bars[i].o)) return null;
  const d = bars[i];
  const before = bars.slice(0, i);
  const prev = before.at(-1) || null;
  const closes = before.map((b) => b.c);
  const last20 = before.length >= 20 ? before.slice(-20) : null;
  let atr14: number | null = null;
  if (before.length > 14) {
    const tr = (k: number) => Math.max(before[k].h - before[k].l, Math.abs(before[k].h - before[k - 1].c), Math.abs(before[k].l - before[k - 1].c));
    let a = 0;
    for (let k = 1; k <= 14; k++) a += tr(k);
    a /= 14;
    for (let k = 15; k < before.length; k++) a = (a * 13 + tr(k)) / 14;
    atr14 = a;
  }
  const back = (n: number) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const close = asOf === "close";
  return {
    day: date,
    prevClose: prev ? prev.c : null,
    prevVolume: prev ? fin(prev.v) : null,
    open: d.o,
    high: close ? fin(d.h) : null,
    low: close ? fin(d.l) : null,
    close: close ? fin(d.c) : null,
    volume: close ? fin(d.v) : null,
    vwap: close ? fin(d.vw) : null,
    trades: close ? fin(d.n) : null,
    lastDate: prev ? prev.t.slice(0, 10) : null,
    lastClose: prev ? prev.c : null,
    avgVol20: last20 ? mean(last20.map((b) => b.v)) : null,
    avgDollar20: last20 ? mean(last20.map((b) => b.c * b.v)) : null,
    atr14,
    sma20: last20 ? mean(last20.map((b) => b.c)) : null,
    d5: back(5),
    d21: back(21)
  };
}

/** The pre-market from its one-minute candles (already cut to 4:00 to 9:30): volume, high, low and the last price. */
export function premarket(minutes: HistoryBar[]) {
  const list = (Array.isArray(minutes) ? minutes : []).filter((m) => m && Number.isFinite(m.c)).sort((a, b) => a.t.localeCompare(b.t));
  if (!list.length) return { pmVolume: 0, pmHigh: null, pmLow: null, pmLast: null };
  return {
    pmVolume: list.reduce((a, m) => a + (fin(m.v) || 0), 0),
    pmHigh: Math.max(...list.map((m) => m.h)),
    pmLow: Math.min(...list.map((m) => m.l)),
    pmLast: list[list.length - 1].c
  };
}

/** A New York clock time on a date, as UTC milliseconds (four hours behind in summer, five in winter). */
export function nyMoment(date: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.parse(`${date}T00:00:00Z`) + (h + 4) * 3600000 + m * 60000;
  const hour = Number(new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return hour === h ? guess : guess + 3600000;
}
