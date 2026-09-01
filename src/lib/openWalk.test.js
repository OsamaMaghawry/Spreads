import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCredit, creditFloor, walkBounds, BID_BUFFER, MIN_STEP } from "./openWalk.js";

// Walk to completion the way the open ticket does, so the assertions are about
// what a trader actually gets rather than one arithmetic step.
function walk(startCredit, quote, minCredit, maxSteps = 60) {
  const prices = [];
  let credit = startCredit;
  for (let i = 0; i < maxSteps; i++) {
    const next = nextCredit(credit, quote, minCredit);
    if (next >= credit) break;
    credit = next;
    prices.push(credit);
  }
  return prices;
}

test("the walk concedes DOWNWARD — the direction that inverts from the close", () => {
  const prices = walk(0.88, { bid: 0.78, ask: 0.88 }, null);
  assert.ok(prices.length > 0, "it must move");
  for (let i = 1; i < prices.length; i++) {
    assert.ok(prices[i] < prices[i - 1], `step ${i} went the wrong way: ${prices[i - 1]} -> ${prices[i]}`);
  }
});

test("it reaches a marketable credit, and stops there", () => {
  const quote = { bid: 0.78, ask: 0.88 };
  const prices = walk(0.88, quote, null);
  const last = prices[prices.length - 1];
  assert.equal(last, 0.76, "bid 0.78 minus the buffer");
  assert.equal(nextCredit(last, quote, null), last, "at the floor it holds rather than conceding further");
});

test("the trader's floor is absolute — the market cannot walk through it", () => {
  // The market has moved away: bid 0.60 would let the walk concede to 0.58, but
  // the trader said not below 0.70. Conceding past that raises the max risk they
  // approved.
  const quote = { bid: 0.6, ask: 0.7 };
  const prices = walk(0.88, quote, 0.7);
  const last = prices[prices.length - 1];
  assert.equal(last, 0.7);
  assert.equal(creditFloor(quote, 0.7), 0.7);
  assert.equal(nextCredit(0.7, quote, 0.7), 0.7, "it holds at the floor forever, it does not creep");
});

test("a floor below the market does not make the walk more generous", () => {
  // Floor 0.50, bid 0.78. There is no reason to concede past 0.76 — an order
  // there is already taken — so the higher of the two bounds binds.
  const quote = { bid: 0.78, ask: 0.88 };
  assert.equal(creditFloor(quote, 0.5), 0.76);
  const last = walk(0.88, quote, 0.5).pop();
  assert.equal(last, 0.76);
});

test("a wide market still converges in a handful of steps", () => {
  // The AMD lesson from the close side: a fixed step never crosses a wide
  // market. 2.40 down to 0.98 is a $1.42 gap.
  const prices = walk(2.4, { bid: 1.0, ask: 2.4 }, null);
  assert.ok(prices.length <= 20, `took ${prices.length} steps on a wide market`);
  assert.equal(prices[prices.length - 1], 0.98);
});

test("a tight market still moves — the minimum step stops a stall", () => {
  const quote = { bid: 0.8, ask: 0.81 };
  const next = nextCredit(0.81, quote, null);
  assert.ok(0.81 - next >= MIN_STEP - 1e-9, "a proportional step of a penny gap must not round to nothing");
  assert.equal(walk(0.81, quote, null).pop(), 0.78, `bid 0.80 less the ${BID_BUFFER} buffer`);
});

test("no quote crawls rather than standing still, and never below a set floor", () => {
  assert.equal(nextCredit(0.9, null, null), 0.88);
  assert.equal(nextCredit(0.71, null, 0.7), 0.7, "the floor binds even blind");
  assert.equal(nextCredit(0.7, null, 0.7), 0.7);
});

test("a credit never walks to zero or negative when flying blind", () => {
  const prices = walk(0.05, null, null);
  assert.ok(prices.every((p) => p >= 0.01), `went non-positive: ${prices}`);
});

test("no price is not a walk", () => {
  assert.equal(nextCredit(null, { bid: 0.78, ask: 0.88 }, null), null);
});

test("walkBounds says up front when a start will not move", () => {
  const quote = { bid: 0.78, ask: 0.88 };
  assert.deepEqual(walkBounds(0.88, quote, null), { start: 0.88, floor: 0.76, willWalk: true });
  // The scanner seeds the credit at the bid, which is already marketable — such
  // an order should just be sent, not walked.
  assert.equal(walkBounds(0.76, quote, null).willWalk, false);
  assert.equal(walkBounds(0.7, quote, null).willWalk, false);
  assert.equal(walkBounds(0.88, null, null).willWalk, false, "no floor is not a walk");
});
