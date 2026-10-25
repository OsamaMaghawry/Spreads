// Bar replay: the chart rewound to a moment in the past and played forward,
// for practice, with a practice account that trades at the replayed prices.
//
// The owner, 25 Oct 2026: "I want to add stock replay where I can set the date
// from to for example for training purposes. and make sure to be accurate
// accross all time frames."
//
// Accurate across timeframes means every interval agrees with every other at
// the same moment, as TradingView's replay does: an hourly candle half way
// through its hour shows exactly the half hour of one-minute candles revealed
// so far. So every intraday interval is built here from one series of
// one-minute candles; daily, weekly and monthly from the broker's daily
// candles for finished days and the replayed day's own minutes for the day in
// progress. Nothing after the replay's moment is ever on screen.
//
// Pure and tested (replay.test.js); components/terminal/PriceChart.jsx
// fetches the candles (functions/terminal "replay") and drives it.

import { bucketStart, nyClock, nyMidnight, px } from "./terminal.js";

const SPAN = { "1Hour": 60, "2Hour": 120, "4Hour": 240 };
const STEP = { "1Min": 60, "2Min": 120, "3Min": 180, "5Min": 300, "10Min": 600, "15Min": 900, "30Min": 1800, "1Hour": 3600, "2Hour": 7200, "4Hour": 14400 };
const CALENDAR = new Set(["1Day", "1Week", "1Month"]);
export const REPLAY_INTERVALS = [...Object.keys(STEP), ...CALENDAR];
const OPEN = 570;
const CLOSE = 960;
const HALF = 1800;

/** Whether a minute is in the regular US share session (9:30 to 16:00 New York, weekdays). */
export function inSession(t) {
  const { weekday, minutes } = nyClock(t);
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= OPEN && minutes < CLOSE;
}

/** A trading day as its daily candle is stamped: New York midnight for shares, UTC midnight for coins. */
export const dayOf = (t, crypto) => (crypto ? Math.floor(t / 86400) * 86400 : nyMidnight(t));
/** When that day's candle is complete: 16:00 New York for shares, the next UTC midnight for coins. */
export const dayClose = (day, crypto) => (crypto ? day + 86400 : day + CLOSE * 60);

/**
 * The candle a minute belongs to. A share's hourly candles on a regular-hours
 * chart start at 9:30, as the live chart's do (functions/terminal sessionHours).
 */
export function bucketOf(t, interval, crypto, regular) {
  if (!crypto && regular && SPAN[interval]) return t - ((nyClock(t).minutes - OPEN) % SPAN[interval]) * 60;
  return bucketStart(t, interval, crypto);
}

function aggregate(bars, keyOf) {
  const out = [];
  for (const b of bars) {
    const time = keyOf(b);
    const last = out[out.length - 1];
    if (last && last.time === time) {
      if (b.high > last.high) last.high = b.high;
      if (b.low < last.low) last.low = b.low;
      last.close = b.close;
      last.volume += b.volume;
    } else {
      out.push({ time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
  }
  return out;
}

/** How many of the (sorted) candles started before `t`. */
export function countBefore(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The candles on screen at `cursor` (UTC seconds): every minute that began
 * before it, and nothing after. `regular`: a share's chart in regular hours.
 * Daily candles are regular-hours candles, as the broker's are.
 */
export function replayCandles({ minutes = [], days = [], context = [] }, interval, cursor, { crypto = false, regular = false } = {}) {
  const shown = minutes.slice(0, countBefore(minutes, cursor));
  if (!CALENDAR.has(interval)) {
    // Half-hour and longer charts reach further back than the minutes do,
    // through the half-hour candles before the first minute.
    const edge = Math.min(minutes[0]?.time ?? cursor, cursor);
    const before = STEP[interval] >= HALF ? context.slice(0, countBefore(context, edge - HALF + 1)) : [];
    const all = before.length ? [...before, ...shown] : shown;
    const src = crypto || !regular ? all : all.filter((m) => inSession(m.time));
    return aggregate(src, (m) => bucketOf(m.time, interval, crypto, regular));
  }
  const today = dayOf(cursor - 1, crypto);
  const finished = days.slice(0, countBefore(days, today));
  const native = days.find((d) => d.time === today);
  let partial = null;
  if (native && cursor >= dayClose(today, crypto)) partial = { ...native };
  else {
    const todays = shown.filter((m) => m.time >= today && dayOf(m.time, crypto) === today && (crypto || inSession(m.time)));
    if (todays.length) partial = aggregate(todays, () => today)[0];
  }
  const daily = partial ? [...finished, partial] : finished;
  if (interval === "1Day") return daily;
  return aggregate(daily, (d) => bucketStart(d.time, interval, crypto));
}

/**
 * Minutes older than `keepFrom` let go, kept as half-hour candles (the
 * context), so the longer intraday charts keep their history as the replay
 * runs on. New York is a whole number of hours from UTC, so a half hour in
 * UTC is a half hour on the New York clock too.
 */
export function rollMinutes({ minutes = [], context = [], ...rest }, keepFrom) {
  const edge = Math.floor(keepFrom / HALF) * HALF;
  const n = countBefore(minutes, edge);
  if (!n) return { minutes, context, ...rest };
  return { ...rest, minutes: minutes.slice(n), context: [...context, ...aggregate(minutes.slice(0, n), (m) => Math.floor(m.time / HALF) * HALF)] };
}

/**
 * Where one step takes the replay: to the end of the next candle of `unit`.
 * Intraday units walk the minutes (null when the next ones are not loaded
 * yet); a day, week or month walks the daily candles, to the close of the
 * last trading day in it. Null at the end of the data.
 */
export function nextCursor({ minutes = [], days = [] }, unit, cursor, { crypto = false, regular = false } = {}) {
  if (!CALENDAR.has(unit)) {
    let i = countBefore(minutes, cursor);
    while (i < minutes.length && !crypto && regular && !inSession(minutes[i].time)) i++;
    if (i >= minutes.length) return null;
    const b = bucketOf(minutes[i].time, unit, crypto, regular);
    let end = b + STEP[unit];
    // A share's last session-aligned candle of the day ends at the close.
    if (!crypto && regular && SPAN[unit]) end = Math.min(end, dayOf(b, false) + CLOSE * 60);
    return Math.max(end, minutes[i].time + 60);
  }
  const i = days.findIndex((d) => dayClose(d.time, crypto) > cursor);
  if (i === -1) return null;
  if (unit === "1Day") return dayClose(days[i].time, crypto);
  const bucket = bucketStart(days[i].time, unit, crypto);
  let j = i;
  while (j + 1 < days.length && bucketStart(days[j + 1].time, unit, crypto) === bucket) j++;
  // A week or month still running past the data ends at its last day loaded.
  return dayClose(days[j].time, crypto);
}

// ---------- the practice account ----------

export const PRACTICE_CASH = 100000;

/** One symbol's practice account. In a book of several, each starts with no cash of its own (see bookValue). */
export const newPractice = (cash = PRACTICE_CASH) => ({ cash, qty: 0, avg: 0, realized: 0, trades: [], stop: null, targets: [], seq: 0 });

/**
 * A practice fill: buying adds to a long or covers a short, selling the
 * reverse; profit is realized on the part that closes, at the average price.
 * The stop and the take-profits belong to the position: they go when it is
 * closed or turned the other way round.
 */
export function practiceFill(acct, { side, qty, price, time, why = "" }) {
  const n = Number(qty);
  if (!(n > 0) || !(price > 0)) return acct;
  const signed = side === "buy" ? n : -n;
  let { qty: q, avg, realized } = acct;
  const before = Math.sign(q);
  if (q === 0 || Math.sign(q) === Math.sign(signed)) {
    avg = (avg * Math.abs(q) + price * n) / (Math.abs(q) + n);
    q += signed;
  } else {
    const closing = Math.min(Math.abs(q), n);
    realized += closing * (price - avg) * Math.sign(q);
    q += signed;
    if (Math.abs(q) < 1e-9) { q = 0; avg = 0; } else if (Math.sign(q) === Math.sign(signed)) avg = price;
  }
  const keep = q !== 0 && Math.sign(q) === before;
  return {
    ...acct, qty: q, avg, realized, cash: acct.cash - signed * price,
    trades: [...acct.trades, { side, qty: n, price, time, why }],
    stop: keep ? acct.stop : null, targets: keep ? acct.targets : []
  };
}

/** Equity, open profit and loss, and the position's value at a price. */
export function practiceValue(acct, price) {
  const unrealized = acct.qty && price ? (price - acct.avg) * acct.qty : 0;
  return { equity: acct.cash + acct.qty * (price || 0), unrealized, realized: acct.realized };
}

/**
 * The practice stop and take-profits against the minutes just revealed,
 * minute by minute. The stop is for the whole position, whatever its size by
 * then; each take-profit for its own size (or what is left, for one without
 * a size), so a position can be sold in parts at several prices.
 *
 * A long's stop fills when the low reaches it, at the stop or at the minute's
 * open if it opened through it (a gap); a take-profit when the high reaches
 * it, at its price or the better open, nearest first. A short the other way
 * round. A stop and a take-profit inside one minute: the stop, the cautious
 * reading, after any take-profit the minute opened through.
 * `regularOnly`: a share's, which the broker's stop and limit orders only
 * act on in regular hours, so a gap overnight fills at the next open.
 */
export function triggerExits(acct, revealed, { regularOnly = false } = {}) {
  let a = acct;
  for (const m of revealed) {
    if (!a.qty || (!a.stop && !a.targets.length)) break;
    if (regularOnly && !inSession(m.time)) continue;
    const long = a.qty > 0;
    const side = long ? "sell" : "buy";
    const stopHit = a.stop && (long ? m.low <= a.stop : m.high >= a.stop);
    const hit = a.targets
      .filter((t) => (long ? m.high >= t.price : m.low <= t.price))
      .sort((x, y) => (long ? x.price - y.price : y.price - x.price));
    const filled = stopHit ? hit.filter((t) => (long ? m.open >= t.price : m.open <= t.price)) : hit;
    for (const t of filled) {
      if (!a.qty) break;
      const rest = a.targets.filter((x) => x.id !== t.id);
      const n = t.qty === null ? Math.abs(a.qty) : Math.min(t.qty, Math.abs(a.qty));
      a = practiceFill(a, { side, qty: n, price: long ? Math.max(t.price, m.open) : Math.min(t.price, m.open), time: m.time, why: "target" });
      if (a.qty) a = { ...a, targets: rest };
    }
    if (stopHit && a.qty) {
      a = practiceFill(a, { side, qty: Math.abs(a.qty), price: long ? Math.min(a.stop, m.open) : Math.max(a.stop, m.open), time: m.time, why: "stop" });
    }
  }
  return a;
}

// A stop sits on the losing side of the price and a take-profit on the
// winning side, or it would fill at once.
function wrongSide(acct, kind, price, last) {
  const long = acct.qty > 0;
  const below = kind === "stop" ? long : !long;
  if (last && (below ? price >= last : price <= last)) {
    return `A ${kind === "stop" ? "stop" : "take-profit"} at ${px(price)} for a ${long ? "long" : "short"} must be ${below ? "below" : "above"} the price ${px(last)}, or it fills at once.`;
  }
  return null;
}

/**
 * Set or clear (null) the practice stop, or with "target" one take-profit
 * for the whole position in place of any others (the hotkey's).
 */
export function practiceExit(acct, kind, price, last) {
  if (!acct.qty) return { acct, reason: "No practice position to protect." };
  if (price === null) return { acct: kind === "stop" ? { ...acct, stop: null } : { ...acct, targets: [] } };
  if (!(price > 0)) return { acct, reason: "Enter a price." };
  const reason = wrongSide(acct, kind, price, last);
  if (reason) return { acct, reason };
  if (kind === "stop") return { acct: { ...acct, stop: price } };
  const seq = acct.seq + 1;
  return { acct: { ...acct, seq, targets: [{ id: seq, price, qty: null }] } };
}

/**
 * A take-profit for part of the position: `qty` of it, or null for what is
 * left when it fills. The sizes together may not come to more than is held.
 */
export function addTarget(acct, { price, qty }, last) {
  if (!acct.qty) return { acct, reason: "No practice position to take profit on." };
  if (!(price > 0)) return { acct, reason: "Enter a price." };
  const reason = wrongSide(acct, "target", price, last);
  if (reason) return { acct, reason };
  const held = Math.abs(acct.qty);
  if (qty === null) {
    const rest = acct.targets.find((t) => t.qty === null);
    if (rest) return { acct, reason: `The take-profit at ${px(rest.price)} is already for what is left. Remove it first, or give this one a size.` };
  } else {
    if (!(qty > 0)) return { acct, reason: "Enter a size." };
    const sized = acct.targets.reduce((sum, t) => sum + (t.qty || 0), 0);
    if (sized + qty > held + 1e-9) return { acct, reason: `Take-profits would cover ${+(sized + qty).toFixed(9)} of the ${+held.toFixed(9)} held.` };
  }
  const seq = acct.seq + 1;
  return { acct: { ...acct, seq, targets: [...acct.targets, { id: seq, price, qty }] } };
}

export const removeTarget = (acct, id) => ({ ...acct, targets: acct.targets.filter((t) => t.id !== id) });

/**
 * A take-profit's size as typed: blank or "all" for what is left, "50%" for
 * that part of the position (whole shares, at least one), or a number of
 * shares or coins.
 */
export function targetSize(text, position, crypto) {
  const t = String(text || "").trim().toLowerCase();
  const held = Math.abs(position);
  if (!t || t === "all") return { qty: null };
  const pct = t.endsWith("%");
  const n = Number(pct ? t.slice(0, -1) : t);
  if (!(n > 0)) return { reason: "Size: a number of shares, a percentage like 50%, or blank for all." };
  if (pct && n >= 100) return { qty: null };
  let qty = pct ? held * n / 100 : n;
  if (!crypto) {
    if (!pct && !Number.isInteger(n)) return { reason: "Shares come whole." };
    qty = Math.max(1, Math.floor(qty));
  } else qty = Math.floor(qty * 1e9) / 1e9;
  return { qty };
}

// ---------- the practice book: several symbols, one pot of cash ----------
//
// 25 Oct: "Make sure that I can open muliple ticker at the same time during
// the reply". Each symbol keeps its own account (the rules above), starting
// from no cash; the book adds them up over the one practice balance.

/** A symbol's account in the book, or a fresh one. */
export const acctIn = (book, symbol) => book[symbol] || newPractice(0);

/** Equity, cash, open and closed profit across the book, at each symbol's price (`priceOf`); a symbol without one counts at cost. */
export function bookValue(book, priceOf) {
  let cash = PRACTICE_CASH;
  let held = 0;
  let unrealized = 0;
  let realized = 0;
  for (const [symbol, a] of Object.entries(book)) {
    const p = a.qty ? priceOf(symbol) : null;
    cash += a.cash;
    held += a.qty * (p || a.avg);
    if (p) unrealized += (p - a.avg) * a.qty;
    realized += a.realized;
  }
  return { equity: cash + held, cash, unrealized, realized };
}

// ---------- results: round trips and their statistics ----------
//
// 25 Oct: "p/l taking the numbers based on the buy and sell happened on the
// reply". A round trip runs from flat to flat: every fill that opens or adds
// to the position, and every one that reduces it, until it is flat again (or
// turned the other way round, which closes one trip and opens the next).

/**
 * A symbol's fills as round trips, oldest first: the side, when it opened and
 * closed, its largest size, the average entry and exit, the profit taken, the
 * return on the cost of what was closed, and how it was closed (the reasons
 * on the closing fills: "stop", "target", a hotkey, or "" for by hand). The
 * last may still be open.
 */
export function roundTrips(trades) {
  const out = [];
  let q = 0;
  let avg = 0;
  let trip = null;
  const begin = (sign, t, n) => {
    trip = { side: sign > 0 ? "long" : "short", entryTime: t.time, exitTime: null, maxSize: n, entryQty: n, entryValue: n * t.price, exitQty: 0, exitValue: 0, realized: 0, fills: 1, closedBy: [] };
    q = sign * n;
    avg = t.price;
  };
  const finish = (open) => {
    const avgEntry = trip.entryValue / trip.entryQty;
    out.push({
      side: trip.side, entryTime: trip.entryTime, exitTime: open ? null : trip.exitTime, open, size: trip.maxSize,
      avgEntry, avgExit: trip.exitQty ? trip.exitValue / trip.exitQty : null, closedQty: trip.exitQty,
      realized: trip.realized, returnPct: trip.exitQty ? trip.realized / (avgEntry * trip.exitQty) : null,
      fills: trip.fills, closedBy: [...new Set(trip.closedBy)]
    });
    trip = null;
  };
  for (const t of trades) {
    const n = Number(t.qty);
    if (!(n > 0) || !(t.price > 0)) continue;
    const sign = t.side === "buy" ? 1 : -1;
    if (!trip) { begin(sign, t, n); continue; }
    if (Math.sign(q) === sign) {
      avg = (avg * Math.abs(q) + t.price * n) / (Math.abs(q) + n);
      q += sign * n;
      trip.entryQty += n;
      trip.entryValue += n * t.price;
      trip.maxSize = Math.max(trip.maxSize, Math.abs(q));
      trip.fills += 1;
      continue;
    }
    const closing = Math.min(Math.abs(q), n);
    trip.realized += closing * (t.price - avg) * Math.sign(q);
    trip.exitQty += closing;
    trip.exitValue += closing * t.price;
    trip.exitTime = t.time;
    trip.fills += 1;
    trip.closedBy.push(t.why || "");
    q += sign * n;
    if (Math.abs(q) < 1e-9) finish(false);
    else if (Math.sign(q) === sign) {
      const rest = Math.abs(q);
      finish(false);
      begin(sign, t, rest);
    }
  }
  if (trip) finish(true);
  return out;
}

/** Every symbol's round trips in the book, with the symbol, in the order they opened. */
export const bookTrips = (book) => Object.entries(book)
  .flatMap(([symbol, a]) => roundTrips(a.trades).map((t) => ({ ...t, symbol })))
  .sort((x, y) => x.entryTime - y.entryTime);

/**
 * The statistics of a list of round trips: how many closed, won and lost,
 * the win rate, average win and loss, profit factor (gross profit over gross
 * loss), expectancy (the average closed trip), the largest of each, the
 * average time held, and the profit taken in all (open trips' part included).
 */
export function tradeStats(trips) {
  const closed = trips.filter((t) => !t.open);
  const wins = closed.filter((t) => t.realized > 1e-9);
  const losses = closed.filter((t) => t.realized < -1e-9);
  const sum = (xs) => xs.reduce((a, t) => a + t.realized, 0);
  const grossProfit = sum(wins);
  const grossLoss = sum(losses);
  return {
    trades: closed.length, open: trips.length - closed.length, wins: wins.length, losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    grossProfit, grossLoss, realized: sum(trips),
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    expectancy: closed.length ? sum(closed) / closed.length : null,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.realized)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.realized)) : null,
    avgHold: closed.length ? closed.reduce((a, t) => a + (t.exitTime - t.entryTime), 0) / closed.length : null
  };
}

/** "Thu, Mar 5, 2026, 10:42" in New York time, for the replay bar. */
export function replayClock(t, crypto) {
  return new Date(t * 1000).toLocaleString("en-US", { timeZone: crypto ? "UTC" : "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + (crypto ? " UTC" : " New York");
}
