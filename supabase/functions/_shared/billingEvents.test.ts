import test from "node:test";
import assert from "node:assert/strict";
import { rowForEvent } from "./billingEvents.ts";

const now = new Date("2026-09-15T14:00:00Z");
const sub = (over: any = {}) => ({
  id: "sub_123",
  customer: "cus_9",
  status: "trialing",
  cancel_at_period_end: false,
  metadata: { user_id: "user-uuid" },
  items: { data: [{ current_period_end: 1760000000, price: { id: "price_m", metadata: { plan: "live" } } }] },
  ...over
});
const ev = (type: string, object: any) => ({ type, data: { object } });

test("subscription.created maps to a row with the user, status and period end", () => {
  const { row } = rowForEvent(ev("customer.subscription.created", sub()), now);
  assert.ok(row);
  assert.equal(row.user_id, "user-uuid");
  assert.equal(row.stripe_customer_id, "cus_9");
  assert.equal(row.stripe_subscription_id, "sub_123");
  assert.equal(row.status, "trialing");
  assert.equal(row.plan, "live");
  assert.equal(row.current_period_end, "2025-10-09T08:53:20.000Z");
  assert.equal(row.cancel_at_period_end, false);
});

test("period end on the subscription itself is read when the item has none", () => {
  const s = sub({ items: { data: [{ price: { id: "price_m" } }] }, current_period_end: 1760000000 });
  const { row } = rowForEvent(ev("customer.subscription.updated", s), now);
  assert.equal(row?.current_period_end, "2025-10-09T08:53:20.000Z");
});

test("deleted carries status canceled through unchanged", () => {
  const { row } = rowForEvent(ev("customer.subscription.deleted", sub({ status: "canceled" })), now);
  assert.equal(row?.status, "canceled");
});

test("an expanded customer object still yields the customer id", () => {
  const { row } = rowForEvent(ev("customer.subscription.updated", sub({ customer: { id: "cus_obj" } })), now);
  assert.equal(row?.stripe_customer_id, "cus_obj");
});

test("no user id on the object leaves user_id null for the caller to resolve", () => {
  const { row } = rowForEvent(ev("customer.subscription.updated", sub({ metadata: {} })), now);
  assert.equal(row?.user_id, null);
});

test("checkout.session.completed and invoice events store nothing", () => {
  assert.equal(rowForEvent(ev("checkout.session.completed", { id: "cs_1", payment_status: "unpaid" }), now).row, null);
  assert.equal(rowForEvent(ev("invoice.payment_failed", { id: "in_1" }), now).row, null);
  assert.equal(rowForEvent(ev("invoice.paid", { id: "in_1" }), now).row, null);
});

test("unknown events are ignored, not thrown", () => {
  const r = rowForEvent(ev("charge.refunded", {}), now);
  assert.equal(r.row, null);
  assert.match(r.reason, /ignored/);
  assert.equal(rowForEvent(undefined as any, now).row, null);
});

test("a subscription event without an id is refused rather than stored blank", () => {
  assert.equal(rowForEvent(ev("customer.subscription.updated", {}), now).row, null);
});
