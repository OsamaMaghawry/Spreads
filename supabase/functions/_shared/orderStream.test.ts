import test from "node:test";
import assert from "node:assert/strict";
import { streamAuth, orderUpdate } from "./orderStream.ts";

test("the trading stream is signed in to with the OAuth token first, else the key pair", () => {
  assert.deepEqual(streamAuth({ token: "t", key: "k", secret: "s" }), { action: "authenticate", data: { oauth_token: "t" } });
  assert.deepEqual(streamAuth({ key: "k", secret: "s" }), { action: "authenticate", data: { key_id: "k", secret_key: "s" } });
  assert.equal(streamAuth({ key: "k" }), null);
});

test("a trade update as the terminal reads it", () => {
  const m = {
    stream: "trade_updates",
    data: { event: "fill", timestamp: "2026-10-27T18:33:20.852Z", price: "14.47", qty: "1",
      order: { id: "o1", symbol: "AIOK", side: "sell", status: "filled", qty: "1", filled_qty: "1", filled_avg_price: "14.47", limit_price: null } }
  };
  assert.deepEqual(orderUpdate(m), {
    type: "order", event: "fill", id: "o1", symbol: "AIOK", side: "sell", status: "filled", qty: 1, filled: 1, avgPrice: 14.47, limit: null, at: "2026-10-27T18:33:20.852Z"
  });
  assert.equal(orderUpdate({ stream: "listening", data: {} }), null);
  assert.equal(orderUpdate({ stream: "trade_updates", data: { event: "fill" } }), null);
});

test("a price change names the order that took its place", () => {
  const m = {
    stream: "trade_updates",
    data: { event: "replaced", timestamp: "2026-11-17T17:23:18.770Z",
      order: { id: "old", symbol: "TQQQ", side: "buy", status: "replaced", qty: "61", filled_qty: "0", filled_avg_price: null, limit_price: "51.53", replaced_by: "new" } }
  };
  assert.equal(orderUpdate(m)?.replacedBy, "new");
  assert.equal(orderUpdate(m)?.status, "replaced");
});
