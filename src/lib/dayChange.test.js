import test from "node:test";
import assert from "node:assert/strict";
import { dayChange, dayChangeLabel } from "./dayChange.js";

test("the move is measured against yesterday's close", () => {
  const up = dayChange(226.67, 224.0);
  assert.equal(up.up, true);
  assert.equal(up.pct.toFixed(2), "1.19");
  assert.equal(dayChangeLabel(up), "+1.19%");

  const down = dayChange(224.0, 226.67);
  assert.equal(down.up, false);
  assert.equal(dayChangeLabel(down), "−1.18%");
});

test("nothing to measure reads as nothing, never as zero", () => {
  // A missing previous close is not a claim that the name is unchanged.
  assert.equal(dayChange(224.98, null), null);
  assert.equal(dayChange(224.98, 0), null);
  assert.equal(dayChange(224.98, undefined), null);
  assert.equal(dayChange(0, 224.0), null);
  assert.equal(dayChange(null, 224.0), null);
  assert.equal(dayChangeLabel(null), null);
});

test("unchanged is unchanged, and still signed", () => {
  const flat = dayChange(224.0, 224.0);
  assert.equal(flat.pct, 0);
  assert.equal(flat.up, true);
  assert.equal(dayChangeLabel(flat), "+0.00%");
});
