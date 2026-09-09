import test from "node:test";
import assert from "node:assert/strict";
import { twoSided, midOf, quotesRefusal } from "./quoteSanity.ts";

test("the SPY quote that priced a sale at half the bid", () => {
  // The live one, from the close ticket on 9 Sep: bid $746.01, no ask.
  const spy = { bp: 746.01, ap: 0 };
  assert.equal(twoSided(spy), false);
  assert.equal(midOf(spy), null, "there is no middle of a one-sided market");
  // What the old arithmetic produced, kept here so the number is on the record.
  assert.equal((746.01 + 0) / 2, 373.005);
  assert.match(String(quotesRefusal(["SPY"], { SPY: spy })), /no offer/);
  assert.match(String(quotesRefusal(["SPY"], { SPY: spy })), /746\.01/, "it must say what the bid was");
});

test("an ordinary market prices", () => {
  assert.equal(twoSided({ bp: 1.2, ap: 1.4 }), true);
  assert.ok(Math.abs((midOf({ bp: 1.2, ap: 1.4 }) as number) - 1.3) < 1e-9);
  assert.equal(quotesRefusal(["X"], { X: { bp: 1.2, ap: 1.4 } }), null);
});

test("a zero BID is a real market and must stay closable", () => {
  // A deep out-of-the-money contract nobody wants. This is exactly the position
  // a trader most needs to be able to close, so the rule must not refuse it.
  assert.equal(twoSided({ bp: 0, ap: 0.05 }), true);
  assert.equal(midOf({ bp: 0, ap: 0.05 }), 0.025);
  assert.equal(quotesRefusal(["X"], { X: { bp: 0, ap: 0.05 } }), null);
});

test("a crossed book is stale data, and says so", () => {
  assert.equal(twoSided({ bp: 2, ap: 1 }), false);
  assert.match(String(quotesRefusal(["X"], { X: { bp: 2, ap: 1 } })), /crossed/);
});

test("absent, null and non-numeric quotes are all refused", () => {
  assert.equal(twoSided(null), false);
  assert.equal(twoSided(undefined), false);
  assert.equal(twoSided({}), false);
  assert.equal(twoSided({ bp: null, ap: null }), false);
  assert.equal(twoSided({ bp: 1, ap: "x" as any }), false);
  assert.match(String(quotesRefusal(["X"], {})), /No quote for X/);
});

test("one dead leg refuses the whole structure, and names it", () => {
  const quotes = {
    A: { bp: 1, ap: 1.1 },
    B: { bp: 2, ap: 2.2 },
    C: { bp: 3, ap: 0 },
    D: { bp: 4, ap: 4.4 }
  };
  const why = quotesRefusal(["A", "B", "C", "D"], quotes);
  assert.match(String(why), /^C /, "the trader needs to know WHICH leg");
  // The point of refusing rather than pricing off the three that work.
  assert.equal(quotesRefusal(["A", "B", "D"], quotes), null);
});

test("both sides zero is not a free contract", () => {
  assert.equal(twoSided({ bp: 0, ap: 0 }), false);
  assert.equal(midOf({ bp: 0, ap: 0 }), null);
});
