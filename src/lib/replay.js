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

export const newPractice = () => ({ cash: PRACTICE_CASH, qty: 0, avg: 0, realized: 0, trades: [], stop: null, target: null });

/**
 * A practice fill: buying adds to a long or covers a short, selling the
 * reverse; profit is realized on the part that closes, at the average price.
 * The stop and the target belong to the position: they go when it is closed
 * or turned the other way round.
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
    stop: keep ? acct.stop : null, target: keep ? acct.target : null
  };
}

/** Equity, open profit and loss, and the position's value at a price. */
export function practiceValue(acct, price) {
  const unrealized = acct.qty && price ? (price - acct.avg) * acct.qty : 0;
  return { equity: acct.cash + acct.qty * (price || 0), unrealized, realized: acct.realized };
}

/**
 * The practice stop and target against the minutes just revealed, minute by
 * minute, each for the whole position whatever its size by then; one cancels
 * the other. A long's stop fills when the low reaches it, at the stop or at
 * the minute's open if it opened through it (a gap); its target when the
 * high reaches it, at the target or the better open. A short the other way
 * round. Both inside one minute: the stop, the cautious reading.
 * `regularOnly`: a share's, which the broker's stop and limit orders only
 * act on in regular hours, so a gap overnight fills at the next open.
 */
export function triggerExits(acct, revealed, { regularOnly = false } = {}) {
  let a = acct;
  for (const m of revealed) {
    if (!a.qty || (!a.stop && !a.target)) break;
    if (regularOnly && !inSession(m.time)) continue;
    const long = a.qty > 0;
    const stopHit = a.stop && (long ? m.low <= a.stop : m.high >= a.stop);
    const targetHit = a.target && (long ? m.high >= a.target : m.low <= a.target);
    if (!stopHit && !targetHit) continue;
    // A gap through the target at the open fills there, better than asked.
    const gapTarget = targetHit && (long ? m.open >= a.target : m.open <= a.target);
    const byStop = stopHit && !gapTarget;
    const price = byStop
      ? (long ? Math.min(a.stop, m.open) : Math.max(a.stop, m.open))
      : (long ? Math.max(a.target, m.open) : Math.min(a.target, m.open));
    a = practiceFill(a, { side: long ? "sell" : "buy", qty: Math.abs(a.qty), price, time: m.time, why: byStop ? "stop" : "target" });
  }
  return a;
}

/**
 * Set or clear the practice stop or target (null clears). A stop must sit on
 * the losing side of the price and a target on the winning side, or it would
 * fill at once.
 */
export function practiceExit(acct, kind, price, last) {
  if (!acct.qty) return { acct, reason: "No practice position to protect." };
  if (price === null) return { acct: { ...acct, [kind]: null } };
  if (!(price > 0)) return { acct, reason: "Enter a price." };
  const long = acct.qty > 0;
  const below = kind === "stop" ? long : !long;
  if (last && (below ? price >= last : price <= last)) {
    return { acct, reason: `A ${kind === "stop" ? "stop" : "take-profit"} at ${px(price)} for a ${long ? "long" : "short"} must be ${below ? "below" : "above"} the price ${px(last)}, or it fills at once.` };
  }
  return { acct: { ...acct, [kind]: price } };
}

/** "Thu, Mar 5, 2026, 10:42" in New York time, for the replay bar. */
export function replayClock(t, crypto) {
  return new Date(t * 1000).toLocaleString("en-US", { timeZone: crypto ? "UTC" : "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + (crypto ? " UTC" : " New York");
}
