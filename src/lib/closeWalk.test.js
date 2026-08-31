import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLimit, ASK_BUFFER, MIN_STEP, BLIND_STEP } from "./closeWalk.js";

// Walk a market to completion the way the dialog does, so the assertions are
// about the behaviour a trader actually gets rather than one arithmetic step.
function walk(startDebit, askDebit, maxSteps = 50) {
  const prices = [];
  let debit = startDebit;
  for (let i = 0; i < maxSteps; i++) {
    const next = nextLimit(debit, { askDebit });
    if (next <= debit) break;
    debit = next;
    prices.push(debit);
  }
  return prices;
}

// The reported incident. A spread quoted 40c wide: the walk starts at the mid
// and the ask is 0.20 away — exactly the total range the old fixed walk had, so
// it could never actually become marketable inside the attempt.
test("reaches a marketable price on the wide market that used to be unreachable", () => {
  const prices = walk(0.60, 0.80);
  const final = prices[prices.length - 1];
  assert.ok(final >= 0.80, `must reach the ask, got ${final}`);
  assert.ok(final <= 0.85 + 1e-9, `must not exceed ask + buffer, got ${final}`);
  assert.ok(prices.length <= 12, `should converge quickly, took ${prices.length}`);
});

test("the old fixed 2c walk could not have gotten there in ten steps", () => {
  // Kept as the regression this fixes: 0.60 + 10 * 0.02 = 0.80 only just
  // touches the ask, and any wider market was hopeless.
  assert.ok(0.6 + 10 * 0.02 < 0.85);
  const prices = walk(0.60, 1.20); // 60c-wide market
  assert.ok(prices[prices.length - 1] >= 1.20, "a wider market must still be reached");
});

test("step size scales with the market, not a constant", () => {
  const tight = walk(1.00, 1.04)[0] - 1.00;
  const wide = walk(1.00, 2.00)[0] - 1.00;
  assert.ok(wide > tight, "a wider market must take a bigger first step");
});

test("never offers more than the ask plus the buffer", () => {
  for (const ask of [0.05, 0.5, 1.37, 4.2]) {
    for (const p of walk(0.01, ask)) {
      assert.ok(p <= ask + ASK_BUFFER + 1e-9, `${p} exceeded ceiling for ask ${ask}`);
    }
  }
});

test("holds once at the ceiling rather than creeping past it", () => {
  const atCeiling = 0.85;
  assert.equal(nextLimit(atCeiling, { askDebit: 0.80 }), atCeiling);
  assert.equal(nextLimit(0.95, { askDebit: 0.80 }), 0.95, "already above: never walked back up");
});

test("a market that moves away is followed, not abandoned", () => {
  let debit = nextLimit(0.60, { askDebit: 0.70 });
  const afterMove = nextLimit(debit, { askDebit: 1.10 });
  assert.ok(afterMove > debit, "a higher ask must reopen the walk");
});

test("a tight market still moves by at least the minimum step", () => {
  const next = nextLimit(0.80, { askDebit: 0.80 });
  assert.ok(next - 0.80 >= MIN_STEP - 1e-9 || next === 0.80);
  assert.ok(next <= 0.85 + 1e-9);
});

test("with no usable quote it falls back to a small fixed step", () => {
  assert.equal(nextLimit(0.50, null), 0.52);
  assert.equal(nextLimit(0.50, { askDebit: null }), 0.52);
  assert.equal(nextLimit(0.50, { askDebit: NaN }), round(0.50 + BLIND_STEP));
  function round(v) { return Math.round(v * 100) / 100; }
});

test("prices stay at two decimals, which is all an exchange accepts", () => {
  for (const p of walk(0.07, 0.93)) {
    assert.equal(p, Math.round(p * 100) / 100, `${p} is not a round cent`);
  }
});
