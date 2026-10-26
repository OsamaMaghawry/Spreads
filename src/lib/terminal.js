// The trading terminal's arithmetic: live candles from the trade stream, the
// time & sales tape, the order book, and the watchlist. Kept out of the
// components so every rule is tested (terminal.test.js).

// "BTC/USD": a coin and the currency it is priced in, as Alpaca writes it. A
// symbol with a slash is crypto everywhere in the terminal.
export const CRYPTO = /^[A-Z0-9]{1,10}\/(USD|USDT|USDC|BTC)$/;
export const isCrypto = (s) => CRYPTO.test(String(s || ""));

// Every interval the chart offers, 24 Oct: "from Monthly down to 5 seconds".
// Seconds candles are built from trades (functions/terminal); the rest are
// Alpaca's bars. `quick` ones get a button; all are in the menu.
export const INTERVALS = [
  { id: "5Sec", label: "5s", seconds: 5, group: "Seconds" },
  { id: "10Sec", label: "10s", seconds: 10, group: "Seconds" },
  { id: "15Sec", label: "15s", seconds: 15, group: "Seconds" },
  { id: "30Sec", label: "30s", seconds: 30, group: "Seconds" },
  { id: "1Min", label: "1m", seconds: 60, group: "Minutes", quick: true },
  { id: "2Min", label: "2m", seconds: 120, group: "Minutes" },
  { id: "3Min", label: "3m", seconds: 180, group: "Minutes" },
  { id: "5Min", label: "5m", seconds: 300, group: "Minutes", quick: true },
  { id: "10Min", label: "10m", seconds: 600, group: "Minutes" },
  { id: "15Min", label: "15m", seconds: 900, group: "Minutes", quick: true },
  { id: "30Min", label: "30m", seconds: 1800, group: "Minutes" },
  { id: "1Hour", label: "1h", seconds: 3600, group: "Hours", quick: true },
  { id: "2Hour", label: "2h", seconds: 7200, group: "Hours" },
  { id: "4Hour", label: "4h", seconds: 14400, group: "Hours" },
  { id: "1Day", label: "1D", seconds: 86400, group: "Days", quick: true },
  { id: "1Week", label: "1W", seconds: 7 * 86400, group: "Days", quick: true },
  { id: "1Month", label: "1M", seconds: 30 * 86400, group: "Days" }
];
const secondsOf = (id) => INTERVALS.find((i) => i.id === id)?.seconds ?? 300;
const CALENDAR = new Set(["1Day", "1Week", "1Month"]);

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

// ---------- sessions ----------

// New York wall-clock parts for a moment, read once per formatter.
const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
export function nyClock(sec) {
  const p = Object.fromEntries(NY.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute), day: `${p.year}-${p.month}-${p.day}` };
}

export const REGULAR_OPEN = 9 * 60 + 30;
export const REGULAR_CLOSE = 16 * 60;

/**
 * Which part of the US share trading day a moment falls in: pre-market
 * (4:00 to 9:30 New York time), regular (9:30 to 16:00), after hours (16:00
 * to 20:00), or closed (overnight and weekends). Exchange holidays and early
 * closes are not known here; on those days the clock rules still apply.
 */
export function sessionOf(sec) {
  const { weekday, minutes } = nyClock(sec);
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  if (minutes >= REGULAR_OPEN && minutes < REGULAR_CLOSE) return "regular";
  if (minutes >= 4 * 60 && minutes < REGULAR_OPEN) return "pre";
  if (minutes >= REGULAR_CLOSE && minutes < 20 * 60) return "post";
  return "closed";
}

/**
 * Whether a share's candle belongs on a regular-hours chart: any part of it
 * inside 9:30 to 16:00. An hourly candle stamped 9:00 holds 9:30 to 10:00, so
 * it stays; a 5-minute candle stamped 9:25 does not.
 */
export function inRegularHours(time, stepSeconds) {
  const { weekday, minutes } = nyClock(time);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const end = minutes + stepSeconds / 60;
  return end > REGULAR_OPEN && minutes < REGULAR_CLOSE;
}

/** The session a VWAP restarts with: the New York day for shares, the UTC day for coins. */
export const sessionDay = (sec, crypto) => (crypto ? Math.floor(sec / 86400) : nyClock(sec).day);

/**
 * The start of the candle a moment falls in. A share's day, week and month
 * start at New York midnight (Monday for a week, the 1st for a month); a
 * coin's at midnight UTC, where Alpaca stamps crypto bars (crypto has no
 * session to anchor to). Shorter candles are fixed steps.
 */
export function bucketStart(sec, interval, crypto = false) {
  if (!CALENDAR.has(interval)) {
    const n = secondsOf(interval);
    return Math.floor(sec / n) * n;
  }
  if (crypto) {
    const day = Math.floor(sec / 86400) * 86400;
    if (interval === "1Day") return day;
    const d = new Date(day * 1000);
    if (interval === "1Week") return day - ((d.getUTCDay() + 6) % 7) * 86400;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  const day = nyMidnight(sec);
  if (interval === "1Day") return day;
  // Back to the Monday, or the 1st, by whole days from noon, so a clock change
  // inside the week or month does not shift the result by an hour.
  const { weekday, day: date } = nyClock(day + 12 * 3600);
  const back = interval === "1Week"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday)
    : Number(date.slice(8, 10)) - 1;
  return nyMidnight(day + 12 * 3600 - back * 86400);
}

/**
 * The candle after a trade: the current one extended, or a new one opened at
 * the trade's price. A trade older than the last candle (a late print) changes
 * nothing -- redrawing history from one late trade would misstate it. Fixed
 * steps count on from the last candle rather than from the clock, so a live
 * candle lines up with the history's however Alpaca aligned its bars.
 */
export function applyTrade(last, trade, interval, crypto = false) {
  const price = Number(trade?.price);
  const size = Number(trade?.size) || 0;
  const sec = Math.floor(Date.parse(trade?.at) / 1000);
  if (!(price > 0) || !Number.isFinite(sec)) return null;
  let time;
  if (last && !CALENDAR.has(interval)) {
    const n = secondsOf(interval);
    if (sec < last.time) return null;
    time = last.time + Math.floor((sec - last.time) / n) * n;
  } else {
    time = bucketStart(sec, interval, crypto);
    if (last && time < last.time) return null;
  }
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
  const time = Date.parse(trade.at);
  return { id: `${trade.at}-${trade.id ?? ""}-${price}-${trade.size}`, at: trade.at, time: Number.isFinite(time) ? time : 0, price, size: Number(trade.size) || 0, exchange: trade.exchange || "", side, known };
}

export const TAPE_MAX = 200;

export function pushTape(rows, row) {
  return [row, ...rows].slice(0, TAPE_MAX);
}

/**
 * The tape with new rows in, newest first by when each trade printed, not
 * when it arrived (26 Oct: "the time and sales is not ordered"): a trade
 * that comes in late, as EODHD's sometimes do, takes its place among the
 * others. Trades of the same moment keep the order they came in, the later
 * first; each is kept once; at most `max`.
 */
export function mergeTape(rows, incoming, max = TAPE_MAX) {
  const seen = new Set();
  const all = [];
  for (const r of [...incoming, ...rows]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    all.push(r);
  }
  return all.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, max);
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
/** The same, to the millisecond, for the tape: trades in one second are told apart. */
export const clockMs = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${clock(iso)}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` : "";
};

// ---------- the ticket's orders ----------

/**
 * A dollar amount as a quantity at a price: whole shares for a stock, or a
 * coin's own step (rounded down, so the order never costs more than the
 * amount). Used where the broker takes no dollar amount: limit and stop
 * orders, and shares that do not trade in fractions.
 */
export function amountToQty(amount, price, { crypto = false, step = null } = {}) {
  const a = Number(amount);
  const p = Number(price);
  if (!(a > 0) || !(p > 0)) return 0;
  const raw = a / p;
  if (!crypto) return Math.floor(Number(raw.toFixed(6)));
  const s = Number(step) > 0 ? Number(step) : 1e-9;
  const decimals = Math.min(9, Math.max(0, Math.ceil(-Math.log10(s) - 1e-9)));
  // Steps counted to six decimals before rounding down: binary division lands
  // just under whole numbers (see cryptoOrder.ts onStep).
  return Number((Math.floor(Number((raw / s).toFixed(6))) * s).toFixed(decimals));
}

// What an order's status means to the person waiting on it.
const STATES = {
  filled: { label: "Filled", tone: "good", final: true },
  partially_filled: { label: "Partly filled", tone: "wait", final: false },
  canceled: { label: "Cancelled", tone: "muted", final: true },
  expired: { label: "Expired", tone: "muted", final: true },
  rejected: { label: "Rejected", tone: "bad", final: true },
  done_for_day: { label: "Done for the day", tone: "muted", final: true },
  replaced: { label: "Replaced", tone: "muted", final: true },
  stopped: { label: "Stopped", tone: "muted", final: true },
  suspended: { label: "Suspended", tone: "bad", final: true },
  pending_cancel: { label: "Cancelling", tone: "wait", final: false },
  pending_replace: { label: "Changing", tone: "wait", final: false }
};
export function orderState(status) {
  return STATES[status] || { label: "Working", tone: "wait", final: false };
}

/**
 * The pop-up for an order at each step: a tone (ok, wait, muted, bad), a
 * title a glance can take, and one line of detail. `order` is what the
 * terminal tracks: the words of the ticket, side, unit, and the broker's
 * status and fills.
 */
export function orderNews(order) {
  const filled = Number(order?.filled) || 0;
  const avg = Number(order?.avgPrice) || 0;
  const unit = order?.unitName || "";
  const did = order?.side === "buy" ? "Bought" : "Sold";
  const fills = filled > 0 && avg > 0
    ? `${did} ${sizeText(filled)} ${unit} at ${px(avg)} · $${(filled * avg).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;
  if (order?.error) return { tone: "bad", title: "Order not placed", detail: order.error };
  if (order?.sending) return { tone: "wait", title: "Sending order…", detail: order.words };
  switch (order?.status) {
    case "filled": return { tone: "ok", title: "Filled", detail: fills || order.words };
    case "partially_filled": return { tone: "wait", title: "Partly filled", detail: fills ? `${fills} so far` : order.words };
    case "canceled": return { tone: "muted", title: "Cancelled", detail: fills ? `${fills} before cancelling` : "Nothing filled." };
    case "expired": return { tone: "muted", title: "Expired", detail: fills ? `${fills} before it expired` : "Nothing filled." };
    case "rejected": return { tone: "bad", title: "Rejected by Alpaca", detail: "Check the size, the price and the buying power." };
    case "pending_cancel": return { tone: "wait", title: "Cancelling…", detail: order.words };
    default: return { tone: "ok", title: "Order placed", detail: `${order?.words || ""} · waiting to fill` };
  }
}

/**
 * Which of the ticket's options a share order can take, and when one cannot,
 * why, in a line (26 Oct: "the take profit or any check boxes don't work and
 * no messages"). `closing`: the order sells shares held, or buys back a
 * short, where a bracket's legs would open a new position the other way; the
 * position's own exits do that job. `session`: sessionOf(now). `stopWaits`:
 * a stop sent outside 9:30 to 16:00 waits for the open, as Alpaca triggers
 * stops in regular hours only.
 */
export function ticketChoices({ type, tif, extended = false, bracket = false, closing = false, dollars = false, session = "regular" }) {
  const isStop = type === "stop" || type === "stop_limit" || type === "trailing_stop";
  const ext = dollars ? "An order in dollars trades in regular hours only."
    : type !== "limit" ? "Only a limit order can trade before 9:30 or after 16:00 (Alpaca's rule)."
      : tif !== "day" ? "Only an order for the day can trade outside regular hours: set Time in force to Day."
        : bracket ? "Not with a take-profit and stop-loss attached." : null;
  const brk = dollars ? "Not on an order in dollars."
    : closing ? "Its take-profit and stop-loss would open a new position the other way. For the shares you hold, set Exits below."
      : type !== "market" && type !== "limit" ? "Attaches to a new market or limit order."
        : extended ? "Not with pre-market and after hours." : null;
  return {
    extended: { ok: !ext, why: ext },
    bracket: { ok: !brk, why: brk },
    stopWaits: isStop && session !== "regular"
  };
}

// ---------- settings kept with the account ----------

/**
 * Which copy of a setting to use once the account answers (lib/terminalPrefs.js):
 * the account's whenever it has one, even an empty list (everything deleted
 * on another device stays deleted); otherwise this browser's, sent up so the
 * account has it from now on.
 */
export function settle(fromAccount, local) {
  const none = (v) => v === undefined || v === null;
  if (!none(fromAccount)) return { value: fromAccount, upload: false };
  if (!none(local)) return { value: local, upload: true };
  return { value: local, upload: false };
}

// ---------- which tape a share's prices come from ----------
//
// 26 Oct, 5:21 New York: "Premarket is open now and I don't see any
// execution, change in prices, time & sales!!". The free IEX feed trades only
// 8:00 to 17:00 New York, so before and after it shows nothing. The choices:
// EODHD's real-time stream (the owner's plan: every session, about a second
// behind), Alpaca's IEX feed (real time, IEX's trades only), or Alpaca's
// consolidated tape of every exchange, fifteen minutes late without a paid
// data plan. "auto" takes EODHD where it is available, else IEX while it is
// open and the delayed consolidated tape when it is not.

/** Whether IEX is trading: a weekday, 8:00 to 17:00 New York. */
export function iexOpen(sec) {
  const { weekday, minutes } = nyClock(sec);
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= 480 && minutes < 1020;
}

export const SHARE_FEEDS = [
  ["auto", "Auto"], ["eodhd", "EODHD real time, every session"], ["iex", "IEX real time (8:00 to 17:00)"], ["delayed", "Every exchange, 15 min delayed"]
];

/**
 * The tape for shares: `live`, the stream (eodhd, iex or delayed_sip), and
 * `history`, what charts, quotes and the tape are read from (iex, or delayed:
 * the consolidated tape up to fifteen minutes ago), with a label to show.
 * EODHD's stream is every exchange's trades, so its history is every
 * exchange's too, at any hour: IEX's own trades, a small part of the
 * market, drew another chart (26 Oct, RENT after 8:00: "The chart never came
 * back again as before it compeletely changed").
 */
export function shareFeed(pref, { eodhd = false, now = Date.now() / 1000 } = {}) {
  const open = iexOpen(now);
  const choice = pref === "eodhd" && !eodhd ? "auto" : pref;
  if (choice === "eodhd" || (choice === "auto" && eodhd)) {
    return { live: "eodhd", history: "delayed", delayed: false, label: "EODHD real time" };
  }
  if (choice === "iex" || (choice === "auto" && open)) return { live: "iex", history: "iex", delayed: false, label: "IEX real time" };
  return { live: "delayed_sip", history: "delayed", delayed: true, label: "All exchanges, 15 min delayed" };
}
