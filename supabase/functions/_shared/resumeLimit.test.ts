import test from "node:test";
import assert from "node:assert/strict";
import { sameLegs, orderSymbols, resumableLimit } from "./resumeLimit.ts";

const SHORT = "TSLA260918C00362500";
const LONG = "TSLA260918C00352500";
const RATIO = [SHORT, LONG];

const mleg = (limit: string, status = "canceled") => ({
  status, limit_price: limit, legs: [{ symbol: SHORT }, { symbol: LONG }]
});
const single = (symbol: string, limit: string, status = "canceled") => ({ status, limit_price: limit, symbol });

test("a single-leg order never resumes a two-leg structure", () => {
  // The live case. A cancelled buy-back of one 362.50 call at $9.89 per
  // contract was carried onto a 1x2 quoted at -7.01 / -6.43, because the old
  // rule matched on "touches any of these symbols". Different order,
  // different units, opposite direction.
  assert.equal(resumableLimit([single(SHORT, "9.89")], RATIO), null);
});

test("an order on the same two legs does resume", () => {
  assert.equal(resumableLimit([mleg("7.20")], RATIO), 7.2);
});

test("the furthest attempt on this structure wins", () => {
  assert.equal(resumableLimit([mleg("6.80"), mleg("7.20"), mleg("7.05")], RATIO), 7.2);
});

test("an order with the same symbols but a different leg count does not match", () => {
  // A three-leg order that happens to include both of these is a different
  // structure with a different net.
  const three = { status: "canceled", limit_price: "12.00", legs: [{ symbol: SHORT }, { symbol: LONG }, { symbol: "TSLA260918C00375000" }] };
  assert.equal(resumableLimit([three], RATIO), null);
});

test("the scan stops at a fill, because what came before belongs to a closed position", () => {
  assert.equal(
    resumableLimit([mleg("7.20"), mleg("9.00", "filled"), mleg("20.00")], RATIO),
    7.2
  );
});

test("a filled order older than nothing leaves no price to resume", () => {
  assert.equal(resumableLimit([mleg("9.00", "filled")], RATIO), null);
});

test("a market order carries no limit price and is skipped", () => {
  assert.equal(resumableLimit([{ status: "canceled", limit_price: null, legs: [{ symbol: SHORT }, { symbol: LONG }] }], RATIO), null);
});

test("a credit-to-close structure resumes its negative limits", () => {
  assert.equal(resumableLimit([mleg("-8.20"), mleg("-8.05")], RATIO), -8.05);
});

test("sameLegs is about the set and the count, not the order", () => {
  assert.equal(sameLegs([SHORT, LONG], [LONG, SHORT]), true);
  assert.equal(sameLegs([SHORT], [SHORT, LONG]), false);
  assert.equal(sameLegs([SHORT, SHORT], [SHORT, LONG]), false);
  assert.equal(sameLegs([], []), true);
});

test("orderSymbols reads a leg list or falls back to the order's own symbol", () => {
  assert.deepEqual(orderSymbols(mleg("1")), [SHORT, LONG]);
  assert.deepEqual(orderSymbols(single(SHORT, "1")), [SHORT]);
});
