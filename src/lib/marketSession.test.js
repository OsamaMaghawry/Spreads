import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionPhase, marketIsOpen } from "./marketSession.js";

// Must agree with sessionPhase in supabase/functions/_shared/watchRules.ts.
// The two are deliberate twins across runtimes, so they are held to the same
// boundaries here and there.
const at = (h, m, day = 3) => sessionPhase(new Date(Date.UTC(2026, 8, day, h, m, 0)));

test("the bell, from both sides", () => {
  assert.equal(at(12, 59), "pre");
  assert.equal(at(13, 29), "pre");
  assert.equal(at(13, 30), "open", "09:30 ET");
  assert.equal(at(16, 0), "open");
  assert.equal(at(19, 59), "open");
  assert.equal(at(20, 0), "post", "16:00 ET — options stop trading here");
  assert.equal(at(23, 30), "post");
});

test("weekends are closed", () => {
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 8, 5, 16, 0))), "closed", "Saturday");
  assert.equal(sessionPhase(new Date(Date.UTC(2026, 8, 6, 16, 0))), "closed", "Sunday");
});

test("marketIsOpen only inside the session", () => {
  assert.equal(marketIsOpen(new Date(Date.UTC(2026, 8, 3, 16, 0))), true);
  assert.equal(marketIsOpen(new Date(Date.UTC(2026, 8, 3, 13, 0))), false, "pre-market");
  assert.equal(marketIsOpen(new Date(Date.UTC(2026, 8, 3, 20, 30))), false, "after the close");
  assert.equal(marketIsOpen(new Date(Date.UTC(2026, 8, 5, 16, 0))), false, "weekend");
});
