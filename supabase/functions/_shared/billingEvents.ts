// Stripe events → the one row we keep.
//
// Pure: takes the event Stripe sent and returns either the subscriptions row
// to upsert, or null when the event carries nothing we store. The webhook
// function does the signature check and the database write around this; the
// mapping itself has no I/O so a wrong field name -- the class of bug that
// fails silently in production and nowhere else -- is caught by a test.

const unix = (n: unknown) => (typeof n === "number" && isFinite(n) ? new Date(n * 1000).toISOString() : null);

export type SubscriptionRow = {
  user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

// The user id travels on the Stripe objects we create: as client_reference_id
// and metadata.user_id on the checkout session, and as metadata.user_id on the
// subscription (set from the session at creation). Either is accepted; when
// neither is present the caller resolves the user from the customer id.
function userIdOf(obj: any): string | null {
  return obj?.metadata?.user_id || obj?.client_reference_id || null;
}

function fromSubscription(sub: any, now: Date): SubscriptionRow | null {
  if (!sub?.id) return null;
  const item = sub.items?.data?.[0];
  return {
    user_id: userIdOf(sub),
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null,
    stripe_subscription_id: sub.id,
    plan: item?.price?.metadata?.plan || sub.metadata?.plan || "live",
    status: String(sub.status || "incomplete"),
    // Stripe moved current_period_end onto the item in the 2025 API versions;
    // older payloads carry it on the subscription. Read both.
    current_period_end: unix(item?.current_period_end ?? sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end === true,
    updated_at: now.toISOString()
  };
}

// Returns { row } for an event that changes the stored plan, { row: null }
// for one that does not. checkout.session.completed is deliberately NOT a
// source of status: the subscription.created/updated event that follows it
// carries the authoritative status, and reading the session would mean
// storing 'active' for a session whose payment is still 'unpaid'.
export function rowForEvent(event: any, now = new Date()): { row: SubscriptionRow | null; reason: string } {
  const type = String(event?.type || "");
  const obj = event?.data?.object;
  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const row = fromSubscription(obj, now);
      return row ? { row, reason: type } : { row: null, reason: "no subscription id" };
    }
    // The invoice events do not carry the subscription's new status; Stripe
    // sends customer.subscription.updated alongside them with status past_due
    // or active. Acknowledged, not stored.
    case "invoice.payment_failed":
    case "invoice.paid":
    case "checkout.session.completed":
      return { row: null, reason: `${type} acknowledged; status arrives on the subscription event` };
    default:
      return { row: null, reason: `ignored ${type || "event without a type"}` };
  }
}
