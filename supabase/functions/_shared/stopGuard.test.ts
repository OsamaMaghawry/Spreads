import test from "node:test";
import assert from "node:assert/strict";
import { guardedStops, reaches, hit, guardHours, exitOrder, restoreOrder, handBack, chasePrice } from "./stopGuard.ts";

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
    { symbol: "RENT", since: Date.parse("2026-10-26T11:18:59Z"), orderId: "b7fad269", cancel: ["b7fad269"], side: "sell", qty: 490, stop: 2.95, limit: null, pair: true, target: 3.6 },
    { symbol: "WMT", since: 0, orderId: "s1", cancel: ["s1"], side: "sell", qty: 300, stop: 115, limit: null, pair: false, target: null },
    { symbol: "TSLA", since: 0, orderId: "s2", cancel: ["s2"], side: "buy", qty: 10, stop: 390, limit: 392, pair: false, target: null }
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
  const s = { orderId: "s2", symbol: "TSLA", side: "buy" as const, qty: 10, stop: 390, limit: 392, pair: false, target: null, since: 0 };
  assert.equal((exitOrder(s, -10, "c") as any).body.limit_price, "392.00");
  assert.equal(exitOrder(s, 10, "c").ok, false);
  // A price under a dollar keeps four places.
  assert.equal((exitOrder({ ...g, stop: 0.4567 }, 490, "c") as any).body.limit_price, "0.4567");
});

test("the stop goes back as it was: a pair as a pair, a stop-limit with its limit", () => {
  const [g] = guardedStops([PAIR]);
  assert.deepEqual(restoreOrder(g, 490, "TERM_R_1"), {
    symbol: "RENT", side: "sell", qty: "490", type: "limit", time_in_force: "gtc", order_class: "oco", client_order_id: "TERM_R_1",
    take_profit: { limit_price: "3.60" }, stop_loss: { stop_price: "2.95", limit_price: "2.89" }
  });
  // Every stop goes back as a stop-limit (30 Oct), its limit 2% past the stop.
  assert.deepEqual(restoreOrder({ ...g, target: null }, 490, "TERM_R_2"), { symbol: "RENT", side: "sell", qty: "490", type: "stop_limit", stop_price: "2.95", limit_price: "2.89", time_in_force: "gtc", client_order_id: "TERM_R_2" });
  const s = { orderId: "s2", symbol: "TSLA", side: "buy" as const, qty: 10, stop: 390, limit: 392, pair: false, target: null, since: 0 };
  assert.equal(restoreOrder(s, 10, "c").type, "stop_limit");
  assert.equal(restoreOrder(s, 10, "c").limit_price, "392.00");
  // Part of a share: no pair, for the day.
  assert.equal(restoreOrder(g, 2.5, "c").type, "stop_limit");
  assert.equal(restoreOrder(g, 2.5, "c").time_in_force, "day");
});

test("a fired stop's limit: filled, done; cancelled by you, left; expired, or working at the open, the stop goes back", () => {
  assert.equal(handBack("filled", false), "done");
  assert.equal(handBack("canceled", true), "cancelled");
  assert.equal(handBack("expired", false), "return");
  assert.equal(handBack("new", false), "wait");
  assert.equal(handBack("partially_filled", false), "wait");
  assert.equal(handBack("new", true), "return");
  assert.equal(handBack("partially_filled", true), "return");
});

// 27 Oct, AIOK on two paper accounts before the open: "Orders for TP and SL
// still don't get executed". Take profits wait for 9:30 at Alpaca as stops do.
test("take profits too: a pair's, one on its own, and a filled bracket's two exits", () => {
  const alone = { id: "t1", client_order_id: "TERM_9", symbol: "AIOK", asset_class: "us_equity", side: "sell", qty: "51", type: "limit", limit_price: "11.5", time_in_force: "gtc", extended_hours: false, order_class: "simple" };
  const dayLimit = { ...alone, id: "t2", time_in_force: "day", extended_hours: true }; // an entry or exit already working outside hours
  const bracket = {
    id: "b1", client_order_id: "TERM_7", symbol: "AIOK", asset_class: "us_equity", side: "buy", qty: "74", type: "limit", limit_price: "10.75", order_class: "bracket", status: "filled",
    legs: [
      { id: "tp", side: "sell", qty: "74", type: "limit", limit_price: "11.8", status: "new" },
      { id: "sl", side: "sell", qty: "74", type: "stop", stop_price: "10.2", status: "held" }
    ]
  };
  const waiting = { ...bracket, id: "b2", status: "new" }; // its entry not filled yet: nothing to protect
  const [t, b] = guardedStops([alone, dayLimit, bracket, waiting]);
  assert.deepEqual([t.orderId, t.stop, t.target, t.pair], ["t1", null, 11.5, false]);
  assert.deepEqual([b.orderId, b.cancel, b.side, b.qty, b.stop, b.target, b.pair], ["tp", ["tp", "sl"], "sell", 74, 10.2, 11.8, true]);
  assert.equal(guardedStops([dayLimit, waiting]).length, 0);
  // Which exit a trade reaches: round lots only, the take profit at or beyond it.
  assert.equal(hit(b, 11.8, 100), "target");
  assert.equal(hit(b, 12, 200), "target");
  assert.equal(hit(b, 11.79, 500), null);
  assert.equal(hit(b, 10.2, 100), "stop");
  assert.equal(hit(b, 12, 50), null, "an odd lot does not count");
  assert.equal(hit(t, 11.5, 100), "target");
  const cover = { ...b, side: "buy" as const, stop: 12, target: 10 };
  assert.deepEqual([hit(cover, 10, 100), hit(cover, 12, 100), hit(cover, 11, 100)], ["target", "stop", null]);
  // The limit goes at the take-profit price; nothing opens a position.
  const sent = exitOrder(b, 74, "TERM_XS_1", "target") as any;
  assert.deepEqual([sent.body.limit_price, sent.body.qty, sent.body.extended_hours, sent.body.time_in_force], ["11.80", "74", true, "day"]);
  assert.equal(exitOrder(t, 0, "x", "target").ok, false);
  // Put back: the pair as a pair; a take profit alone as a take profit.
  assert.equal(restoreOrder(b, 74, "R").order_class, "oco");
  assert.deepEqual(restoreOrder(t, 51, "R"), { symbol: "AIOK", side: "sell", qty: "51", type: "limit", limit_price: "11.50", time_in_force: "gtc", client_order_id: "R" });
});

// 28 Oct, live DAVI: the stop at 4.02 fired at 4.01 and its limit at 4.02 sat
// unfilled as the price fell. The owner: "Chase the bid".
test("a fired stop's limit chases the bid, only ever toward the market", () => {
  assert.equal(chasePrice("sell", { bid: 3.98, ask: 4.0, last: 3.99 }), 3.98);
  // A bid far from the last trade is not the market: 2% under the last price instead.
  assert.equal(chasePrice("sell", { bid: 2.5, last: 3.99 }), 3.91);
  assert.equal(chasePrice("sell", { last: 3.99 }), 3.91);
  // Moved down as the bid falls; never back up.
  assert.equal(chasePrice("sell", { bid: 3.9, last: 3.9 }, 3.98), 3.9);
  assert.equal(chasePrice("sell", { bid: 4.05, last: 4.05 }, 3.98), null);
  // Buying back a short follows the ask, up.
  assert.equal(chasePrice("buy", { bid: 10, ask: 10.1, last: 10.05 }), 10.1);
  assert.equal(chasePrice("buy", { ask: 10.0, last: 10.05 }, 10.1), null);
  // Under a dollar, four places.
  assert.equal(chasePrice("sell", { bid: 0.5123, last: 0.513 }), 0.5123);
  assert.equal(chasePrice("sell", {}), null);
});
