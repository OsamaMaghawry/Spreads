import test from "node:test";
import assert from "node:assert/strict";
import { cryptoOrderBody, cryptoSymbol, isCrypto, onStep, decimalsOf } from "./cryptoOrder.ts";

const BTC = { symbol: "BTC/USD", minOrderSize: 0.0001, minTradeIncrement: 0.000000001, priceIncrement: 1 };
const base = { symbol: "BTC/USD", side: "buy" as const, qty: 0.0125, type: "limit" as const, limitPrice: 80123.4 };

test("crypto symbols: the slashed pair, and positions' unslashed form mapped to it", () => {
  assert.equal(isCrypto("BTC/USD"), true);
  assert.equal(isCrypto("AAPL"), false);
  assert.equal(cryptoSymbol("BTCUSD"), "BTC/USD");
  assert.equal(cryptoSymbol("ETHUSDT"), "ETH/USDT");
  assert.equal(cryptoSymbol("ETHBTC"), "ETH/BTC");
  assert.equal(cryptoSymbol("eth/usd"), "ETH/USD");
});

test("steps: quantity rounds down, price to the nearest step, as decimal strings", () => {
  assert.equal(decimalsOf(0.000000001), 9);
  assert.equal(decimalsOf(1), 0);
  assert.equal(onStep(0.0125000009, 0.000000001, "down"), "0.012500000");
  assert.equal(onStep(0.3, 0.1, "down"), "0.3");
  assert.equal(onStep(80123.6, 1, "nearest"), "80124");
  assert.equal(onStep(0.000012345, 0.00000001, "nearest"), "0.00001235");
});

test("a limit buy: GTC by default, price on the coin's step", () => {
  const r = cryptoOrderBody(base, "T1", BTC) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {
    symbol: "BTC/USD", side: "buy", qty: "0.012500000", type: "limit", time_in_force: "gtc", client_order_id: "T1", limit_price: "80123"
  });
  assert.equal((cryptoOrderBody({ ...base, timeInForce: "ioc" }, "T", BTC) as any).body.time_in_force, "ioc");
});

test("refusals in words: no stop orders, below the minimum, short sales, unknown pair", () => {
  const why = (i: any, held = 0, asset: any = BTC) => (cryptoOrderBody(i, "T", asset, held) as any).reason;
  assert.match(why({ ...base, type: "stop" }), /market, limit or stop-limit/);
  assert.match(why({ ...base, qty: 0.00005 }), /smallest BTC\/USD order is 0.0001/);
  assert.match(why({ ...base, side: "sell", qty: 0.5 }, 0.1), /hold 0.1 BTC; crypto cannot be sold short/);
  assert.match(why({ ...base, side: "sell" }), /hold no BTC/);
  assert.match(why(base, 0, null), /not tradable/);
  assert.match(why({ ...base, symbol: "AAPL" }), /crypto pair/);
  assert.match(why({ ...base, type: "stop_limit", stopPrice: null }), /stop price/);
  // Selling exactly what is held is allowed.
  assert.equal((cryptoOrderBody({ ...base, side: "sell", qty: 0.1 }, "T", BTC, 0.1) as any).ok, true);
});

test("a dollar amount: market only, at least $1, no short sale", () => {
  const r = cryptoOrderBody({ symbol: "BTC/USD", side: "buy", type: "market", notional: 25 }, "T", BTC) as any;
  assert.deepEqual(r.body, { symbol: "BTC/USD", side: "buy", notional: "25.00", type: "market", time_in_force: "gtc", client_order_id: "T" });
  const why = (i: any, held = 0) => (cryptoOrderBody({ symbol: "BTC/USD", side: "buy", type: "market", ...i }, "T", BTC, held) as any).reason;
  assert.match(why({ notional: 0.2 }), /at least \$1/);
  assert.match(why({ notional: 20, type: "limit", limitPrice: 1 }), /market order/);
  assert.match(why({ notional: 20, side: "sell" }), /hold no BTC/);
  assert.equal((cryptoOrderBody({ symbol: "BTC/USD", side: "sell", type: "market", notional: 20 }, "T", BTC, 0.01) as any).ok, true);
});
