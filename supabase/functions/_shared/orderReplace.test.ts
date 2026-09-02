import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceBody } from "./orderReplace.ts";

test("a multi-leg credit order keeps its negative limit on replace", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "-0.85" }, limitPrice: 0.9 });
  assert.deepEqual(body, { limit_price: "-0.9" });
});

test("a single option order keeps a positive limit", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "1.20" }, limitPrice: 1.15 });
  assert.deepEqual(body, { limit_price: "1.15" });
});

test("the caller's sign is ignored -- the broker's convention wins", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "-0.85" }, limitPrice: -0.7 });
  assert.equal(body, null, "a negative price from the client is refused, not re-signed");
});

test("quantity travels as an integer string", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "0.5" }, limitPrice: 0.55, qty: 2 });
  assert.deepEqual(body, { limit_price: "0.55", qty: "2" });
});

test("nothing to change, a market order, or a bad number is refused", () => {
  assert.equal(replaceBody({ order: { type: "limit", limit_price: "0.5" } }), null);
  assert.equal(replaceBody({ order: { type: "market" }, limitPrice: 0.5 }), null);
  assert.equal(replaceBody({ order: { type: "limit", limit_price: "0.5" }, limitPrice: "abc" }), null);
  assert.equal(replaceBody({ order: { type: "limit", limit_price: "0.5" }, qty: 1.5 }), null);
  assert.equal(replaceBody({ order: null, limitPrice: 0.5 }), null);
});

test("prices are rounded to the cent", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "0.5" }, limitPrice: 0.1 + 0.2 });
  assert.deepEqual(body, { limit_price: "0.3" });
});
