import { test } from "node:test";
import assert from "node:assert/strict";
import { refuseMassDelete, lotFromOption } from "./writeGuards.ts";

// The guards exist because of two specific incidents. Each test names one.

test("allows ordinary reconciliation", () => {
  assert.equal(refuseMassDelete("trade records", 3, 99), null);
  assert.equal(refuseMassDelete("trade records", 24, 99), null); // 24% — under the line
});

test("refuses a sync that would remove most of the stored history", () => {
  const refusal = refuseMassDelete("trade records", 50, 99);
  assert.ok(refusal, "50 of 99 must be refused");
  assert.match(refusal, /Nothing was changed/);
  assert.match(refusal, /50 of 99/);
});

test("the floor keeps small accounts usable", () => {
  // 3 of 4 is 75% and is still just three rows on a new account.
  assert.equal(refuseMassDelete("trade records", 3, 4), null);
  assert.equal(refuseMassDelete("trade records", 5, 6), null);
  assert.ok(refuseMassDelete("trade records", 6, 7), "past the floor the share rule applies again");
});

test("an empty store is never a mass delete", () => {
  assert.equal(refuseMassDelete("share lots", 0, 0), null);
});

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
