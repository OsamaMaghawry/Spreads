// The trading terminal's arithmetic: live candles from the trade stream, the
// time & sales tape, and the watchlist. Kept out of the components so every
// rule is tested (terminal.test.js).

export const INTERVALS = [
  { id: "1Min", label: "1m", seconds: 60 },
  { id: "5Min", label: "5m", seconds: 300 },
  { id: "15Min", label: "15m", seconds: 900 },
  { id: "1Hour", label: "1h", seconds: 3600 },
  { id: "1Day", label: "1D", seconds: 86400 }
];
const secondsOf = (id) => INTERVALS.find((i) => i.id === id)?.seconds ?? 300;

// Midnight in New York, as UTC seconds: where Alpaca stamps a daily bar. The
// offset is read for that day, so it is right on either side of a clock change.
export function nyMidnight(sec) {
  const d = new Date(sec * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "short" })
      .formatToParts(d).map((p) => [p.type, p.value])
  );
  const offsetHours = parts.timeZoneName === "EDT" ? 4 : 5;
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), offsetHours) / 1000;
}

/** The start of the candle a moment falls in. */
export function bucketStart(sec, interval) {
  if (interval === "1Day") return nyMidnight(sec);
  const n = secondsOf(interval);
  return Math.floor(sec / n) * n;
}

/**
 * The candle after a trade: the current one extended, or a new one opened at
 * the trade's price. A trade older than the last candle (a late print) changes
 * nothing -- redrawing history from one late trade would misstate it.
 */
export function applyTrade(last, trade, interval) {
  const price = Number(trade?.price);
  const size = Number(trade?.size) || 0;
  const sec = Math.floor(Date.parse(trade?.at) / 1000);
  if (!(price > 0) || !Number.isFinite(sec)) return null;
  const time = bucketStart(sec, interval);
  if (last && time < last.time) return null;
  if (last && time === last.time) {
    return { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: (last.volume || 0) + size };
  }
  return { time, open: price, high: price, low: price, close: price, volume: size };
}

/**
 * A finished one-minute bar from the feed, for a one-minute chart: it replaces
 * whatever the trades had built for that minute, because the feed's bar is the
 * official one. Other intervals keep building from trades.
 */
export function applyMinuteBar(last, bar, interval) {
  if (interval !== "1Min" || !bar) return null;
  const time = Math.floor(Date.parse(bar.t) / 1000);
  if (!Number.isFinite(time) || (last && time < last.time)) return null;
  return { time, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v };
}

/**
 * One time & sales row. A print at or above the ask was a buyer paying up,
 * at or below the bid a seller hitting it, anything between is in the middle;
 * the colour is that guess, not a fact the feed states.
 */
export function tapeRow(trade, quote) {
  const price = Number(trade.price);
  const side = quote?.ask && price >= quote.ask ? "buy" : quote?.bid && price <= quote.bid ? "sell" : "mid";
  return { id: `${trade.at}-${trade.id ?? ""}-${price}-${trade.size}`, at: trade.at, price, size: Number(trade.size) || 0, exchange: trade.exchange || "", side };
}

export const TAPE_MAX = 200;

export function pushTape(rows, row) {
  return [row, ...rows].slice(0, TAPE_MAX);
}

// ---------- watchlist ----------

export const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD", "MSFT", "AMZN"];
export const WATCHLIST_MAX = 25;
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

export function cleanWatchlist(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const t = String(s || "").toUpperCase().trim();
    if (SYMBOL.test(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, WATCHLIST_MAX);
}

export function readWatchlist(raw) {
  try {
    const list = cleanWatchlist(JSON.parse(raw));
    return list.length ? list : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

// ---------- formatting ----------

export const px = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v) >= 1 ? Number(v).toFixed(2) : Number(v).toFixed(4));
export const pctText = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`);
export const sizeText = (v) => {
  const n = Number(v) || 0;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : String(n);
};
export const clock = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
