import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLimit, ASK_BUFFER, MIN_STEP, walkStart, walkCeiling } from "./closeWalk.js";

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

test("with no usable quote the walk HOLDS rather than stepping blind", () => {
  // This used to step by a fixed $0.02 with no ceiling to stop it. Once the quote
  // gate began refusing one-sided markets, `quote` arrives null far more often,
  // and twenty blind steps in ten minutes is an unbounded concession made while
  // the ticket promises "never bids above the ask + $0.05" — a promise it
  // cannot compute. Holding is the honest move: nothing to measure against,
  // nothing to concede.
  assert.equal(nextLimit(0.50, null), 0.50);
  assert.equal(nextLimit(0.50, { askDebit: null }), 0.50);
  assert.equal(nextLimit(0.50, { askDebit: NaN }), 0.50);
});

test("prices stay at two decimals, which is all an exchange accepts", () => {
  for (const p of walk(0.07, 0.93)) {
    assert.equal(p, Math.round(p * 100) / 100, `${p} is not a round cent`);
  }
});

// --- The start of the walk, which nothing used to check -------------------

test("a resumed price never starts the walk above the ceiling", () => {
  // The live case: a stale $9.89 single-leg limit resumed onto a structure
  // quoted at -7.01 / -6.43. Unclamped it started above ask + 0.05, so
  // nextLimit returned it unchanged forever and the order would have paid
  // $989 to close a position the market would have PAID $643 to close.
  const quote = { bidDebit: -7.01, askDebit: -6.43 };
  assert.equal(walkStart(-6.72, 9.89, quote), -6.38, "clamped to ask + 0.05");
  assert.equal(nextLimit(walkStart(-6.72, 9.89, quote), quote), -6.38, "and it is already there");
});

test("a resumed price inside the ceiling still carries the walk forward", () => {
  const quote = { bidDebit: 6.64, askDebit: 7.37 };
  assert.equal(walkStart(7.0, 7.2, quote), 7.2, "resume from where the last attempt got to");
  assert.equal(walkStart(7.0, null, quote), 7.0, "no prior attempt: the mid");
});

test("a credit-to-close structure walks from its own side of the market", () => {
  // Every figure is negative; "further along" still means giving up more.
  const quote = { bidDebit: -8.4, askDebit: -8.0 };
  assert.equal(walkStart(-8.2, null, quote), -8.2);
  assert.equal(walkStart(-8.2, -8.1, quote), -8.1);
  assert.equal(walkStart(-8.2, 3.0, quote), -7.95, "a stale debit cannot drag a credit close upward");
});

test("with no quote there is no ceiling, so there is no walk", () => {
  // The clamp exists to stop a resumed price starting the walk above the
  // ceiling. Returning the resumed price unclamped when the ceiling is null
  // disabled it in exactly the case it was written for: walkStart(0.3, 6.40,
  // null) handed back 6.40 while the ticket printed "never bids above the ask
  // + $0.05". On a structure quoted -7.01/-6.43 that pays $640 to close a
  // position that should pay $643 — the incident this function ended, back by
  // another route.
  assert.equal(walkStart(0.3, null, null), null);
  assert.equal(walkStart(0.3, 1.2, null), null);
  assert.equal(walkStart(0.3, 6.40, null), null, "the resumed price is not a licence to walk blind");
  assert.equal(walkStart(null, null, null), null);
  // With a market, it behaves exactly as before.
  assert.equal(walkStart(0.3, 1.2, { askDebit: 0.8 }), 0.85);
});

test("walkCeiling is the promise the ticket makes, in one place", () => {
  assert.equal(walkCeiling({ askDebit: 7.37 }), 7.42);
  assert.equal(walkCeiling({ askDebit: -6.43 }), -6.38);
  assert.equal(walkCeiling(null), null);
});
