// The demo (paper) account's results, built like the replay's (26 Oct: "You
// gave me some insights on the replay for the today's position and not on the
// Demo!"): its fills since a moment become a book of the same shape as the
// replay's practice book (lib/replay.js), so the same round trips and
// statistics come out of it. Pure, and tested (demoTrades.test.js); the fills
// are functions/terminal "fills", the view components/terminal/ReplayPanels.jsx.
//
// Shares or coins held from before the start count from the last close before
// it (the last session's 16:00 close, for today), as a broker's day P/L does; with no close
// to hand, from their average cost. What is held is the fills since then plus
// what was carried in, so the carried-in part is the holding now less the net
// of those fills. A fill from before the start is already in what was carried
// in, so it is left out here.

import { newPractice, practiceFill } from "./replay.js";

/**
 * The fills since `start` (UTC seconds), the holdings now and the closes before, as a book.
 * `end` (a custom period that has ended, 19 Nov): only the fills before it go in
 * the book; what was carried in is still the holding now less every fill since
 * the start, so `fills` must run up to now. What is still held at the end is
 * valued by the caller at that day's close (the server's `endMarks`).
 * `fees`: coin fees taken in the coin ({ symbol, qty, time }).
 */
export function demoBook({ fills = [], positions = {}, marks = {}, start, end = null, fees = [] }) {
  const since = fills.filter((f) => !(f.time < start)).map((f) => ({ ...f })).sort((a, b) => a.time - b.time);
  // A coin fee taken in the coin (Alpaca's CFEE, dated, posted at the UTC
  // day's end) comes off a buy of that coin that day, so the holding now and
  // the fills agree and the fee is not read as a short carried in (19 Nov
  // review). With no such buy since the start, it was charged before.
  for (const fee of [...fees].sort((a, b) => a.time - b.time)) {
    const day = since.filter((f) => f.symbol === fee.symbol && f.side === "buy" && f.time <= fee.time && f.time > fee.time - 86400 && f.qty > fee.qty);
    const buy = day.filter((f) => !f.fee).at(-1) || day.at(-1);
    if (buy) { buy.qty -= fee.qty; buy.fee = (buy.fee || 0) + fee.qty; }
  }
  const by = {};
  for (const f of since) (by[f.symbol] = by[f.symbol] || []).push(f);
  const inPeriod = (f) => end === null || f.time < end;
  const symbols = new Set([...Object.keys(by), ...Object.keys(positions)]);
  const book = {};
  const carried = {};
  for (const s of symbols) {
    const list = by[s] || [];
    const net = list.reduce((a, f) => a + (f.side === "buy" ? f.qty : -f.qty), 0);
    const before = (Number(positions[s]?.qty) || 0) - net;
    let acct = newPractice(0);
    if (Math.abs(before) > 1e-9) {
      const mark = Number.isFinite(marks[s]) ? marks[s] : null;
      const price = mark ?? positions[s]?.avg ?? list.find(inPeriod)?.price ?? list[0]?.price ?? null;
      if (price > 0) {
        acct = practiceFill(acct, { side: before > 0 ? "buy" : "sell", qty: Math.abs(before), price, time: start, why: "carried" });
        carried[s] = { qty: before, price, from: mark !== null ? "close" : "cost" };
      }
    }
    for (const f of list.filter(inPeriod)) acct = practiceFill(acct, { side: f.side, qty: f.qty, price: f.price, time: f.time });
    if (acct.trades.length) book[s] = acct;
  }
  return { book, carried };
}

/**
 * Where a period starts (11 Nov, the owner: "The PNL for today's trading ...
 * it's totally wrong"; a short opened at 23:59:58 fell before a midnight
 * start, and the closing buy after it read as covering a short carried from
 * the 16:00 close). Today: 20:00 New York on the trading day before, when its
 * after-hours session ends and the overnight one into today opens; the trading
 * day rolls then, and a weekend's is Monday's. What was held at that moment
 * counts from the last 16:00 close before then (the marks). Across a weekend
 * that matches Alpaca's own day change: its last_equity was Friday's cash
 * after the after-hours trades plus what was still held at Friday's 16:00
 * close (Alton RS, 16 Nov, to the cent). Trades in the overnight session
 * (20:00 to 4:00) have not been checked against Alpaca's figure yet.
 * Until 16 Nov this started at 16:00, so Friday's after-hours trades on Alton
 * Live showed as Monday's (−$102.33 "today" with no trade made; the owner:
 * "It is showing loss 106 today and I haven't even traded anything so far").
 * Exchange holidays are not known here. 7 or 30 days: that many days before it.
 */
export function periodStart(id, now = Date.now() / 1000) {
  const days = { today: 0, week: 6, month: 29 }[id] ?? 0;
  let d = noon(tradingDay(now));
  do { d = new Date(d.getTime() - DAY); } while (weekend(d));
  // The window's days come off the calendar date before 20:00 is read in New
  // York time, so a window across a clock change still starts at 20:00.
  d = new Date(d.getTime() - days * DAY);
  return eightPm(ymd(d));
}

const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const weekend = (d) => [0, 6].includes(d.getUTCDay());
const noon = (date) => new Date(`${date}T12:00:00Z`);
const ymd = (d) => d.toISOString().slice(0, 10);

/** 20:00 New York on a calendar date (YYYY-MM-DD), in UTC seconds. */
function eightPm(date) {
  const guess = Date.parse(`${date}T00:00:00Z`) + DAY; // 20:00 New York in summer time, 19:00 in winter
  const hour = Number(new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return (hour === 20 ? guess : guess + 3600000) / 1000;
}

/** The trading day (YYYY-MM-DD) a moment belongs to: it rolls at 20:00 New York, and a weekend's is Monday's. */
export function tradingDay(now = Date.now() / 1000) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(now * 1000)).map((x) => [x.type, x.value]));
  let d = noon(`${p.year}-${p.month}-${p.day}`);
  if (Number(p.hour) >= 20) d = new Date(d.getTime() + DAY);
  while (weekend(d)) d = new Date(d.getTime() + DAY);
  return ymd(d);
}

/** When a date's trading day starts (UTC seconds): 20:00 New York on the weekday before it; a weekend date's is Monday's. */
export function dayStart(date) {
  let d = noon(date);
  while (weekend(d)) d = new Date(d.getTime() + DAY);
  do { d = new Date(d.getTime() - DAY); } while (weekend(d));
  return eightPm(ymd(d));
}

/** How far back a custom period may start: the fills are read for at most 92 days. */
export const CUSTOM_DAYS = 88;

/** The earliest and latest dates a custom period may use (YYYY-MM-DD). */
export function customBounds(now = Date.now() / 1000) {
  return { min: ymd(new Date(now * 1000 - CUSTOM_DAYS * DAY)), max: tradingDay(now) };
}

/**
 * A custom period (19 Nov, the owner: "for the P/L, I need custom period
 * too"), From and To as dates (YYYY-MM-DD), each trading day as Today's: from
 * 20:00 New York the evening before From to 20:00 on To, when after-hours ends.
 * `end` is null while To's trading day is still running (the period runs to
 * now, at live prices). A weekend To ends with Friday's. Null when the dates
 * cover no trading day or fall outside the last 92 days.
 */
export function customPeriod(from, to, now = Date.now() / 1000) {
  if (!DATE.test(String(from)) || !DATE.test(String(to)) || to < from) return null;
  const start = dayStart(from);
  const end = dayStart(ymd(new Date(noon(to).getTime() + DAY)));
  if (!(end > start) || start > now || now - start > 92 * 86400) return null;
  return { start, end: end > now ? null : end };
}
