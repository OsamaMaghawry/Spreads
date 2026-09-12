import test from "node:test";
import assert from "node:assert/strict";
import { capitalAtWork, netFlow, flowNote } from "./capital.js";

// The owner's own live account, which is what found this. Window 13 Aug to
// 11 Sep 2026 (30 days), a $700 deposit on 4 Sep, closing equity $688.70, P/L
// −$510. Under the old arithmetic the return divided by $688.70.
const WINDOW = { from: "2026-08-13", to: "2026-09-11" };
const DEPOSIT = [{ day: "2026-09-04", amount: 700 }];

test("a late deposit is weighted by the time it was actually present", () => {
  // 4 Sep is day 23 of 30, so the deposit was there for 8 of 30 days.
  const capital = capitalAtWork({ startEquity: 498.7, flows: DEPOSIT, ...WINDOW });
  assert.equal(Math.round(capital * 100) / 100, 685.37); // 498.70 + 700 × 8/30

  // And the number this replaces. Dividing −$510 by closing equity reported
  // −74%; against capital actually at work it is −74.4% — close here only
  // because the deposit is late. The point is the denominator's MEANING, and
  // the next test shows how far apart they get.
  assert.ok(capital < 688.7 + 700);
});

test("an early deposit counts almost in full; a late one barely at all", () => {
  const early = capitalAtWork({ startEquity: 1000, flows: [{ day: "2026-08-13", amount: 3000 }], ...WINDOW });
  const late = capitalAtWork({ startEquity: 1000, flows: [{ day: "2026-09-11", amount: 3000 }], ...WINDOW });
  assert.equal(early, 4000);                 // present the whole window
  assert.equal(Math.round(late), 1100);      // present for one day of thirty
  // The defect this replaces treated both as $4,000, so a deposit made on the
  // last day of the window cut the reported return to a quarter.
});

test("a withdrawal reduces the capital that earned the result", () => {
  const capital = capitalAtWork({ startEquity: 1000, flows: [{ day: "2026-08-13", amount: -500 }], ...WINDOW });
  assert.equal(capital, 500);
});

test("a flow outside the window is not this window's capital", () => {
  // Dropped, not clamped. Clamping a deposit made a month later to full weight
  // is the original defect in a smaller box.
  const capital = capitalAtWork({ startEquity: 1000, flows: [{ day: "2026-10-01", amount: 5000 }], ...WINDOW });
  assert.equal(capital, 1000);
  assert.equal(capitalAtWork({ startEquity: 1000, flows: [{ day: "2026-01-01", amount: 5000 }], ...WINDOW }), 1000);
});

test("NEVER LOOKED and LOOKED AND FOUND NONE are different answers", () => {
  // The whole defect was publishing a confident percentage over a denominator
  // nobody had checked, so the unknown case must not fall back to a number.
  assert.equal(capitalAtWork({ startEquity: 1000, flows: null, ...WINDOW }), null);
  assert.equal(capitalAtWork({ startEquity: 1000, flows: undefined, ...WINDOW }), null);
  assert.equal(capitalAtWork({ startEquity: 1000, flows: [], ...WINDOW }), 1000);
});

test("no starting equity, no return", () => {
  // An account whose daily series has not been built has no opening balance,
  // and there is no honest denominator to invent.
  assert.equal(capitalAtWork({ startEquity: null, flows: [], ...WINDOW }), null);
  assert.equal(capitalAtWork({ startEquity: "", flows: [], ...WINDOW }), null);
});

test("an account funded entirely inside the window has no return to report", () => {
  // Starting capital zero, all the money arrives on day 23: the weighted base
  // is $187 against $700 that was never at risk for most of the period. A
  // percentage over that is a number that means nothing however confidently it
  // prints — but it is positive, so it is reported rather than hidden.
  const capital = capitalAtWork({ startEquity: 0, flows: DEPOSIT, ...WINDOW });
  assert.ok(capital > 0 && capital < 200);
  // A denominator at or below zero is refused outright: the return would be
  // infinite or sign-flipped.
  assert.equal(capitalAtWork({ startEquity: 0, flows: [], ...WINDOW }), null);
  assert.equal(
    capitalAtWork({ startEquity: 100, flows: [{ day: "2026-08-13", amount: -100 }], ...WINDOW }),
    null
  );
});

test("a one-day window divides by one day, not zero", () => {
  const capital = capitalAtWork({
    startEquity: 1000,
    flows: [{ day: "2026-08-13", amount: 100 }],
    from: "2026-08-13",
    to: "2026-08-13"
  });
  assert.equal(capital, 1100);
});

test("netFlow answers what moved, for the sentence that explains the step", () => {
  assert.equal(netFlow(DEPOSIT, WINDOW.from, WINDOW.to), 700);
  assert.equal(netFlow([{ day: "2026-09-04", amount: 700 }, { day: "2026-09-05", amount: -200 }], WINDOW.from, WINDOW.to), 500);
  assert.equal(netFlow([], WINDOW.from, WINDOW.to), 0);
  assert.equal(netFlow(null, WINDOW.from, WINDOW.to), null);
});

test("the note says what moved and why the denominator is not the balance", () => {
  const note = flowNote(DEPOSIT, WINDOW.from, WINDOW.to);
  assert.match(note, /added \$700\.00/);
  assert.match(note, /capital actually at work/);
  assert.match(note, /not against the closing balance/);
  // Nothing moved, nothing said.
  assert.equal(flowNote([], WINDOW.from, WINDOW.to), null);
  assert.equal(flowNote(null, WINDOW.from, WINDOW.to), null);
});
