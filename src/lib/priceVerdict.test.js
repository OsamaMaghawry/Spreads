import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictFor, netQuote, markPosition } from "./priceVerdict.js";

// The bug this file exists to stop: the close ticket's verdict logic was inline
// in a component, so nothing executed it outside a browser. Two of today's
// production incidents were exactly that shape.

test("a null price is unjudgeable, not a guess", () => {
  assert.equal(verdictFor({ price: null, bid: 0.29, ask: 0.37 }), null);
  assert.equal(markPosition({ price: null, bid: 0.29, ask: 0.37 }), null);
});

test("no quote means no verdict", () => {
  assert.equal(verdictFor({ price: 0.33, bid: null, ask: null }), null);
  assert.equal(verdictFor({ price: 0.33, bid: 0.4, ask: 0.3 }), null, "a crossed quote is not a quote");
});

test("paying a debit: higher crosses", () => {
  const q = { bid: 0.29, ask: 0.37, side: "debit" };
  assert.equal(verdictFor({ ...q, price: 0.37 }).state, "marketable");
  assert.equal(verdictFor({ ...q, price: 0.4 }).state, "marketable");
  assert.equal(verdictFor({ ...q, price: 0.33 }).state, "resting");
  assert.equal(verdictFor({ ...q, price: 0.29 }).state, "unlikely");
  assert.equal(verdictFor({ ...q, price: 0.1 }).state, "unlikely");
});

test("asking a credit: LOWER crosses — the direction that inverts", () => {
  const q = { bid: 0.55, ask: 0.63, side: "credit" };
  assert.equal(verdictFor({ ...q, price: 0.55 }).state, "marketable");
  assert.equal(verdictFor({ ...q, price: 0.4 }).state, "marketable", "asking less than the bid fills");
  assert.equal(verdictFor({ ...q, price: 0.59 }).state, "resting");
  assert.equal(verdictFor({ ...q, price: 0.63 }).state, "unlikely");
  assert.equal(verdictFor({ ...q, price: 0.9 }).state, "unlikely", "greed rests");
});

test("the same number gets opposite verdicts on the two sides", () => {
  const at = { price: 0.63, bid: 0.55, ask: 0.63 };
  assert.equal(verdictFor({ ...at, side: "debit" }).state, "marketable");
  assert.equal(verdictFor({ ...at, side: "credit" }).state, "unlikely");
});

test("netQuote reproduces the scanner's credit as the marketable side", () => {
  // The scanner builds credit as short.bid - long.ask, which is the net BID.
  const legs = [
    { side: "sell", bid: 1.2, ask: 1.3, ratio: 1 },
    { side: "buy", bid: 0.6, ask: 0.7, ratio: 1 }
  ];
  const q = netQuote(legs);
  assert.equal(q.bid, 0.5, "1.20 - 0.70");
  assert.equal(q.ask, 0.7, "1.30 - 0.60");
  assert.equal(q.mid, 0.6);
  assert.equal(verdictFor({ price: 0.5, ...q, side: "credit" }).state, "marketable");
});

test("netQuote honours leg ratios, as a 2:1 condor needs", () => {
  const legs = [
    { side: "sell", bid: 1.0, ask: 1.1, ratio: 2 },
    { side: "buy", bid: 0.4, ask: 0.5, ratio: 2 },
    { side: "sell", bid: 0.8, ask: 0.9, ratio: 1 },
    { side: "buy", bid: 0.3, ask: 0.4, ratio: 1 }
  ];
  const q = netQuote(legs);
  assert.equal(q.bid, 1.4, "(1.00-0.50)*2 + (0.80-0.40)*1");
  assert.equal(q.ask, 2.0, "(1.10-0.40)*2 + (0.90-0.30)*1");
});

test("one unpriced leg withholds the whole net quote", () => {
  assert.equal(netQuote([{ side: "sell", bid: 1.2, ask: 1.3 }, { side: "buy", bid: null, ask: 0.7 }]), null);
  assert.equal(netQuote([]), null);
  assert.equal(netQuote(null), null);
});

test("the mark clamps to the track rather than running off it", () => {
  assert.equal(markPosition({ price: 0.29, bid: 0.29, ask: 0.37 }), 0);
  assert.equal(markPosition({ price: 0.37, bid: 0.29, ask: 0.37 }), 1);
  assert.equal(markPosition({ price: 9.99, bid: 0.29, ask: 0.37 }), 1);
  assert.equal(markPosition({ price: 0.01, bid: 0.29, ask: 0.37 }), 0);
});

test("a zero-width market still plots rather than dividing by zero", () => {
  const pos = markPosition({ price: 0.33, bid: 0.33, ask: 0.33 });
  assert.ok(Number.isFinite(pos));
});
