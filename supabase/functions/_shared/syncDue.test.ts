import test from "node:test";
import assert from "node:assert/strict";
import { syncDue, activityTime } from "./syncDue.ts";

const MIN = 60 * 1000;
const STALE = 15 * MIN;
const at = (hhmm: string) => Date.parse(`2026-10-09T${hhmm}:00Z`);

test("a sale after the last sync rebuilds, however recent the sync", () => {
  // The owner's afternoon: put sold and synced at 19:48, shares sold 19:52,
  // Analysis opened 19:55.
  assert.equal(
    syncDue({ now: at("19:55"), syncedAt: at("19:48"), attemptedAt: at("19:48"), lastActivityAt: at("19:52"), staleAfterMs: STALE }),
    true
  );
});

test("nothing traded since a recent sync: served as stored", () => {
  assert.equal(
    syncDue({ now: at("19:55"), syncedAt: at("19:48"), attemptedAt: at("19:48"), lastActivityAt: at("19:40"), staleAfterMs: STALE }),
    false
  );
});

test("an attempt already made after the event is not repeated on every view", () => {
  // A failing sync: attempted 19:53, after the 19:52 sale, and never succeeded.
  assert.equal(
    syncDue({ now: at("19:55"), syncedAt: at("19:48"), attemptedAt: at("19:53"), lastActivityAt: at("19:52"), staleAfterMs: STALE }),
    false
  );
});

test("the clock rule still applies when the broker could not be asked", () => {
  assert.equal(syncDue({ now: at("20:10"), syncedAt: at("19:48"), attemptedAt: at("19:48"), staleAfterMs: STALE }), true);
  assert.equal(syncDue({ now: at("19:55"), syncedAt: at("19:48"), attemptedAt: at("19:48"), staleAfterMs: STALE }), false);
  assert.equal(syncDue({ now: at("19:55"), syncedAt: 0, attemptedAt: 0, staleAfterMs: STALE }), true);
});

test("activity times come from the fill, or from when an expiry was written", () => {
  assert.equal(activityTime({ transaction_time: "2026-10-09T19:52:33.1Z" }), Date.parse("2026-10-09T19:52:33.1Z"));
  assert.equal(activityTime({ date: "2026-08-21", created_at: "2026-08-22T02:40:23Z" }), Date.parse("2026-08-22T02:40:23Z"));
  assert.equal(activityTime(null), 0);
  assert.equal(activityTime({}), 0);
});
