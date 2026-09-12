import { test } from "node:test";
import assert from "node:assert/strict";
import { lotFromOption } from "./writeGuards.ts";

// The mass-deletion rule and its tests moved to `integrity.test.ts` when it
// stopped being a refusal and became a finding. What is left here is the rule
// about WHICH lots a reconstruction owns, which is unchanged.

// The incident this one is from: the reconstruction only derives option-touched
// lots, so deleting everything absent from its output destroyed 1,119 of 1,123
// lots of ordinary investing on the staging account.
test("only option-touched lots are the reconstruction's to delete", () => {
  assert.equal(lotFromOption({ acquired_source: "assignment", disposed_source: "trade" }), true);
  assert.equal(lotFromOption({ acquired_source: "trade", disposed_source: "assignment" }), true);
  assert.equal(lotFromOption({ acquired_source: "exercise", disposed_source: null }), true);
  assert.equal(lotFromOption({ acquired_source: "trade", disposed_source: "exercise" }), true);
});

test("ordinary buying and selling is protected", () => {
  assert.equal(lotFromOption({ acquired_source: "trade", disposed_source: "trade" }), false);
  assert.equal(lotFromOption({ acquired_source: "trade", disposed_source: null }), false);
  assert.equal(lotFromOption({ acquired_source: null, disposed_source: null }), false);
});

test("the guard agrees with the real staging split", () => {
  // 1,123 lots on account bf607dc8: 4 option-touched, 1,119 ordinary.
  const lots = [
    ...Array.from({ length: 1119 }, () => ({ acquired_source: "trade", disposed_source: "trade" })),
    { acquired_source: "assignment", disposed_source: "trade" },
    { acquired_source: "assignment", disposed_source: null },
    { acquired_source: "trade", disposed_source: "exercise" },
    { acquired_source: "exercise", disposed_source: "assignment" }
  ];
  assert.equal(lots.filter(lotFromOption).length, 4);
  assert.equal(lots.filter((l) => !lotFromOption(l)).length, 1119);
});
