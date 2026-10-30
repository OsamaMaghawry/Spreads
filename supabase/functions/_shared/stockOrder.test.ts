import test from "node:test";
import assert from "node:assert/strict";
import { stockOrderBody, orderValue } from "./stockOrder.ts";

const base = { symbol: "aapl", side: "buy" as const, qty: 10, type: "limit" as const, limitPrice: 344.5 };

test("a limit buy: the broker's fields, upper-cased symbol, two decimals", () => {
  const r = stockOrderBody(base, "T1");
  assert.equal(r.ok, true);
  assert.deepEqual((r as any).body, {
    symbol: "AAPL", side: "buy", qty: "10", type: "limit", time_in_force: "day", client_order_id: "T1", limit_price: "344.50"
  });
});

test("market, stop and stop-limit carry only their own prices", () => {
  const m = stockOrderBody({ ...base, type: "market", limitPrice: 1 }, "T") as any;
  assert.equal(m.body.limit_price, undefined);
  const s = stockOrderBody({ ...base, type: "stop", stopPrice: 330 }, "T") as any;
  assert.deepEqual([s.body.stop_price, s.body.limit_price], ["330.00", undefined]);
  const sl = stockOrderBody({ ...base, type: "stop_limit", stopPrice: 330, limitPrice: 329.5, timeInForce: "gtc" }, "T") as any;
  assert.deepEqual([sl.body.stop_price, sl.body.limit_price, sl.body.time_in_force], ["330.00", "329.50", "gtc"]);
  // Under a dollar, four decimals.
  assert.equal((stockOrderBody({ ...base, limitPrice: 0.12345 }, "T") as any).body.limit_price, "0.1235");
});

test("refusals in words: missing prices, fractions, a bad symbol", () => {
  const why = (i: any) => (stockOrderBody(i, "T") as any).reason;
  assert.match(why({ ...base, limitPrice: null }), /limit price/);
  assert.match(why({ ...base, type: "stop", limitPrice: null }), /stop price/);
  assert.match(why({ ...base, qty: 2.5, timeInForce: "gtc" }), /for the day only/);
  assert.match(why({ ...base, qty: 0 }), /how many shares/);
  assert.match(why({ ...base, symbol: "not a symbol" }), /symbol/);
});

test("extended hours: a day limit only", () => {
  assert.equal((stockOrderBody({ ...base, extendedHours: true }, "T") as any).body.extended_hours, true);
  assert.match((stockOrderBody({ ...base, type: "market", extendedHours: true }, "T") as any).reason, /limit orders for the day/);
});

test("bracket: both exits, on the right sides of the entry", () => {
  const ok = stockOrderBody({ ...base, takeProfit: 360, stopLoss: 335 }, "T") as any;
  assert.equal(ok.body.order_class, "bracket");
  assert.deepEqual(ok.body.take_profit, { limit_price: "360.00" });
  // The stop a stop-limit, 2% under for a buy's exit (positionTools stopLimitPrice).
  assert.deepEqual(ok.body.stop_loss, { stop_price: "335.00", limit_price: "328.30" });
  const why = (i: any) => (stockOrderBody(i, "T") as any).reason;
  assert.match(why({ ...base, takeProfit: 360 }), /enter both/);
  assert.match(why({ ...base, takeProfit: 340, stopLoss: 335 }), /take-profit must be above 344\.50/);
  // A short: profit below, protection above.
  assert.equal((stockOrderBody({ ...base, side: "sell", takeProfit: 330, stopLoss: 350 }, "T") as any).ok, true);
  assert.match(why({ ...base, side: "sell", takeProfit: 350, stopLoss: 330 }), /For a sell/);
  // A market entry is judged against the quote it would trade at.
  assert.equal((stockOrderBody({ ...base, type: "market", reference: 344, takeProfit: 360, stopLoss: 335 }, "T") as any).ok, true);
  assert.match(why({ ...base, type: "market", takeProfit: 360, stopLoss: 335 }), /No current price/);
  assert.match(why({ ...base, type: "stop", stopPrice: 340, takeProfit: 360, stopLoss: 335 }), /market or limit entry/);
});

test("value: at the limit, or at the side of the quote a market order would take", () => {
  assert.deepEqual(orderValue(base, {}), { price: 344.5, value: 3445 });
  assert.deepEqual(orderValue({ ...base, type: "market" }, { bid: 343.9, ask: 344.1 }), { price: 344.1, value: 3441 });
  assert.deepEqual(orderValue({ ...base, type: "market", side: "sell" }, { bid: 343.9, ask: 344.1 }), { price: 343.9, value: 3439 });
  assert.equal(orderValue({ ...base, type: "market" }, {}), null);
});

test("a dollar amount: a market order for the day, no quantity, at least $1", () => {
  const r = stockOrderBody({ symbol: "aapl", side: "buy", type: "market", notional: 250 }, "T") as any;
  assert.deepEqual(r.body, { symbol: "AAPL", side: "buy", notional: "250.00", type: "market", time_in_force: "day", client_order_id: "T" });
  const why = (i: any) => (stockOrderBody({ symbol: "AAPL", side: "buy", type: "market", ...i }, "T") as any).reason;
  assert.match(why({ notional: 0.5 }), /at least \$1/);
  assert.match(why({ notional: 100, type: "limit", limitPrice: 10 }), /market order/);
  assert.match(why({ notional: 100, timeInForce: "gtc" }), /for the day/);
  assert.match(why({ notional: 100, takeProfit: 2, stopLoss: 1 }), /share quantity/);
});

test("part of a share: for the day, no bracket, no trailing stop", () => {
  const r = stockOrderBody({ ...base, type: "stop", stopPrice: 330, qty: 2.534 }, "T") as any;
  assert.deepEqual([r.body.qty, r.body.time_in_force, r.body.stop_price], ["2.534", "day", "330.00"]);
  const why = (i: any) => (stockOrderBody(i, "T") as any).reason;
  // Before the open and after the close as a day limit, as Alpaca now takes it (28 Oct).
  const ext = stockOrderBody({ ...base, qty: 2.5, extendedHours: true }, "T") as any;
  assert.deepEqual([ext.ok, ext.body.qty, ext.body.extended_hours, ext.body.type, ext.body.time_in_force], [true, "2.5", true, "limit", "day"]);
  assert.match(why({ ...base, type: "market", qty: 2.5, extendedHours: true }), /limit orders for the day/);
  assert.match(why({ ...base, qty: 2.5, takeProfit: 360, stopLoss: 335 }), /whole shares/);
  assert.match(why({ ...base, type: "trailing_stop", trailPercent: 2, qty: 2.5 }), /whole shares/);
});

test("a trailing stop: by a percentage or by dollars, one of them", () => {
  const pct = stockOrderBody({ ...base, side: "sell", type: "trailing_stop", trailPercent: 2.5, timeInForce: "gtc" }, "T") as any;
  assert.deepEqual([pct.body.type, pct.body.trail_percent, pct.body.trail_price, pct.body.time_in_force], ["trailing_stop", "2.5", undefined, "gtc"]);
  const usd = stockOrderBody({ ...base, side: "sell", type: "trailing_stop", trailPrice: 1.5 }, "T") as any;
  assert.equal(usd.body.trail_price, "1.50");
  const why = (i: any) => (stockOrderBody(i, "T") as any).reason;
  assert.match(why({ ...base, type: "trailing_stop" }), /enter one/);
  assert.match(why({ ...base, type: "trailing_stop", trailPercent: 2, trailPrice: 1 }), /enter one/);
  assert.match(why({ ...base, type: "trailing_stop", trailPercent: 150 }), /less than 100%/);
});
