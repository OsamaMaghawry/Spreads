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
// of those fills.

import { newPractice, practiceFill } from "./replay.js";

/** The fills since `start` (UTC seconds), the holdings now and the closes before, as a book. */
export function demoBook({ fills = [], positions = {}, marks = {}, start }) {
  const by = {};
  for (const f of [...fills].sort((a, b) => a.time - b.time)) (by[f.symbol] = by[f.symbol] || []).push(f);
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
      const price = mark ?? positions[s]?.avg ?? list[0]?.price ?? null;
      if (price > 0) {
        acct = practiceFill(acct, { side: before > 0 ? "buy" : "sell", qty: Math.abs(before), price, time: start, why: "carried" });
        carried[s] = { qty: before, price, from: mark !== null ? "close" : "cost" };
      }
    }
    for (const f of list) acct = practiceFill(acct, { side: f.side, qty: f.qty, price: f.price, time: f.time });
    if (acct.trades.length) book[s] = acct;
  }
  return { book, carried };
}

/**
 * Where a period starts (11 Nov, the owner: "The PNL for today's trading ...
 * it's totally wrong"; a short opened at 23:59:58 fell before a midnight
 * start, and the closing buy after it read as covering a short carried from
 * the 16:00 close). Today: the last regular close before the trading day,
 * 16:00 New York, the moment the closes that value what was held are from, as
 * Alpaca's own day change counts. The trading day rolls at 20:00, when the
 * overnight session into the next one opens; a weekend's is Monday's. Exchange
 * holidays are not known here. 7 or 30 days: that many days before it.
 */
export function periodStart(id, now = Date.now() / 1000) {
  const days = { today: 0, week: 6, month: 29 }[id] ?? 0;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(now * 1000)).map((x) => [x.type, x.value]));
  const DAY = 86400000;
  const weekend = (d) => [0, 6].includes(d.getUTCDay());
  let d = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  if (Number(p.hour) >= 20) d = new Date(d.getTime() + DAY);
  while (weekend(d)) d = new Date(d.getTime() + DAY);
  do { d = new Date(d.getTime() - DAY); } while (weekend(d));
  // The window's days come off the calendar date before 16:00 is read in New
  // York time, so a window across a clock change still starts at the close.
  d = new Date(d.getTime() - days * DAY);
  const date = d.toISOString().slice(0, 10);
  const guess = Date.parse(`${date}T20:00:00Z`);
  const hour = Number(new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return (hour === 16 ? guess : guess + 3600000) / 1000;
}
