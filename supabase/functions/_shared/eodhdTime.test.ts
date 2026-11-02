import { test } from "node:test";
import assert from "node:assert/strict";
import { eodhdTime, eodhdIso } from "./eodhdTime.ts";

// 2 Nov 2026, 13:44:01.432 UTC.
const NOW = 1793627041432;

test("the nanosecond figure EODHD sent on 2 Nov (ms x 1,000,001) reads as the moment it printed", () => {
  assert.equal(eodhdTime(1793628835059200000, NOW + 3000), 1793627041432);
  assert.equal(eodhdIso(1793628835059200000, NOW + 3000), "2026-11-02T13:44:01.432Z");
});

test("true nanoseconds, microseconds, milliseconds and seconds all read right", () => {
  assert.equal(eodhdTime(NOW * 1e6, NOW), NOW);
  assert.equal(eodhdTime(NOW * 1e3, NOW), NOW);
  assert.equal(eodhdTime(NOW, NOW), NOW);
  assert.equal(eodhdTime(Math.floor(NOW / 1000), NOW), Math.floor(NOW / 1000) * 1000);
});

test("missing, broken or far-off times: the moment it came, never a throw", () => {
  for (const t of [undefined, null, "", "abc", -5, 0, 1e30, NOW + 3600000]) {
    assert.equal(eodhdTime(t, NOW), NOW);
    assert.doesNotThrow(() => eodhdIso(t, NOW));
  }
});
