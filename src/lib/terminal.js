// The trading terminal's arithmetic: live candles from the trade stream, the
// time & sales tape, the order book, and the watchlist. Kept out of the
// components so every rule is tested (terminal.test.js).

// "BTC/USD": a coin and the currency it is priced in, as Alpaca writes it. A
// symbol with a slash is crypto everywhere in the terminal.
export const CRYPTO = /^[A-Z0-9]{1,10}\/(USD|USDT|USDC|BTC)$/;
export const isCrypto = (s) => CRYPTO.test(String(s || ""));

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

/**
 * The start of the candle a moment falls in. A share's day starts at New York
 * midnight; a coin's at midnight UTC, where Alpaca stamps crypto daily bars
 * (crypto has no session to anchor to).
 */
export function bucketStart(sec, interval, crypto = false) {
  if (interval === "1Day") return crypto ? Math.floor(sec / 86400) * 86400 : nyMidnight(sec);
  const n = secondsOf(interval);
  return Math.floor(sec / n) * n;
}

/**
 * The candle after a trade: the current one extended, or a new one opened at
 * the trade's price. A trade older than the last candle (a late print) changes
 * nothing -- redrawing history from one late trade would misstate it.
 */
export function applyTrade(last, trade, interval, crypto = false) {
  const price = Number(trade?.price);
  const size = Number(trade?.size) || 0;
  const sec = Math.floor(Date.parse(trade?.at) / 1000);
  if (!(price > 0) || !Number.isFinite(sec)) return null;
  const time = bucketStart(sec, interval, crypto);
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
 * One time & sales row. Crypto trades say who took them (takerSide), so the
 * colour is that fact. A share's trade does not: a print at or above the ask
 * was a buyer paying up, at or below the bid a seller hitting it, anything
 * between is in the middle, and the colour is that guess.
 */
export function tapeRow(trade, quote) {
  const price = Number(trade.price);
  const known = trade.takerSide === "buy" || trade.takerSide === "sell";
  const side = known ? trade.takerSide : quote?.ask && price >= quote.ask ? "buy" : quote?.bid && price <= quote.bid ? "sell" : "mid";
  return { id: `${trade.at}-${trade.id ?? ""}-${price}-${trade.size}`, at: trade.at, price, size: Number(trade.size) || 0, exchange: trade.exchange || "", side, known };
}

export const TAPE_MAX = 200;

export function pushTape(rows, row) {
  return [row, ...rows].slice(0, TAPE_MAX);
}

// ---------- order book ----------

/**
 * The book after a message from the feed. A reset (or the first picture) is
 * the whole book; anything else carries only the levels that changed, and a
 * size of 0 means that price has emptied. Held as price -> size maps so an
 * update is a set or a delete, never a search.
 */
export function applyBook(book, msg) {
  const fresh = !book || msg.reset;
  const bids = fresh ? new Map() : new Map(book.bids);
  const asks = fresh ? new Map() : new Map(book.asks);
  for (const [map, levels] of [[bids, msg.bids], [asks, msg.asks]]) {
    for (const level of Array.isArray(levels) ? levels : []) {
      const price = Number(level[0]);
      const size = Number(level[1]);
      if (!(price > 0) || !Number.isFinite(size)) continue;
      if (size > 0) map.set(price, size);
      else map.delete(price);
    }
  }
  return { bids, asks, at: msg.at || book?.at || null };
}

/**
 * The best `depth` levels each side, best first, each with the running total
 * from the inside out (what a sweep to that price would fill), plus the spread
 * and the largest total for scaling the size bars.
 */
export function bookLevels(book, depth = 15) {
  if (!book) return { bids: [], asks: [], spread: null, mid: null, maxTotal: 0 };
  const side = (map, desc) => {
    const prices = [...map.keys()].sort((a, b) => (desc ? b - a : a - b)).slice(0, depth);
    let total = 0;
    return prices.map((price) => { total += map.get(price); return { price, size: map.get(price), total }; });
  };
  const bids = side(book.bids, true);
  const asks = side(book.asks, false);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  return {
    bids, asks,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    mid: bestBid !== null && bestAsk !== null ? (bestAsk + bestBid) / 2 : null,
    maxTotal: Math.max(bids.at(-1)?.total || 0, asks.at(-1)?.total || 0)
  };
}

/** The chart's price scale for a market: two decimals at a dollar and above, more below. */
export function priceFormatFor(price) {
  const p = Math.abs(Number(price)) || 0;
  const precision = p >= 1 ? 2 : p >= 0.01 ? 4 : p >= 0.0001 ? 6 : 8;
  return { type: "price", precision, minMove: 10 ** -precision };
}

// ---------- watchlist ----------

export const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD", "MSFT", "AMZN", "BTC/USD", "ETH/USD"];
export const DEFAULT_COINS = ["BTC/USD", "ETH/USD"];
export const WATCHLIST_MAX = 25;
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

export function cleanWatchlist(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const t = String(s || "").toUpperCase().trim();
    if ((SYMBOL.test(t) || CRYPTO.test(t)) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, WATCHLIST_MAX);
}

/**
 * A watchlist saved before the terminal had crypto gets Bitcoin and Ether
 * added once, so coins are there to pick without a search; after that the
 * list is the trader's, and a coin they remove stays removed.
 */
export function withCoinsOnce(list, alreadyAdded) {
  if (alreadyAdded || list.some(isCrypto)) return list;
  return cleanWatchlist([...list, ...DEFAULT_COINS]);
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

// Prices: two decimals at a dollar and above, as many as a small coin needs below.
export const px = (v) => {
  if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return n.toFixed(priceFormatFor(n).precision);
};
export const pctText = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`);
// Sizes: shares in whole numbers, shortened when large; a coin's fraction to
// as many places as it has, up to eight.
export const sizeText = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (Number.isInteger(n)) return String(n);
  return n >= 1 ? String(Number(n.toFixed(4))) : String(Number(n.toFixed(8)));
};
// A size in the order book: short enough to scan down a column.
export const bookSize = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e4) return sizeText(n);
  return n >= 1 ? String(Number(n.toFixed(3))) : String(Number(n.toPrecision(4)));
};
export const clock = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
