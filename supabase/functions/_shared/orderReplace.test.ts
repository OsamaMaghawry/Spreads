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
  // No asset class and no symbol: nothing establishes that a fraction is
  // legal here, so it is refused. See `tradesFractions`.
  assert.equal(replaceBody({ order: { type: "limit", limit_price: "0.5" }, qty: 1.5 }), null);
  assert.equal(replaceBody({ order: null, limitPrice: 0.5 }), null);
});

test("prices are rounded to the cent", () => {
  const body = replaceBody({ order: { type: "limit", limit_price: "0.5" }, limitPrice: 0.1 + 0.2 });
  assert.deepEqual(body, { limit_price: "0.3" });
});

// ---------------------------------------------------------------------------
// A fraction is valid on shares.
//
// The owner, trying to resize a working SPY sell to his actual holding:
// *"In all cases it doesn't accept the fractional order."* This module refused
// every non-integer quantity, because the check was written when only
// CONTRACTS could be resized. The moment the quantity field reached share
// orders, the exact holding a trader wanted to close came back "a whole-number
// quantity is required" -- and a share count is fractional far more often than
// not once a position has been added to over time.
// ---------------------------------------------------------------------------

test("a fractional share quantity is accepted and keeps its nine places", () => {
  const body = replaceBody({
    order: { limit_price: "765.00", type: "limit", qty: "13", asset_class: "us_equity", symbol: "SPY" },
    limitPrice: 765,
    qty: 13.000080555
  });
  assert.equal(body?.qty, "13.000080555");
});

test("a fractional CONTRACT quantity is still refused", () => {
  // Options do not split. Sending 1.5 contracts is a mistake, not a preference.
  assert.equal(
    replaceBody({
      order: { limit_price: "2.49", type: "limit", qty: "2", asset_class: "us_option", symbol: "TSLA251217P00320000" },
      limitPrice: 2.49,
      qty: 1.5
    }),
    null
  );
  // ...and a whole one still works.
  assert.equal(
    replaceBody({
      order: { limit_price: "2.49", type: "limit", qty: "2", asset_class: "us_option", symbol: "TSLA251217P00320000" },
      limitPrice: 2.49,
      qty: 1
    })?.qty,
    "1"
  );
});

test("with no asset_class, the symbol decides", () => {
  // A broker payload that omits the field: an OCC symbol is a contract,
  // anything else trades in shares.
  assert.equal(
    replaceBody({ order: { limit_price: "1", type: "limit", symbol: "TSLA251217P00320000" }, qty: 1.5 }),
    null
  );
  assert.equal(
    replaceBody({ order: { limit_price: "1", type: "limit", symbol: "SPY" }, qty: 1.5 })?.qty,
    "1.5"
  );
});

test("a zero or negative quantity is refused whatever it trades in", () => {
  for (const q of [0, -1, -0.5]) {
    assert.equal(
      replaceBody({ order: { limit_price: "1", type: "limit", symbol: "SPY" }, qty: q }),
      null,
      `${q} should be refused`
    );
  }
});


test("a sub-millionth quantity never goes out as an exponent", () => {
  // `String(Number(n))` prints "1e-7" below a millionth. A share residue after
  // a partial close is routinely that small, and an exponent on the wire is a
  // quantity the broker may reject or misread.
  for (const q of [1e-7, 8.18e-7, 1e-9, 0.000055585]) {
    const body = replaceBody({
      order: { limit_price: "1", type: "limit", asset_class: "us_equity", symbol: "IVV" },
      qty: q
    });
    assert.ok(body?.qty, `${q} produced no quantity`);
    assert.ok(!/e/i.test(body!.qty), `${q} went out as ${body!.qty}`);
  }
  assert.equal(
    replaceBody({ order: { limit_price: "1", type: "limit", asset_class: "us_equity", symbol: "IVV" }, qty: 8.18e-7 })?.qty,
    "0.000000818"
  );
});
