import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadLegs, legLabel } from "./spreadLegs.js";

// A single position has one symbol. Run through the pairing below and it emits
// a second leg with symbol: null — which the broker rejects and the leg picker
// draws as an empty row. This is the close path for every wheel position.

const single = (side, kind, symbol, strike) => ({
  single: true,
  type: side === "short" ? "naked_call" : "long_option",
  legs: [{ symbol, side, kind, strike, ratio: 1 }]
});

test("a short single leg closes by buying it back", () => {
  const legs = spreadLegs(single("short", "call", "AMD260918C00470000", 470));
  assert.equal(legs.length, 1, "never a null second leg");
  assert.equal(legs[0].symbol, "AMD260918C00470000");
  assert.equal(legs[0].action, "buy_to_close");
  assert.equal(legs[0].ratio, 1);
});

test("a long single leg closes by selling it", () => {
  const legs = spreadLegs(single("long", "put", "AMD260918P00460000", 460));
  assert.equal(legs[0].action, "sell_to_close");
});

test("shares have no option legs to close", () => {
  assert.deepEqual(spreadLegs({ single: true, shares: true, legs: [] }), []);
});

test("a put vertical still yields both legs, unchanged", () => {
  const legs = spreadLegs({
    type: "put_spread", shortSymbol: "S", longSymbol: "L", shortStrike: 465, longStrike: 460
  });
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map((l) => l.action), ["buy_to_close", "sell_to_close"]);
  assert.ok(legs.every((l) => l.symbol));
});

test("an iron condor still yields four legs with its ratios", () => {
  const legs = spreadLegs({
    type: "put_spread",
    shortSymbol: "PS", longSymbol: "PL", callShortSymbol: "CS", callLongSymbol: "CL",
    putRatio: 2, callRatio: 1
  });
  assert.equal(legs.length, 4);
  assert.deepEqual(legs.map((l) => l.ratio), [2, 2, 1, 1]);
});

// Held shares are a closable position. This returned [] until 4 Sep, so the
// close ticket sent closeSpread a request with neither legs nor symbols and got
// "Missing required parameters" — an assigned lot could be seen and not sold.
test("a long share lot yields one equity leg, sold to close", () => {
  const legs = spreadLegs({
    single: true, shares: true, type: "shares",
    longSymbol: "SH", shareQty: 1000, qty: 1000
  });
  assert.equal(legs.length, 1);
  assert.equal(legs[0].symbol, "SH");
  assert.equal(legs[0].qty, 1000);
  assert.equal(legs[0].action, "sell_to_close");
  // The server reads this to pick the stocks quote endpoint and to build a
  // plain equity order rather than an option one.
  assert.equal(legs[0].assetClass, "equity");
  assert.equal(legs[0].strike, null);
});

test("a short share lot is bought back, not sold again", () => {
  const legs = spreadLegs({
    single: true, shares: true, type: "shares",
    longSymbol: "SH", shareQty: -400, qty: 400
  });
  assert.equal(legs[0].action, "buy_to_close");
  assert.equal(legs[0].side, "short");
  assert.equal(legs[0].qty, 400, "quantity is always positive; direction is the action");
});

test("a share lot with no symbol or no quantity yields nothing to close", () => {
  assert.deepEqual(spreadLegs({ single: true, shares: true, longSymbol: null, shareQty: 100 }), []);
  assert.deepEqual(spreadLegs({ single: true, shares: true, longSymbol: "SH", shareQty: 0, qty: 0 }), []);
});

test("legLabel names shares without inventing a strike", () => {
  const [leg] = spreadLegs({ single: true, shares: true, longSymbol: "SH", shareQty: 1000, qty: 1000 });
  assert.equal(legLabel(leg), "1000 shares");
  assert.ok(!legLabel(leg).includes("null"));
});
