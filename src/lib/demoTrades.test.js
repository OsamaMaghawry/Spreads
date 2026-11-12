import test from "node:test";
import assert from "node:assert/strict";
import { demoBook, periodStart } from "./demoTrades.js";
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

test("today starts at the last 16:00 close; the trading day rolls at 20:00", () => {
  const ny = (s) => new Date(periodStart("today", at(s)) * 1000).toISOString();
  // Wednesday 7:40 (pre-market): Tuesday's close.
  assert.equal(ny("2026-11-11T12:40:00Z"), "2026-11-10T21:00:00.000Z");
  // 23:59:58 Tuesday and 0:01 Wednesday: the same trading day, from Tuesday's close (11 Nov, INTC).
  assert.equal(ny("2026-11-11T04:59:58Z"), "2026-11-10T21:00:00.000Z");
  assert.equal(ny("2026-11-11T05:01:48Z"), "2026-11-10T21:00:00.000Z");
  // Tuesday 17:00, before the overnight: Monday's close.
  assert.equal(ny("2026-11-10T22:00:00Z"), "2026-11-09T21:00:00.000Z");
  // Saturday and Friday night: Friday's close.
  assert.equal(ny("2026-11-14T17:00:00Z"), "2026-11-13T21:00:00.000Z");
  assert.equal(ny("2026-11-14T02:00:00Z"), "2026-11-13T21:00:00.000Z");
  // Summer time (Monday 26 Oct, 10:30): Friday's close at 20:00 UTC.
  assert.equal(ny("2026-10-26T14:30:00Z"), "2026-10-23T20:00:00.000Z");
  assert.equal(new Date(periodStart("week", at("2026-11-11T12:40:00Z")) * 1000).toISOString(), "2026-11-04T21:00:00.000Z");
});

test("the night of 10-11 Nov on Alton Live: shorts opened and covered, the day's P/L from Tuesday's close", () => {
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
  // Nothing short carried in: INTC's 109 were sold short at 59.68, not held short from the 58.13 close.
  assert.equal(carried.INTC, undefined);
  assert.ok(Math.abs(book.INTC.realized - (59.68 * 109 - (27 * 60.21 + 27 * 60.22 + 55 * 60.27))) < 1e-6); // −61.31
  assert.ok(Math.abs(book.AMZN.realized - 7 * (271.2537 - 273.1)) < 1e-6);
  assert.deepEqual(carried.SH, { qty: 193, price: 33.08, from: "close" });
});

// Audit 2026-W46 F6: a 7- or 30-day window that spans a clock change started
// at 17:00, not 16:00: the days were taken off in 24-hour steps after the
// close had been resolved in New York time.
test("a week or month window starts at 16:00 New York across a clock change", () => {
  const iso = (id, s) => new Date(periodStart(id, at(s)) * 1000).toISOString();
  // Thu 12 Nov 11:00 (winter): 29 days back is Tue 13 Oct (summer), close 20:00 UTC.
  assert.equal(iso("month", "2026-11-12T16:00:00Z"), "2026-10-13T20:00:00.000Z");
  // Thu 5 Nov 11:00: today from Wed 4 Nov, 6 days back is Thu 29 Oct (summer).
  assert.equal(iso("week", "2026-11-05T16:00:00Z"), "2026-10-29T20:00:00.000Z");
  // Spring (clocks change Sun 14 Mar 2027): Thu 18 Mar 11:00, today from Wed 17 Mar,
  // 6 days back is Thu 11 Mar (winter), close 21:00 UTC.
  assert.equal(iso("week", "2027-03-18T15:00:00Z"), "2027-03-11T21:00:00.000Z");
});
