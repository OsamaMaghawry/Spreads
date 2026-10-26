import test from "node:test";
import assert from "node:assert/strict";
import { guardedStops, reaches, guardHours, exitOrder, restoreOrder } from "./stopGuard.ts";

// The account's open orders as Alpaca lists them (nested=true), 26 Oct: 490
// RENT held, the terminal's take profit at 3.60 paired with a stop at 2.95.
const PAIR = {
  id: "b7fad269", client_order_id: "TERM_1793011139000", symbol: "RENT", asset_class: "us_equity", side: "sell", qty: "490",
  type: "limit", limit_price: "3.6", order_class: "oco", status: "new", created_at: "2026-10-26T11:18:59Z",
  legs: [{ id: "leg1", client_order_id: "x", symbol: "RENT", side: "sell", qty: "490", type: "stop", stop_price: "2.95", status: "held" }]
};

test("the terminal's own stops: a pair's stop, a plain stop, a stop-limit; nothing else", () => {
  const orders = [
    PAIR,
    { id: "s1", client_order_id: "TERM_1", symbol: "WMT", asset_class: "us_equity", side: "sell", qty: "300", type: "stop", stop_price: "115", order_class: "simple" },
    { id: "s2", client_order_id: "TERM_2", symbol: "TSLA", asset_class: "us_equity", side: "buy", qty: "10", type: "stop_limit", stop_price: "390", limit_price: "392", order_class: "" },
    // Not the terminal's; a trailing stop; a coin; a plain take profit.
    { id: "x1", client_order_id: "web_1", symbol: "AMZN", side: "sell", qty: "100", type: "stop", stop_price: "240" },
    { id: "x2", client_order_id: "TERM_3", symbol: "JNJ", side: "sell", qty: "300", type: "trailing_stop", trail_percent: "2" },
    { id: "x3", client_order_id: "TERM_4", symbol: "BTC/USD", asset_class: "crypto", side: "sell", qty: "0.1", type: "stop_limit", stop_price: "60000", limit_price: "59400" },
    { id: "x4", client_order_id: "TERM_5", symbol: "XOP", side: "sell", qty: "100", type: "limit", limit_price: "210" }
  ];
  assert.deepEqual(guardedStops(orders), [
    { orderId: "b7fad269", symbol: "RENT", side: "sell", qty: 490, stop: 2.95, limit: null, pair: true, since: Date.parse("2026-10-26T11:18:59Z") },
    { orderId: "s1", symbol: "WMT", side: "sell", qty: 300, stop: 115, limit: null, pair: false, since: 0 },
    { orderId: "s2", symbol: "TSLA", side: "buy", qty: 10, stop: 390, limit: 392, pair: false, since: 0 }
  ]);
  assert.deepEqual(guardedStops(null as any), []);
});

test("a trade reaches the stop at or through it, in round lots", () => {
  const [g] = guardedStops([PAIR]);
  assert.equal(reaches(g, 2.95, 100), true);
  assert.equal(reaches(g, 2.9, 500), true);
  assert.equal(reaches(g, 2.96, 1000), false);
  assert.equal(reaches(g, 2.5, 99), false, "an odd lot does not set the last sale");
  const short = { ...g, side: "buy" as const, stop: 3.5 };
  assert.deepEqual([reaches(short, 3.5, 100), reaches(short, 3.49, 100)], [true, false]);
});

test("the hours the terminal fires stops: outside 9:30 to 16:00, while real-time trades come", () => {
  const ny = (iso: string) => Date.parse(iso);
  // Monday 26 Oct 2026, New York four hours behind UTC.
  assert.equal(guardHours(ny("2026-10-26T08:05:00Z"), "eodhd"), true, "4:05 pre-market, EODHD");
  assert.equal(guardHours(ny("2026-10-26T08:05:00Z"), "iex"), false, "IEX opens at 8:00");
  assert.equal(guardHours(ny("2026-10-26T12:30:00Z"), "iex"), true, "8:30");
  assert.equal(guardHours(ny("2026-10-26T13:30:00Z"), "eodhd"), false, "9:30: Alpaca's own stop works");
  assert.equal(guardHours(ny("2026-10-26T19:59:00Z"), "eodhd"), false, "15:59");
  assert.equal(guardHours(ny("2026-10-26T20:00:00Z"), "eodhd"), true, "16:00 after hours");
  assert.equal(guardHours(ny("2026-10-26T21:30:00Z"), "iex"), false, "17:30: IEX closed");
  assert.equal(guardHours(ny("2026-10-26T23:59:00Z"), "eodhd"), true, "19:59");
  assert.equal(guardHours(ny("2026-10-27T00:00:00Z"), "eodhd"), false, "20:00");
  assert.equal(guardHours(ny("2026-10-24T14:00:00Z"), "eodhd"), false, "Saturday");
  assert.equal(guardHours(ny("2026-10-26T12:30:00Z"), null), false, "no real-time source");
  // Winter: five hours behind (2 Nov 2026), 4:30 New York is 9:30 UTC.
  assert.equal(guardHours(ny("2026-11-02T09:30:00Z"), "eodhd"), true);
  assert.equal(guardHours(ny("2026-11-02T14:30:00Z"), "eodhd"), false);
});

test("the order that replaces it: a limit at the stop price, for the day, extended hours, for what is still held", () => {
  const [g] = guardedStops([PAIR]);
  assert.deepEqual(exitOrder(g, 490, "TERM_XS_1"), {
    ok: true,
    body: { symbol: "RENT", side: "sell", qty: "490", type: "limit", limit_price: "2.95", time_in_force: "day", extended_hours: true, client_order_id: "TERM_XS_1" }
  });
  // Part sold since: only what is left.
  assert.equal((exitOrder(g, 200, "c") as any).body.qty, "200");
  // Nothing held, or short: never opened by a stop.
  assert.equal(exitOrder(g, 0, "c").ok, false);
  assert.equal(exitOrder(g, -50, "c").ok, false);
  // A stop-limit goes at its own limit; a buy back needs a short.
  const s = { orderId: "s2", symbol: "TSLA", side: "buy" as const, qty: 10, stop: 390, limit: 392, pair: false, since: 0 };
  assert.equal((exitOrder(s, -10, "c") as any).body.limit_price, "392.00");
  assert.equal(exitOrder(s, 10, "c").ok, false);
  // A price under a dollar keeps four places.
  assert.equal((exitOrder({ ...g, stop: 0.4567 }, 490, "c") as any).body.limit_price, "0.4567");
});

test("if the limit is refused, the stop goes back as it was", () => {
  const [g] = guardedStops([PAIR]);
  assert.deepEqual(restoreOrder(g, 490, "TERM_R_1"), { symbol: "RENT", side: "sell", qty: "490", type: "stop", stop_price: "2.95", time_in_force: "gtc", client_order_id: "TERM_R_1" });
  const s = { orderId: "s2", symbol: "TSLA", side: "buy" as const, qty: 10, stop: 390, limit: 392, pair: false, since: 0 };
  assert.equal(restoreOrder(s, 10, "c").type, "stop_limit");
  assert.equal(restoreOrder(s, 10, "c").limit_price, "392.00");
  assert.equal(restoreOrder(g, 2.5, "c").time_in_force, "day");
});
