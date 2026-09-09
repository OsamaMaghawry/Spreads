import test from "node:test";
import assert from "node:assert/strict";
import {
  payoffAt, kinks, slopeAbove, maxLoss, maxProfit, breakEvens, netPremium, structureRisk, priceable
} from "./legMath.ts";

const call = (strike: number, qty: number, entry: number) => ({ type: "C" as const, strike, qty, entryPrice: entry });
const put = (strike: number, qty: number, entry: number) => ({ type: "P" as const, strike, qty, entryPrice: entry });
const stock = (qty: number, basis: number) => ({ type: "S" as const, qty, entryPrice: basis });

// The point of this file: every one of these is answered by the SAME code,
// and none of them is recognised by name. The structures are only here to
// prove that the general answer is the right answer for each.

test("a put credit spread: width less the credit, in the right place", () => {
  const legs = [put(465, -1, 3), put(460, 1, 1.5)];
  const { loss, at } = maxLoss(legs);
  assert.equal(loss, 350, "5 wide less $1.50 net credit");
  assert.equal(at, 0, "worst at the bottom, and it stays worst all the way down");
  assert.equal(maxProfit(legs).profit, 150);
  assert.deepEqual(breakEvens(legs), [463.5]);
});

test("a call credit spread is the mirror image", () => {
  const legs = [call(470, -1, 2), call(475, 1, 0.5)];
  assert.equal(maxLoss(legs).loss, 350);
  assert.equal(maxProfit(legs).profit, 150);
  assert.deepEqual(breakEvens(legs), [471.5]);
});

test("a debit call spread cannot lose more than it cost", () => {
  const legs = [call(200, 1, 12), call(220, -1, 5)];
  assert.equal(maxLoss(legs).loss, 700, "the net debit");
  assert.equal(maxProfit(legs).profit, 1300, "20 wide less the $7 paid");
  assert.deepEqual(breakEvens(legs), [207]);
});

test("an iron condor loses one side, never both", () => {
  const legs = [put(95, -1, 1.2), put(90, 1, 0.5), call(105, -1, 1.1), call(110, 1, 0.4)];
  assert.equal(maxLoss(legs).loss, 360, "5 wide less the $1.40 credit — not both wings");
  assert.equal(maxProfit(legs).profit, 140);
  assert.deepEqual(breakEvens(legs), [93.6, 106.4]);
});

test("a naked call is unbounded, and says which way", () => {
  const r = maxLoss([call(105, -1, 2)]);
  assert.equal(r.loss, null);
  assert.equal(r.unbounded, "up");
  assert.equal(maxProfit([call(105, -1, 2)]).profit, 200);
});

test("a cash-secured put is bounded at zero, because the stock is", () => {
  const legs = [put(100, -1, 2)];
  assert.equal(maxLoss(legs).loss, 9800, "(100 - 2) x 100");
  assert.equal(maxLoss(legs).at, 0);
  assert.equal(maxLoss(legs).unbounded, null);
});

test("shares alone lose their basis and nothing more", () => {
  assert.equal(maxLoss([stock(210, 364.31)]).loss, 76505.1);
  assert.equal(maxProfit([stock(210, 364.31)]).profit, null, "up and away");
});

test("a covered call caps the upside and keeps the downside", () => {
  const legs = [stock(100, 100), call(105, -1, 2)];
  assert.equal(maxLoss(legs).loss, 9800, "the stock to zero, less the premium");
  assert.equal(maxProfit(legs).profit, 700, "$5 of upside plus the $2 credit");
  assert.deepEqual(breakEvens(legs), [98]);
});

// --- The one that started this ---------------------------------------------

test("the owner's live stock repair, read without being recognised", () => {
  // 210 shares at 364.31, long 1x 352.50 call at 13.57, short 2x 362.50 at 8.69.
  const legs = [stock(210, 364.31), call(352.5, 1, 13.57), call(362.5, -2, 8.69)];

  // Slope above the highest strike: 210 shares + 100 long - 200 short = +110.
  // Positive, so the whole position is bounded below and runs up forever.
  assert.equal(slopeAbove(legs), 110);
  assert.equal(maxLoss(legs).loss, 76124.1, "at zero: the stock, less the net credit");
  assert.equal(maxLoss(legs).at, 0);
  assert.equal(maxProfit(legs).profit, null);
  assert.deepEqual(breakEvens(legs), [359.27], "the number neither card could show");
});

test("the same repair's OPTIONS alone are unbounded, which is why they are a row of their own", () => {
  const legs = [call(352.5, 1, 13.57), call(362.5, -2, 8.69)];
  assert.equal(slopeAbove(legs), -100);
  assert.equal(maxLoss(legs).loss, null);
  assert.equal(maxLoss(legs).unbounded, "up");
  assert.equal(netPremium(legs), 381);
  assert.deepEqual(breakEvens(legs), [376.31]);
});

// --- Structures nobody enumerated, answered anyway --------------------------

test("a call butterfly", () => {
  const legs = [call(100, 1, 6), call(105, -2, 3), call(110, 1, 1.5)];
  assert.equal(maxLoss(legs).loss, 150, "the net debit");
  assert.equal(maxProfit(legs).profit, 350, "$5 less the $1.50 paid, at the body");
  assert.equal(maxProfit(legs).at, 105);
  assert.deepEqual(breakEvens(legs), [101.5, 108.5]);
});

test("a broken-wing butterfly, where the wings are not equal", () => {
  const legs = [call(100, 1, 6), call(105, -2, 3), call(115, 1, 0.8)];
  // Wide wing 10, narrow wing 5, entered for an $0.80 debit: the upside loss
  // is the difference between the wings plus what it cost. Worked by hand as
  // $480 the first time and the engine said $580; the engine was right.
  const r = maxLoss(legs);
  assert.equal(netPremium(legs), -80, "a debit, not the credit I assumed");
  assert.equal(r.loss, 580, "(10 - 5) x 100 + the $80 paid");
  assert.equal(r.at, 115);
  assert.equal(r.unbounded, null, "the far long caps it — nothing here knew that in advance");
});

test("a put ratio, which the pairing does not name and the math does not care", () => {
  const legs = [put(350, 1, 12), put(340, -2, 5)];
  // Net short one put at 340, plus a 350/340 spread, entered for a $2 debit.
  // At zero: -34,000 on the naked short, +1,000 on the spread, -200 paid.
  const r = maxLoss(legs);
  assert.equal(r.at, 0, "worst at zero, where both shorts are fully in the money");
  assert.equal(r.loss, 33200);
  assert.equal(r.unbounded, null, "a put ratio's risk is bounded, unlike a call ratio's");
});

test("a call ladder: one long, two shorts at different strikes", () => {
  const legs = [call(100, 1, 8), call(110, -1, 3), call(120, -1, 1)];
  assert.equal(slopeAbove(legs), -100);
  assert.equal(maxLoss(legs).unbounded, "up");
  assert.equal(maxProfit(legs).profit, 600, "$10 of width plus the $4 net credit... at 110");
});

test("a calendar's two expiries are not modelled, and the near leg is what expires", () => {
  // Deliberate limitation, stated: this file values everything at ONE expiry.
  // A calendar therefore reads as the near-dated structure, which understates
  // the long. Named so nobody mistakes the answer for a full one.
  const legs = [call(100, -1, 3, ), call(100, 1, 6)];
  assert.equal(maxLoss(legs).loss, 300, "the net debit, as if both expired together");
});

test("a jelly roll, a box, and anything else made of these parts still answers", () => {
  const box = [call(100, 1, 12), call(110, -1, 5), put(110, 1, 6), put(100, -1, 2)];
  const r = maxLoss(box);
  assert.equal(r.unbounded, null);
  assert.equal(maxProfit(box).profit, 0, "a box is worth its width; entered at $11 for a $10 box it loses $100 everywhere");
  assert.equal(r.loss, 100);
});

// --- Refusals ---------------------------------------------------------------

test("an adjusted contract makes the whole structure unpriceable, not partly priced", () => {
  const legs = [call(100, 1, 6), { type: "C" as const, strike: 105, qty: -1, entryPrice: 3, adjusted: true }];
  assert.equal(priceable(legs), false);
  assert.equal(maxLoss(legs).loss, null);
  assert.equal(maxLoss(legs).reason, "unpriceable");
  assert.equal(payoffAt(legs, 100), null);
  assert.deepEqual(breakEvens(legs), []);
});

test("no legs is not a zero-risk position", () => {
  assert.equal(maxLoss([]).loss, null);
  assert.equal(payoffAt([], 100), null);
});

// --- The properties that make the answer exact ------------------------------

test("the kinks are zero and the strikes, which is where a minimum can be", () => {
  assert.deepEqual(kinks([call(110, -1, 1), put(90, -1, 1), stock(100, 100)]), [0, 90, 110]);
});

test("a swept minimum never beats the kink minimum, on a hundred random books", () => {
  // The claim this file rests on: the payoff is piecewise linear with kinks
  // only at strikes, so checking the kinks is not a shortcut — it is the
  // whole answer. If a fine sweep ever found a lower point, the claim is
  // false and every figure on the dashboard is wrong.
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 0; n < 100; n++) {
    const legs: any[] = [];
    const count = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      const type = rnd() < 0.45 ? "C" : rnd() < 0.9 ? "P" : "S";
      legs.push({
        type,
        strike: type === "S" ? null : Math.round(80 + rnd() * 60),
        qty: (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)) * (type === "S" ? 100 : 1),
        entryPrice: type === "S" ? 100 : round2(rnd() * 12)
      });
    }
    const viaKinks = maxLoss(legs);
    if (viaKinks.unbounded) continue;
    let swept = Infinity;
    for (let p = 0; p <= 250; p += 0.25) swept = Math.min(swept, payoffAt(legs, p) as number);
    // The sweep can only be worse (higher) than the exact answer, never better.
    assert.ok(
      swept >= -(viaKinks.loss as number) - 0.01,
      `sweep found ${swept} below the kink minimum ${-(viaKinks.loss as number)} on ${JSON.stringify(legs)}`
    );
  }
});

test("structureRisk gathers it all without asking what the structure is called", () => {
  const r = structureRisk([call(352.5, 1, 13.57), call(362.5, -2, 8.69)]);
  assert.equal(r.maxLoss, null);
  assert.equal(r.lossUnbounded, "up");
  assert.equal(r.netPremium, 381);
  assert.deepEqual(r.breakEvens, [376.31]);
  assert.equal(r.slopeAbove, -100);
});

function round2(n: number) { return Math.round(n * 100) / 100; }
