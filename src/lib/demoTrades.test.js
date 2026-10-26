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

test("periods start at New York midnight", () => {
  const now = at("2026-10-26T14:30:00Z");
  assert.equal(new Date(periodStart("today", now) * 1000).toISOString(), "2026-10-26T04:00:00.000Z");
  assert.equal(new Date(periodStart("week", now) * 1000).toISOString(), "2026-10-20T04:00:00.000Z");
  // Across the clocks going back (1 Nov 2026): winter time, five hours behind.
  assert.equal(new Date(periodStart("today", at("2026-11-03T15:00:00Z")) * 1000).toISOString(), "2026-11-03T05:00:00.000Z");
});
