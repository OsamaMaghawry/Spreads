import { test } from "node:test";
import assert from "node:assert/strict";
import { tradierBase, oneOrMany, unwrap, tradierSide, tradierOrderForm } from "./tradier.ts";

// ---------------------------------------------------------------------------
// Paper and live
// ---------------------------------------------------------------------------

test("paper and live are different hosts on the same API", () => {
  // The reason this broker was chosen. If these ever collapse to one host,
  // every paper test in this product has silently become a live one.
  assert.equal(tradierBase(true), "https://sandbox.tradier.com/v1");
  assert.equal(tradierBase(false), "https://api.tradier.com/v1");
  assert.notEqual(tradierBase(true), tradierBase(false));
});

// ---------------------------------------------------------------------------
// The single-element collapse
// ---------------------------------------------------------------------------

test("one position arrives as an object and is still a list", () => {
  // Their API collapses a one-element array into the element. An account
  // holding exactly one position is the account most likely to be somebody's
  // first, and code expecting an array sees nothing there.
  assert.deepEqual(oneOrMany({ symbol: "SPY" }), [{ symbol: "SPY" }]);
  assert.deepEqual(oneOrMany([{ symbol: "SPY" }, { symbol: "QQQ" }]), [
    { symbol: "SPY" },
    { symbol: "QQQ" }
  ]);
});

test("their empty collection is the STRING null, and reads as empty", () => {
  assert.deepEqual(oneOrMany("null"), []);
  assert.deepEqual(oneOrMany(null), []);
  assert.deepEqual(oneOrMany(undefined), []);
});

test("unwrap handles every shape their envelope takes", () => {
  assert.deepEqual(unwrap({ positions: { position: { symbol: "SPY" } } }, "positions", "position"), [
    { symbol: "SPY" }
  ]);
  assert.deepEqual(
    unwrap({ positions: { position: [{ symbol: "SPY" }, { symbol: "QQQ" }] } }, "positions", "position"),
    [{ symbol: "SPY" }, { symbol: "QQQ" }]
  );
  assert.deepEqual(unwrap({ positions: "null" }, "positions", "position"), []);
  assert.deepEqual(unwrap({}, "positions", "position"), []);
  assert.deepEqual(unwrap(null, "positions", "position"), []);
});

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

test("their side carries open or close, which ours does not", () => {
  // A wrong guess here does not error. It closes a position the user meant to
  // open, which is why the caller must state it.
  assert.equal(tradierSide("sell", "open"), "sell_to_open");
  assert.equal(tradierSide("buy", "open"), "buy_to_open");
  assert.equal(tradierSide("buy", "close"), "buy_to_close");
  assert.equal(tradierSide("sell", "close"), "sell_to_close");
});

// ---------------------------------------------------------------------------
// The order form
// ---------------------------------------------------------------------------

// A put credit spread: sell the 370, buy the 365, for $1.25 of credit. In this
// product's vocabulary that is a limit price of -1.25.
const PUT_SPREAD = {
  ticker: "TSLA",
  qty: 1,
  limitPrice: -1.25,
  intent: "open" as const,
  legs: [
    { symbol: "TSLA260918P00370000", side: "sell" as const, ratio: 1 },
    { symbol: "TSLA260918P00365000", side: "buy" as const, ratio: 1 }
  ]
};

test("a credit spread becomes type=credit with a POSITIVE price", () => {
  // THE BUG THIS EXISTS TO PREVENT. Our negative price means credit; theirs
  // is always positive with the direction in a separate word. Passing our
  // sign through does not error -- it places a plausible order in the wrong
  // direction.
  const f = tradierOrderForm(PUT_SPREAD);
  assert.equal(f.class, "multileg");
  assert.equal(f.type, "credit");
  assert.equal(f.price, "1.25");
  assert.ok(!f.price.startsWith("-"));
  assert.equal(f.symbol, "TSLA");
  assert.equal(f.duration, "day");
});

test("each leg is an indexed parameter, with the intent on the side", () => {
  const f = tradierOrderForm(PUT_SPREAD);
  assert.equal(f["option_symbol[0]"], "TSLA260918P00370000");
  assert.equal(f["side[0]"], "sell_to_open");
  assert.equal(f["quantity[0]"], "1");
  assert.equal(f["option_symbol[1]"], "TSLA260918P00365000");
  assert.equal(f["side[1]"], "buy_to_open");
  assert.equal(f["quantity[1]"], "1");
});

test("a debit is the same form with the other word", () => {
  const f = tradierOrderForm({ ...PUT_SPREAD, limitPrice: 2.4 });
  assert.equal(f.type, "debit");
  assert.equal(f.price, "2.40");
});

test("a zero net is even, and carries no price at all", () => {
  // They reject a credit of nothing; "even" is the word for it.
  const f = tradierOrderForm({ ...PUT_SPREAD, limitPrice: 0 });
  assert.equal(f.type, "even");
  assert.equal(f.price, undefined);
});

test("no limit price is a market order, with no direction word", () => {
  const f = tradierOrderForm({ ...PUT_SPREAD, limitPrice: null });
  assert.equal(f.type, "market");
  assert.equal(f.price, undefined);
});

test("quantity multiplies the structure, not the legs", () => {
  // Two spreads is two of each leg. A ratio of 2 on one leg and 1 on the
  // other, times 3 structures, is 6 and 3.
  const f = tradierOrderForm({ ...PUT_SPREAD, qty: 2 });
  assert.equal(f["quantity[0]"], "2");
  assert.equal(f["quantity[1]"], "2");

  const ratioed = tradierOrderForm({
    ...PUT_SPREAD,
    qty: 3,
    legs: [
      { symbol: "A", side: "sell", ratio: 2 },
      { symbol: "B", side: "buy", ratio: 1 }
    ]
  });
  assert.equal(ratioed["quantity[0]"], "6");
  assert.equal(ratioed["quantity[1]"], "3");
});

test("an iron condor is four indexed legs", () => {
  const f = tradierOrderForm({
    ticker: "SPY",
    qty: 1,
    limitPrice: -2,
    intent: "open",
    legs: [
      { symbol: "SPY_P_SHORT", side: "sell", ratio: 1 },
      { symbol: "SPY_P_LONG", side: "buy", ratio: 1 },
      { symbol: "SPY_C_SHORT", side: "sell", ratio: 1 },
      { symbol: "SPY_C_LONG", side: "buy", ratio: 1 }
    ]
  });
  assert.equal(f["option_symbol[3]"], "SPY_C_LONG");
  assert.equal(f["side[3]"], "buy_to_open");
  assert.equal(f.type, "credit");
  assert.equal(f.price, "2.00");
});

test("closing takes the CLOSING sides from the caller and adds the intent", () => {
  // THE CONTRACT, and it caught me writing this test wrong first. `side` is
  // what this order DOES to the leg, not what the leg is in the structure.
  // Closing the credit spread above means buying back the short and selling
  // the long, so the caller passes those sides -- the helper does not flip
  // them, because a helper that guessed would be guessing about which
  // direction real money moves.
  const f = tradierOrderForm({
    ...PUT_SPREAD,
    intent: "close",
    limitPrice: 0.4,
    legs: [
      { symbol: "TSLA260918P00370000", side: "buy", ratio: 1 },
      { symbol: "TSLA260918P00365000", side: "sell", ratio: 1 }
    ]
  });
  assert.equal(f["side[0]"], "buy_to_close");
  assert.equal(f["side[1]"], "sell_to_close");
  // Buying a credit spread back is a DEBIT, and the caller's sign says so --
  // the helper must not infer direction from the intent.
  assert.equal(f.type, "debit");
  assert.equal(f.price, "0.40");
});

test("the helper never flips a side for you", () => {
  // Passing opening sides with a closing intent produces sell_to_close, which
  // is a real order and the wrong one. Stated as a test so nobody later
  // "fixes" this into an inference.
  const f = tradierOrderForm({ ...PUT_SPREAD, intent: "close", limitPrice: 0.4 });
  assert.equal(f["side[0]"], "sell_to_close");
});

test("one leg is an option order, not a multileg one", () => {
  // Same distinction the existing broker path draws. `type=credit` does not
  // exist for a single option on their side.
  const f = tradierOrderForm({
    ticker: "TSLA",
    qty: 2,
    limitPrice: -1.1,
    intent: "open",
    legs: [{ symbol: "TSLA260918P00370000", side: "sell", ratio: 1 }]
  });
  assert.equal(f.class, "option");
  assert.equal(f.type, "limit");
  assert.equal(f.price, "1.10");
  assert.equal(f.side, "sell_to_open");
  assert.equal(f.quantity, "2");
  assert.equal(f.option_symbol, "TSLA260918P00370000");
  // Not the indexed form.
  assert.equal(f["option_symbol[0]"], undefined);
});

test("preview is opt-in and says so in the form", () => {
  assert.equal(tradierOrderForm(PUT_SPREAD).preview, undefined);
  assert.equal(tradierOrderForm({ ...PUT_SPREAD, preview: true }).preview, "true");
});

test("time in force travels, and defaults to the day", () => {
  assert.equal(tradierOrderForm(PUT_SPREAD).duration, "day");
  assert.equal(tradierOrderForm({ ...PUT_SPREAD, tif: "gtc" }).duration, "gtc");
});

test("a price is rounded to the cent they accept", () => {
  assert.equal(tradierOrderForm({ ...PUT_SPREAD, limitPrice: -1.2349 }).price, "1.23");
  assert.equal(tradierOrderForm({ ...PUT_SPREAD, limitPrice: -1.005 }).price, "1.01");
});

test("an order with no legs, no ticker or no quantity is refused here", () => {
  // Refused where it is cheap, rather than by the broker after a round trip.
  assert.throws(() => tradierOrderForm({ ...PUT_SPREAD, legs: [] }), /at least one leg/);
  assert.throws(() => tradierOrderForm({ ...PUT_SPREAD, ticker: "" }), /underlying/);
  assert.throws(() => tradierOrderForm({ ...PUT_SPREAD, qty: 0 }), /positive quantity/);
  assert.throws(() => tradierOrderForm({ ...PUT_SPREAD, qty: -1 }), /positive quantity/);
});
