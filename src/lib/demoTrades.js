// The demo (paper) account's results, built like the replay's (26 Oct: "You
// gave me some insights on the replay for the today's position and not on the
// Demo!"): its fills since a moment become a book of the same shape as the
// replay's practice book (lib/replay.js), so the same round trips and
// statistics come out of it. Pure, and tested (demoTrades.test.js); the fills
// are functions/terminal "fills", the view components/terminal/ReplayPanels.jsx.
//
// Shares or coins held from before the start count from the last close before
// it (yesterday's close, for today), as a broker's day P/L does; with no close
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

/** Where a period starts: today (New York), or that many days back, at New York midnight. */
export function periodStart(id, now = Date.now() / 1000) {
  const days = { today: 0, week: 6, month: 29 }[id] ?? 0;
  const at = now - days * 86400;
  const d = new Date(at * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const guess = Date.parse(`${d}T04:00:00Z`) / 1000;
  const hour = Number(new Date(guess * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return hour === 0 ? guess : guess + 3600;
}
