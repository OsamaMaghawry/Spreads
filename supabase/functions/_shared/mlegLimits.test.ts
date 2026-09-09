import test from "node:test";
import assert from "node:assert/strict";
import { mlegRefusal, mlegOk, normalizeMleg, gcdAll, MAX_MLEG_LEGS } from "./mlegLimits.ts";

const leg = (symbol: string, ratio = 1, assetClass = "us_option") => ({ symbol, ratio, assetClass });

test("a vertical and a condor are what the broker already takes", () => {
  assert.equal(mlegRefusal([leg("A"), leg("B")]), null);
  assert.equal(mlegOk([leg("A"), leg("B"), leg("C"), leg("D")]), true);
});

test("five legs is refused with the leg count and what to do instead", () => {
  const why = mlegRefusal([leg("A"), leg("B"), leg("C"), leg("D"), leg("E")]);
  assert.match(String(why), /5 legs/);
  assert.match(String(why), new RegExp(`at most ${MAX_MLEG_LEGS}`));
  assert.match(String(why), /pick the legs/i, "it must say what to do, not only that it cannot");
});

test("shares cannot ride along with contracts", () => {
  const why = mlegRefusal([leg("TSLA", 1, "equity"), leg("TSLA260918C00420000")]);
  assert.match(String(why), /Shares and contracts/);
});

test("one leg is not an mleg and is not judged as one", () => {
  // Six shares of nothing in particular: a single leg goes out as a plain
  // order, so none of the multi-leg rules apply to it.
  assert.equal(mlegRefusal([leg("TSLA", 1, "equity")]), null);
  assert.equal(mlegRefusal([leg("A", 7)]), null, "a lone leg's ratio is its own quantity");
});

test("no legs is a refusal, not an empty order", () => {
  assert.match(String(mlegRefusal([])), /no legs/i);
  assert.match(String(mlegRefusal(null as any)), /no legs/i);
});

test("the same contract twice is caught here rather than at the broker", () => {
  assert.match(String(mlegRefusal([leg("A"), leg("A")])), /twice/);
});

test("a fractional or zero ratio is refused before it is sent", () => {
  assert.match(String(mlegRefusal([leg("A", 1.5), leg("B")])), /whole number/);
  assert.match(String(mlegRefusal([leg("A", 0), leg("B")])), /whole number/);
});

test("gcd of the ratios", () => {
  assert.equal(gcdAll([2, 4]), 2);
  assert.equal(gcdAll([1, 2]), 1);
  assert.equal(gcdAll([6, 9, 15]), 3);
  assert.equal(gcdAll([]), 1, "no ratios divides by one, not by zero");
});

test("a 2:4 becomes a 1:2 with twice the quantity — the same contracts", () => {
  const before = { qty: 2, legs: [leg("A", 2), leg("B", 4)] };
  const after = normalizeMleg(before.qty, before.legs);
  assert.equal(after.qty, 4);
  assert.deepEqual(after.legs.map((l) => l.ratio), [1, 2]);
  // The claim that matters: total contracts per symbol are unchanged.
  before.legs.forEach((l, i) => {
    assert.equal(before.qty * l.ratio, after.qty * after.legs[i].ratio, l.symbol);
  });
});

test("the limit price is scaled with the unit, or the order doubles in value", () => {
  // 2 units of a 2:4 at $1.05 per unit is $210. Rescaled to 4 units of a 1:2,
  // leaving the price alone would send $420 -- twice what the trader agreed to
  // pay, with nothing on screen showing it.
  const after = normalizeMleg(2, [leg("A", 2), leg("B", 4)], 1.05);
  assert.equal(after.qty, 4);
  assert.equal(after.limitPrice, 0.52, "0.525 floored, never rounded up on a debit");
  assert.ok(after.qty * (after.limitPrice as number) <= 2 * 1.05, "and never more than the original total");
});

test("a credit is floored too — more negative demands more, never less", () => {
  const after = normalizeMleg(2, [leg("A", 2), leg("B", 4)], -1.05);
  // -0.525 floors to -0.53: the order asks for slightly MORE credit per unit.
  assert.equal(after.limitPrice, -0.53);
  assert.ok(after.qty * (after.limitPrice as number) <= 2 * -1.05, "never accepts less credit than intended");
});

test("an exact halving needs no rounding at all", () => {
  const after = normalizeMleg(3, [leg("A", 2), leg("B", 4)], 1.5);
  assert.equal(after.qty, 6);
  assert.equal(after.limitPrice, 0.75);
  assert.equal(after.qty * (after.limitPrice as number), 3 * 1.5, "same total to the cent");
});

test("a market order carries no price and is not given one", () => {
  assert.equal(normalizeMleg(2, [leg("A", 2), leg("B", 4)]).limitPrice, null);
});

test("an already-reduced ratio is left exactly alone", () => {
  const legs = [leg("A", 1), leg("B", 2)];
  const after = normalizeMleg(3, legs);
  assert.equal(after.qty, 3);
  assert.equal(after.legs, legs, "no copy, no churn");
});

test("normalize does not touch a single leg or a zero quantity", () => {
  assert.deepEqual(normalizeMleg(2, [leg("A", 4)]).qty, 2, "a lone leg's ratio is not a ratio to reduce");
  assert.equal(normalizeMleg(0, [leg("A", 2), leg("B", 4)]).qty, 0);
});

test("a 1x2 repair passes both the cap and the ratio rule", () => {
  // The 8 Sep position, as the close ticket would build it.
  const legs = [leg("TSLA260918C00400000", 1), leg("TSLA260918C00420000", 2)];
  assert.equal(mlegRefusal(legs), null);
  assert.equal(normalizeMleg(1, legs).qty, 1, "1:2 is already in lowest terms");
});

test("a rescale that would floor the price below a cent is not done at all", () => {
  // Buying back a near-worthless subset for a penny is routine. Flooring
  // 0.01 / 2 gives 0.00, which is not a cheaper order but a different one:
  // rejected, or accepted and unfillable while the ticket still says $0.01.
  const legs = [leg("A", 2), leg("B", 2)];
  const after = normalizeMleg(1, legs, 0.01);
  assert.equal(after.qty, 1, "left alone rather than sent at zero");
  assert.equal(after.limitPrice, 0.01);
  assert.equal(after.legs, legs);

  const deep = normalizeMleg(1, [leg("A", 10), leg("B", 10)], 0.05);
  assert.equal(deep.limitPrice, 0.05);
  assert.equal(deep.qty, 1);
});

test("a credit can never floor to zero, so the guard only ever bites a debit", () => {
  // Flooring a negative number moves it AWAY from zero, so -0.01 / 2 = -0.005
  // floors to -0.01 rather than to 0.00. The rescale therefore proceeds, and
  // the result demands slightly more credit per unit -- the safe direction.
  const after = normalizeMleg(1, [leg("A", 2), leg("B", 2)], -0.01);
  assert.equal(after.qty, 2);
  assert.equal(after.limitPrice, -0.01);
  assert.ok(after.qty * (after.limitPrice as number) <= 1 * -0.01, "never accepts less credit than intended");
});

test("a rescale that stays at or above a cent still happens", () => {
  const after = normalizeMleg(1, [leg("A", 2), leg("B", 2)], 0.02);
  assert.equal(after.qty, 2);
  assert.equal(after.limitPrice, 0.01);
});
