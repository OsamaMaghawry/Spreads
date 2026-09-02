// Who may open a position on a live account.
//
// One question, one answer, and the answer is pure so it can be tested
// without Stripe or a database: given the user's subscription row (or none),
// whether the owner has switched enforcement on, and the time, may this user
// open a live position right now?
//
// What is deliberately NOT here: any notion of gating a close, a cancel, a
// quote, a sync or a paper order. A user must always be able to see and get
// out of what they hold, whatever their plan, and the only way to keep that
// true is for this module to answer only the opening question.

export type Subscription = {
  status?: string | null;
  current_period_end?: string | null;
  grandfathered_until?: string | null;
} | null | undefined;

// Stripe statuses that mean "paid up or inside the free trial".
const ENTITLED = new Set(["active", "trialing"]);

export function liveAllowed({ subscription, enforced, now = new Date() }: {
  subscription: Subscription; enforced: boolean; now?: Date;
}): boolean {
  // The switch is off: nothing is gated. This is the state the product ships
  // in and stays in until the owner flips it in Admin.
  if (!enforced) return true;
  if (!subscription) return false;

  const t = now.getTime();
  const gf = subscription.grandfathered_until ? Date.parse(subscription.grandfathered_until) : NaN;
  if (isFinite(gf) && gf > t) return true;

  const status = String(subscription.status || "");
  if (ENTITLED.has(status)) return true;

  // Card failed; Stripe is retrying. The user keeps what they paid for until
  // the period they paid for ends -- cutting them off mid-period for a bank's
  // hiccup is not a policy anyone would defend to a customer.
  if (status === "past_due") {
    const end = subscription.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
    return isFinite(end) && end > t;
  }
  return false;
}

// The wrapper the functions call. Reads the two inputs and hands them to the
// pure function above; never decides anything itself.
export async function liveAllowedFor(admin: any, userId: string): Promise<boolean> {
  const [{ data: sub }, { data: setting }] = await Promise.all([
    admin.from("subscriptions").select("status, current_period_end, grandfathered_until").eq("user_id", userId).maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "billing_enforced").maybeSingle()
  ]);
  return liveAllowed({ subscription: sub, enforced: setting?.value === true });
}

// The refusal, worded once so both open paths say the same thing. It names
// what still works, because the reader has money on the screen.
export const UPGRADE_MESSAGE =
  "Live orders need the Live plan. This order was not sent. You can still close, cancel, price and export everything in this account, and open positions on your paper account.";
