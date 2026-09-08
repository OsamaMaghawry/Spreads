import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadLegs, legLabel, needsExplicitLegs } from "./spreadLegs.js";

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

test("a call ratio sends both legs with their real counts", () => {
  // The one function that already got the ratio right, and the one with no
  // test for it. Everything else in the close path spoke putRatio/callRatio,
  // so a 1x2 was quoted and ORDERED as 1x1 — buy one short back, sell the
  // long, report "filled", leave a short call open. This pins the shape the
  // whole-position path now routes through.
  const ratio = {
    type: "call_ratio_spread",
    qty: 1,
    longRatio: 1,
    shortRatio: 2,
    shortSymbol: "TSLA260918C00362500",
    longSymbol: "TSLA260918C00352500",
    shortStrike: 362.5,
    longStrike: 352.5
  };
  const legs = spreadLegs(ratio);
  assert.equal(legs.length, 2);

  const short = legs.find((l) => l.side === "short");
  const long = legs.find((l) => l.side === "long");
  assert.equal(short.ratio, 2, "two short calls per unit, not one");
  assert.equal(short.action, "buy_to_close");
  assert.equal(short.symbol, "TSLA260918C00362500");
  assert.equal(long.ratio, 1);
  assert.equal(long.action, "sell_to_close");
  assert.equal(long.symbol, "TSLA260918C00352500");
});

test("a ratio with no ratios stated closes one for one rather than throwing", () => {
  const legs = spreadLegs({
    type: "call_ratio_spread", qty: 1,
    shortSymbol: "X", longSymbol: "Y", shortStrike: 2, longStrike: 1
  });
  assert.deepEqual(legs.map((l) => l.ratio), [1, 1]);
});

test("the paired wire is refused for exactly the structures it cannot describe", () => {
  // The routing decision that stops a 1x2 being quoted and ordered as a 1x1.
  // shortSymbol/longSymbol/putRatio carries ONE ratio for both legs, so any
  // structure whose two sides differ has to go as explicit legs.
  assert.equal(needsExplicitLegs({ type: "call_ratio_spread" }), true);
  assert.equal(needsExplicitLegs({ single: true, type: "covered_call" }), true);
  assert.equal(needsExplicitLegs({ single: true, shares: true, type: "shares" }), true);
  // And left alone for the ones it describes correctly, which have their own
  // tested path and must not be rerouted by this change.
  assert.equal(needsExplicitLegs({ type: "put_spread" }), false);
  assert.equal(needsExplicitLegs({ type: "call_spread" }), false);
  assert.equal(needsExplicitLegs({ type: "call_spread", direction: "debit" }), false);
  assert.equal(needsExplicitLegs({ type: "iron_condor", putRatio: 2, callRatio: 1 }), false);
});
