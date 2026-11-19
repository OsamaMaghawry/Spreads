import test from "node:test";
import assert from "node:assert/strict";
import { demoBook, periodStart, customPeriod, customBounds, dayStart } from "./demoTrades.js";
import { bookTrips, bookValue, tradeStats } from "./replay.js";

const at = (s) => Date.parse(s) / 1000;
const MONDAY = at("2026-10-26T04:00:00Z");

test("today's trades as round trips: RENT bought before the open and sold, with what was already held", () => {
  const fills = [
    { symbol: "RENT", side: "buy", qty: 521, price: 3.04, time: at("2026-10-26T10:16:36Z") },
    { symbol: "RENT", side: "sell", qty: 300, price: 3.3, time: at("2026-10-26T14:05:00Z") },
    { symbol: "RENT", side: "sell", qty: 221, price: 2.97, time: at("2026-10-26T14:40:00Z") },
    // 100 of the 400 WMT held since last week sold today.
    { symbol: "WMT", side: "sell", qty: 100, price: 101, time: at("2026-10-26T15:00:00Z") }
  ];
  const positions = { WMT: { qty: 300, last: 102, avg: 95 }, AMZN: { qty: 100, last: 210, avg: 200 } };
  const marks = { RENT: 2.3, WMT: 100, AMZN: 208 };
  const { book, carried } = demoBook({ fills, positions, marks, start: MONDAY });
  // RENT: flat before and after; one closed trip.
  const trips = bookTrips(book);
  const rent = trips.filter((t) => t.symbol === "RENT");
  assert.equal(rent.length, 1);
  assert.equal(rent[0].open, false);
  assert.ok(Math.abs(rent[0].realized - (300 * (3.3 - 3.04) + 221 * (2.97 - 3.04))) < 1e-9);
  // WMT: 400 carried in at Friday's close (100), 100 sold at 101, 300 still held.
  assert.deepEqual(carried.WMT, { qty: 400, price: 100, from: "close" });
  assert.ok(Math.abs(book.WMT.realized - 100) < 1e-9);
  assert.equal(book.WMT.qty, 300);
  // AMZN: held, not traded: today's move is its open P/L.
  assert.deepEqual(carried.AMZN, { qty: 100, price: 208, from: "close" });
  const prices = { WMT: 102, AMZN: 210 };
  const v = bookValue(book, (s) => prices[s] ?? null);
  assert.ok(Math.abs(v.unrealized - (300 * 2 + 100 * 2)) < 1e-9);
  const stats = tradeStats(trips);
  assert.equal(stats.trades, 1);
  assert.equal(stats.open, 2);
  assert.equal(carried.RENT, undefined);
});

test("a short, coins in fractions, and a holding with no close to hand", () => {
  const fills = [
    { symbol: "TSLA", side: "sell", qty: 10, price: 380, time: at("2026-10-26T14:00:00Z") },
    { symbol: "TSLA", side: "buy", qty: 10, price: 375, time: at("2026-10-26T15:00:00Z") },
    { symbol: "ETH/USD", side: "buy", qty: 0.25, price: 4000, time: at("2026-10-26T12:00:00Z") }
  ];
  const positions = { "ETH/USD": { qty: 0.748749999, last: 4050, avg: 3900 } };
  const { book, carried } = demoBook({ fills, positions, marks: {}, start: MONDAY });
  assert.ok(Math.abs(book.TSLA.realized - 50) < 1e-9);
  assert.equal(bookTrips(book).find((t) => t.symbol === "TSLA").side, "short");
  // 0.498749999 carried in, at its average cost (no close read).
  assert.equal(carried["ETH/USD"].from, "cost");
  assert.ok(Math.abs(carried["ETH/USD"].qty - 0.498749999) < 1e-12);
  assert.ok(Math.abs(book["ETH/USD"].qty - 0.748749999) < 1e-12);
});

test("today starts at 20:00 on the trading day before, when after-hours ends; the trading day rolls then", () => {
  const ny = (s) => new Date(periodStart("today", at(s)) * 1000).toISOString();
  // Wednesday 7:40 (pre-market): Tuesday 20:00 (01:00 UTC Wednesday, winter).
  assert.equal(ny("2026-11-11T12:40:00Z"), "2026-11-11T01:00:00.000Z");
  // 23:59:58 Tuesday and 0:01 Wednesday: the same trading day, from Tuesday 20:00 (11 Nov, INTC).
  assert.equal(ny("2026-11-11T04:59:58Z"), "2026-11-11T01:00:00.000Z");
  assert.equal(ny("2026-11-11T05:01:48Z"), "2026-11-11T01:00:00.000Z");
  // Tuesday 17:00, in after-hours: still Tuesday's trading day, from Monday 20:00.
  assert.equal(ny("2026-11-10T22:00:00Z"), "2026-11-10T01:00:00.000Z");
  // Saturday, and Friday 21:00 (past the roll): Monday's, from Friday 20:00.
  assert.equal(ny("2026-11-14T17:00:00Z"), "2026-11-14T01:00:00.000Z");
  assert.equal(ny("2026-11-14T02:00:00Z"), "2026-11-14T01:00:00.000Z");
  // Summer time (Monday 26 Oct, 10:30): Friday 20:00 is 00:00 UTC Saturday.
  assert.equal(ny("2026-10-26T14:30:00Z"), "2026-10-24T00:00:00.000Z");
  assert.equal(new Date(periodStart("week", at("2026-11-11T12:40:00Z")) * 1000).toISOString(), "2026-11-05T01:00:00.000Z");
});

// 16 Nov, the owner: "It is showing loss 106 today and I haven't even traded
// anything so far". Alton Live closed everything after hours on Friday (TSLA
// long 72 bought 15:51 at 392.256, sold 16:05-16:15; SPCX, NVDA and TSLA
// shorts); Monday's "today" counted those from Friday's 16:00 close: −$102.33.
// Alpaca's own day change was $0.00.
test("Monday 16 Nov on Alton Live: Friday's after-hours trades are Friday's, not today's", () => {
  const f = (symbol, side, qty, price, t) => ({ symbol, side, qty, price, time: at(t) });
  const friday = [
    f("TSLA", "sell", 18, 387.79, "2026-11-13T21:05:55Z"), f("TSLA", "sell", 13, 387.8346, "2026-11-13T21:05:55Z"),
    f("SPCX", "buy", 11, 138.12, "2026-11-13T21:07:10Z"), f("NVDA", "buy", 38, 162.07, "2026-11-13T21:17:18Z")
  ];
  const start = periodStart("today", at("2026-11-16T14:30:00Z"));
  assert.equal(new Date(start * 1000).toISOString(), "2026-11-14T01:00:00.000Z");
  assert.ok(friday.every((x) => x.time < start));
  // Nothing held, no fill since Friday 20:00: nothing today, even if Friday's fills are handed in.
  const { book, carried } = demoBook({ fills: friday, positions: {}, marks: { TSLA: 390.22, SPCX: 139.11, NVDA: 162.85 }, start });
  assert.deepEqual(book, {});
  assert.deepEqual(carried, {});
});

test("held across after-hours: counted from the 16:00 close, as Alpaca's last_equity was across the weekend", () => {
  // Alton RS, 16 Nov: 400 WMT held over the weekend, Friday's close 128.09, 128.5899 now.
  const start = periodStart("today", at("2026-11-16T14:46:00Z"));
  const { book, carried } = demoBook({ fills: [], positions: { WMT: { qty: 400, last: 128.5899, avg: 107.5 } }, marks: { WMT: 128.09 }, start });
  assert.deepEqual(carried.WMT, { qty: 400, price: 128.09, from: "close" });
  assert.ok(Math.abs(book.WMT.qty - 400) < 1e-9);
});

test("the night of 10-11 Nov on Alton Live: shorts opened and covered, the day's P/L from Tuesday 20:00", () => {
  const f = (symbol, side, qty, price, t) => ({ symbol, side, qty, price, time: at(t) });
  const fills = [
    f("AMZN", "sell", 7, 271.2537, "2026-11-10T23:57:33Z"), f("AMZN", "buy", 7, 273.1, "2026-11-11T04:02:22Z"),
    f("INTC", "sell", 109, 59.68, "2026-11-11T04:59:58Z"), f("NVDA", "sell", 37, 172.53, "2026-11-11T05:01:48Z"),
    f("INTC", "buy", 27, 60.21, "2026-11-11T05:33:20Z"), f("INTC", "buy", 27, 60.22, "2026-11-11T05:34:32Z"), f("INTC", "buy", 55, 60.27, "2026-11-11T05:35:57Z"),
    f("NVDA", "buy", 1, 172.828, "2026-11-11T05:43:23Z"), f("NVDA", "buy", 36, 172.85, "2026-11-11T05:44:02Z")
  ];
  const positions = { SH: { qty: 193, last: 32.8, avg: 33.1598 } };
  const marks = { AMZN: 270.87, INTC: 58.13, NVDA: 168.89, SH: 33.08 };
  const { book, carried } = demoBook({ fills, positions, marks, start: periodStart("today", at("2026-11-11T12:40:00Z")) });
  // Nothing short carried in: INTC's 109 were sold short at 59.68 (23:59:58), not held short from the 58.13 close.
  assert.equal(carried.INTC, undefined);
  assert.ok(Math.abs(book.INTC.realized - (59.68 * 109 - (27 * 60.21 + 27 * 60.22 + 55 * 60.27))) < 1e-6); // −61.31
  // AMZN was sold short at 18:57 Tuesday, in after-hours: Tuesday's. Wednesday's
  // part runs from Tuesday's close to the cover, as for anything held across 20:00.
  assert.deepEqual(carried.AMZN, { qty: -7, price: 270.87, from: "close" });
  assert.ok(Math.abs(book.AMZN.realized - 7 * (270.87 - 273.1)) < 1e-6);
  assert.deepEqual(carried.SH, { qty: 193, price: 33.08, from: "close" });
});

// Audit 2026-W46 F6: a 7- or 30-day window that spans a clock change started
// an hour off: the days were taken off in 24-hour steps after the start had
// been resolved in New York time.
test("a week or month window starts at 20:00 New York across a clock change", () => {
  const iso = (id, s) => new Date(periodStart(id, at(s)) * 1000).toISOString();
  // Thu 12 Nov 11:00 (winter): 29 days back is Tue 13 Oct (summer), 20:00 is 00:00 UTC.
  assert.equal(iso("month", "2026-11-12T16:00:00Z"), "2026-10-14T00:00:00.000Z");
  // Thu 5 Nov 11:00: today from Wed 4 Nov, 6 days back is Thu 29 Oct (summer).
  assert.equal(iso("week", "2026-11-05T16:00:00Z"), "2026-10-30T00:00:00.000Z");
  // Spring (clocks change Sun 14 Mar 2027): Thu 18 Mar 11:00, today from Wed 17 Mar,
  // 6 days back is Thu 11 Mar (winter), 20:00 is 01:00 UTC.
  assert.equal(iso("week", "2027-03-18T15:00:00Z"), "2027-03-12T01:00:00.000Z");
});

// 19 Nov, the owner: "for the P/L, I need custom period too." and "So the
// close same as Alpaca": each day from 20:00 the evening before, as Today; a
// position still held when a past period ends is valued at that day's 16:00 close.
test("a custom period: from 20:00 the evening before From to 20:00 on To", () => {
  const iso = (x) => (x === null ? null : new Date(x * 1000).toISOString());
  const now = at("2026-11-19T15:00:00Z"); // Thursday 10:00
  const p = (f, t, n = now) => { const r = customPeriod(f, t, n); return r && { start: iso(r.start), end: iso(r.end) }; };
  // One past day: Monday 16 Nov 20:00 to Tuesday 17 Nov 20:00.
  assert.deepEqual(p("2026-11-17", "2026-11-17"), { start: "2026-11-17T01:00:00.000Z", end: "2026-11-18T01:00:00.000Z" });
  // From a Monday: Friday 20:00. To today: runs to now.
  assert.deepEqual(p("2026-11-16", "2026-11-19"), { start: "2026-11-14T01:00:00.000Z", end: null });
  // To today, after 20:00: today's trading day has ended.
  assert.deepEqual(p("2026-11-19", "2026-11-19", at("2026-11-20T02:00:00Z")), { start: "2026-11-19T01:00:00.000Z", end: "2026-11-20T01:00:00.000Z" });
  // A weekend To ends with Friday's trading day; a weekend alone has none.
  assert.deepEqual(p("2026-11-13", "2026-11-15"), { start: "2026-11-13T01:00:00.000Z", end: "2026-11-14T01:00:00.000Z" });
  assert.equal(p("2026-11-14", "2026-11-15"), null);
  // To before From, a future From, a bad date, or more than 92 days back.
  assert.equal(p("2026-11-18", "2026-11-17"), null);
  assert.equal(p("2026-11-20", "2026-11-20"), null);
  assert.equal(p("17/11/2026", "2026-11-17"), null);
  assert.equal(p("2026-08-01", "2026-08-03"), null);
  // The earliest date offered still starts within 92 days, on any weekday.
  for (let d = 0; d < 7; d++) {
    const n = now + d * 86400;
    const { min, max } = customBounds(n);
    assert.ok(n - dayStart(min) <= 92 * 86400, min);
    assert.ok(customPeriod(min, max, n));
  }
  // Today's custom period is Today's.
  assert.equal(customPeriod("2026-11-19", "2026-11-19", now).start, periodStart("today", now));
});

test("a period that ended: later fills left out, what was carried in still counted from all of them", () => {
  const f = (symbol, side, qty, price, t) => ({ symbol, side, qty, price, time: at(t) });
  const { start, end } = customPeriod("2026-11-17", "2026-11-17", at("2026-11-19T15:00:00Z"));
  // 100 AAPL held from before (close 200); 50 sold Tuesday at 205; 60 NVDA
  // bought Tuesday at 180 and still held at Tuesday's close (182); Wednesday
  // the rest of AAPL was sold and 20 MSFT bought: not Tuesday's.
  const fills = [
    f("AAPL", "sell", 50, 205, "2026-11-17T15:00:00Z"), f("NVDA", "buy", 60, 180, "2026-11-17T16:00:00Z"),
    f("AAPL", "sell", 50, 207, "2026-11-18T15:00:00Z"), f("MSFT", "buy", 20, 500, "2026-11-18T15:30:00Z")
  ];
  const positions = { NVDA: { qty: 60, last: 190, avg: 180 }, MSFT: { qty: 20, last: 505, avg: 500 } };
  const { book, carried } = demoBook({ fills, positions, marks: { AAPL: 200, NVDA: 175, MSFT: 495 }, start, end });
  assert.deepEqual(carried.AAPL, { qty: 100, price: 200, from: "close" });
  assert.equal(carried.NVDA, undefined);
  assert.equal(carried.MSFT, undefined);
  assert.equal(book.MSFT, undefined);
  assert.ok(Math.abs(book.AAPL.realized - 250) < 1e-9);
  assert.equal(book.AAPL.qty, 50);
  assert.equal(book.NVDA.qty, 60);
  // At Tuesday's closes: AAPL 204, NVDA 182.
  const endMarks = { AAPL: 204, NVDA: 182 };
  const v = bookValue(book, (s) => endMarks[s] ?? null);
  assert.ok(Math.abs(v.unrealized - (50 * 4 + 60 * 2)) < 1e-9);
});

test("back-to-back periods add up to the one that covers both", () => {
  const f = (symbol, side, qty, price, t) => ({ symbol, side, qty, price, time: at(t) });
  const now = at("2026-11-19T15:00:00Z");
  const fills = [
    f("TSLA", "buy", 10, 400, "2026-11-17T15:00:00Z"), f("TSLA", "sell", 4, 410, "2026-11-17T19:00:00Z"),
    f("TSLA", "sell", 6, 395, "2026-11-18T15:00:00Z"), f("SPY", "sell", 5, 600, "2026-11-18T16:00:00Z"),
    f("QQQ", "buy", 3, 520, "2026-11-19T14:40:00Z")
  ];
  const positions = { SPY: { qty: 15, last: 601, avg: 590 }, QQQ: { qty: 3, last: 521, avg: 520 } };
  // Closes: Monday 16th (before Tuesday), Tuesday 17th, Wednesday 18th.
  const close = { "2026-11-16": { TSLA: 398, SPY: 595, QQQ: 515 }, "2026-11-17": { TSLA: 405, SPY: 597, QQQ: 517 }, "2026-11-18": { TSLA: 401, SPY: 599, QQQ: 519 } };
  const total = (from, to, startClose, endClose) => {
    const p = customPeriod(from, to, now);
    const { book } = demoBook({ fills, positions, marks: close[startClose], start: p.start, end: p.end });
    const v = bookValue(book, (s) => close[endClose][s] ?? null);
    return v.realized + v.unrealized;
  };
  const tue = total("2026-11-17", "2026-11-17", "2026-11-16", "2026-11-17");
  const wed = total("2026-11-18", "2026-11-18", "2026-11-17", "2026-11-18");
  const both = total("2026-11-17", "2026-11-18", "2026-11-16", "2026-11-18");
  // Tuesday: TSLA 4 × 10 realized + 6 × 5 open; SPY 20 held, 595 → 597.
  assert.ok(Math.abs(tue - (40 + 30 + 40)) < 1e-9);
  assert.ok(Math.abs(tue + wed - both) < 1e-9);
});

test("To today: the same book as the live view", () => {
  const f = (symbol, side, qty, price, t) => ({ symbol, side, qty, price, time: at(t) });
  const now = at("2026-11-19T15:00:00Z");
  const fills = [f("AMD", "buy", 10, 150, "2026-11-18T15:00:00Z"), f("AMD", "sell", 5, 155, "2026-11-19T14:45:00Z")];
  const positions = { AMD: { qty: 5, last: 156, avg: 150 } };
  const p = customPeriod("2026-11-18", "2026-11-19", now);
  assert.equal(p.end, null);
  const custom = demoBook({ fills, positions, marks: {}, start: p.start, end: p.end });
  const live = demoBook({ fills, positions, marks: {}, start: p.start });
  assert.deepEqual(custom, live);
});
