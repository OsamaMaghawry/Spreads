import test from "node:test";
import assert from "node:assert/strict";
import { liveAllowed } from "./entitlement.ts";

const now = new Date("2026-09-15T14:00:00Z");
const later = "2026-10-01T00:00:00Z";
const earlier = "2026-09-01T00:00:00Z";

test("enforcement off: everyone may open live, with or without a row", () => {
  assert.equal(liveAllowed({ subscription: null, enforced: false, now }), true);
  assert.equal(liveAllowed({ subscription: { status: "canceled" }, enforced: false, now }), true);
});

test("enforcement on and no row: refused", () => {
  assert.equal(liveAllowed({ subscription: null, enforced: true, now }), false);
  assert.equal(liveAllowed({ subscription: undefined, enforced: true, now }), false);
});

test("active and trialing are entitled", () => {
  assert.equal(liveAllowed({ subscription: { status: "active" }, enforced: true, now }), true);
  assert.equal(liveAllowed({ subscription: { status: "trialing" }, enforced: true, now }), true);
});

test("past_due keeps entitlement until the paid period ends, not after", () => {
  assert.equal(liveAllowed({ subscription: { status: "past_due", current_period_end: later }, enforced: true, now }), true);
  assert.equal(liveAllowed({ subscription: { status: "past_due", current_period_end: earlier }, enforced: true, now }), false);
  assert.equal(liveAllowed({ subscription: { status: "past_due" }, enforced: true, now }), false);
});

test("canceled, unpaid, incomplete and paused are refused", () => {
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(liveAllowed({ subscription: { status, current_period_end: later }, enforced: true, now }), false, status);
  }
});

test("a grandfathered user is entitled until the date, whatever Stripe says", () => {
  assert.equal(liveAllowed({ subscription: { status: "canceled", grandfathered_until: later }, enforced: true, now }), true);
  assert.equal(liveAllowed({ subscription: { status: "canceled", grandfathered_until: earlier }, enforced: true, now }), false);
});
