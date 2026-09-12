import test from "node:test";
import assert from "node:assert/strict";
import { isWithheld, splitWithheld, withheldNote } from "./integrity.js";

// The real numbers from the account this was built for: 44 stored trades, one
// of them an XLY 119/118 put spread whose computed −$189 exceeds the −$125 its
// strikes can lose. Excluding it moves the account total from −$1,003 to −$814,
// which is 19% of what the page shows — the reason a count on its own is not
// enough.
const trades = [
  { realized_pl: -189, premium_pl: 25, early_close_pl: 0, integrity_code: "impossible_loss" },
  { realized_pl: -500, premium_pl: -500, early_close_pl: 0 },
  { realized_pl: -314, premium_pl: -300, early_close_pl: -14, integrity_code: null }
];

test("the split keeps the trade and removes only its money", () => {
  const s = splitWithheld(trades);
  assert.equal(s.rows.length, 2);
  assert.equal(s.count, 1);
  // The withheld row is still there to be rendered, badged, and dashed.
  assert.equal(s.withheld[0].realized_pl, -189);
});

test("the split reports the withheld DOLLARS, per view", () => {
  const s = splitWithheld(trades);
  assert.equal(s.realized, -189);
  // Premium only is a different question and a different number: the option
  // half of the same row. Quoting the whole-view figure under a premium
  // headline is the mixing this exists to prevent.
  assert.equal(s.premium, 25);
});

test("the note says the dollars and names the authority", () => {
  const s = splitWithheld(trades);
  const note = withheldNote(s, "whole");
  assert.match(note, /1 trade/);
  assert.match(note, /\$189\.00/);
  assert.match(note, /broker/);
  // "under review" described a process nothing in this product performs.
  assert.doesNotMatch(note, /under review/i);
});

test("the note follows the view it is shown under", () => {
  const s = splitWithheld(trades);
  assert.match(withheldNote(s, "premium"), /\$25\.00/);
});

test("nothing withheld, nothing said", () => {
  const clean = [{ realized_pl: 10 }, { realized_pl: -4, integrity_code: null }];
  const s = splitWithheld(clean);
  assert.equal(s.count, 0);
  assert.equal(s.rows.length, 2);
  // Null so a caller can render it unconditionally without an empty banner.
  assert.equal(withheldNote(s), null);
  assert.equal(withheldNote(null), null);
});

test("the predicate reads the column and nothing else", () => {
  assert.equal(isWithheld({ integrity_code: "impossible_loss" }), true);
  assert.equal(isWithheld({ integrity_code: null }), false);
  assert.equal(isWithheld({ integrity_code: "" }), false);
  assert.equal(isWithheld({}), false);
  assert.equal(isWithheld(undefined), false);
});

test("a non-array is not a crash", () => {
  // Every caller reads this off a fetch that can be mid-flight.
  const s = splitWithheld(undefined);
  assert.deepEqual(s.rows, []);
  assert.equal(s.count, 0);
  assert.equal(s.realized, 0);
});
