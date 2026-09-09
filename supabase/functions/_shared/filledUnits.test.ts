import test from "node:test";
import assert from "node:assert/strict";
import { filledUnits } from "./filledUnits.ts";

test("a single-leg order falls back to the parent, which is unambiguous there", () => {
  assert.equal(filledUnits({ qty: "5", filled_qty: "2" }), 2);
  assert.equal(filledUnits({ qty: "5", filled_qty: "2", legs: [] }), 2);
});

test("1:1 spread, three units filled — right under EITHER reading of the parent", () => {
  // The whole point. The parent might say 3 (units) or 6 (contracts); the legs
  // say 3 and 3, and 3 units is the answer either way.
  const order = {
    qty: "10",
    filled_qty: "6",
    legs: [
      { ratio_qty: "1", filled_qty: "3" },
      { ratio_qty: "1", filled_qty: "3" }
    ]
  };
  assert.equal(filledUnits(order), 3);
});

test("uneven ratios: a 1:2 order is counted in units, not contracts", () => {
  const order = {
    qty: "5",
    filled_qty: "9",
    legs: [
      { ratio_qty: "1", filled_qty: "3" },
      { ratio_qty: "2", filled_qty: "6" }
    ]
  };
  assert.equal(filledUnits(order), 3);
});

test("MIN, not max — one leg ahead of the other is not a closed unit", () => {
  // The failure this rule exists for: the long fills, the short does not. Two
  // legs are not two halves of a completed close; the position is still live.
  const order = {
    qty: "4",
    legs: [
      { ratio_qty: "1", filled_qty: "3" },
      { ratio_qty: "1", filled_qty: "1" }
    ]
  };
  assert.equal(filledUnits(order), 1);
});

test("a part-filled unit is not a unit", () => {
  const order = {
    qty: "3",
    legs: [
      { ratio_qty: "2", filled_qty: "3" }, // 1.5 units' worth
      { ratio_qty: "1", filled_qty: "2" }
    ]
  };
  assert.equal(filledUnits(order), 1);
});

test("nothing filled is zero, not NaN", () => {
  const order = { qty: "2", legs: [{ ratio_qty: "1" }, { ratio_qty: "1", filled_qty: null }] };
  assert.equal(filledUnits(order), 0);
});

test("an unreadable ratio falls back rather than inventing a denominator", () => {
  const order = {
    qty: "4",
    filled_qty: "2",
    legs: [
      { ratio_qty: "0", filled_qty: "2" },
      { ratio_qty: "1", filled_qty: "2" }
    ]
  };
  assert.equal(filledUnits(order), 2, "parent value, not a division by zero");
});

test("a four-leg condor counts by its slowest leg", () => {
  const order = {
    qty: "6",
    legs: [
      { ratio_qty: "1", filled_qty: "4" },
      { ratio_qty: "1", filled_qty: "4" },
      { ratio_qty: "1", filled_qty: "4" },
      { ratio_qty: "1", filled_qty: "2" }
    ]
  };
  assert.equal(filledUnits(order), 2);
});
