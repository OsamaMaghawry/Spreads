// CME futures candles for the practice replay, from Databento's GLBX.MDP3
// (CME, CBOT, NYMEX, COMEX), continuous front contract by volume
// ("ES.v.0"). The terminal function reads one-minute and one-hour candles
// and keeps every finished UTC day in futures_bars, so a day is paid for once.
// This file is the pure part: Databento's rows into the terminal's candle
// shape, candles into longer ones, and the CME session day. Tested in
// src/lib/futuresBars.test.js.

import { cmeTradeDate } from "./futuresSpecs.js";

/** One Databento OHLCV row (encoding=json, pretty_px, pretty_ts) as a candle, or null. */
export function dbCandle(row) {
  const at = row?.hd?.ts_event ?? row?.ts_event;
  // pretty_ts gives an ISO string; without it, nanoseconds since 1970 (as a number or a string of digits).
  const time = /^\d+$/.test(String(at)) ? Number(BigInt(String(at)) / 1000000000n) : Math.floor(Date.parse(at) / 1000);
  const [open, high, low, close] = ["open", "high", "low", "close"].map((k) => Number(row?.[k]));
  const volume = Number(row?.volume) || 0;
  if (!Number.isFinite(time) || ![open, high, low, close].every((x) => Number.isFinite(x) && x > 0)) return null;
  return { time, open, high, low, close, volume };
}

/** Databento's newline-separated JSON body as candles, oldest first, one per time. */
export function parseRows(text) {
  const byTime = new Map();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const c = dbCandle(row);
    if (c) byTime.set(c.time, c);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** "YYYY-MM-DD" of a UTC second. */
export const utcDay = (t) => new Date(t * 1000).toISOString().slice(0, 10);

/** Candles grouped by UTC day. */
export function byUtcDay(candles) {
  const out = new Map();
  for (const c of candles) {
    const d = utcDay(c.time);
    if (!out.has(d)) out.set(d, []);
    out.get(d).push(c);
  }
  return out;
}

/** Every UTC day from `from` to `to` (seconds), inclusive. */
export function utcDays(from, to) {
  const out = [];
  for (let t = Math.floor(from / 86400) * 86400; t <= to; t += 86400) out.push(utcDay(t));
  return out;
}

function merge(out, key, c) {
  const last = out[out.length - 1];
  if (last && last.time === key) {
    if (c.high > last.high) last.high = c.high;
    if (c.low < last.low) last.low = c.low;
    last.close = c.close;
    last.volume += c.volume;
  } else out.push({ time: key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
}

/** Candles of `seconds` each (UTC-aligned, so 30 minutes lines up with New York's half hours). */
export function rollUp(candles, seconds) {
  const out = [];
  for (const c of candles) merge(out, c.time - (c.time % seconds), c);
  return out;
}

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** New York date and minute of the day for a UTC second. */
export function nyParts(t) {
  const p = Object.fromEntries(NY.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Daily candles by CME trade date (the session from 18:00 New York the day
 * before), stamped at that date's UTC midnight as the chart stamps days. A
 * candle in the daily halt or the weekend has no trade date and is left out.
 */
export function sessionDays(candles) {
  const out = [];
  for (const c of candles) {
    const { day, minutes } = nyParts(c.time);
    const date = cmeTradeDate(day, minutes);
    if (!date) continue;
    merge(out, Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000), c);
  }
  return out;
}
