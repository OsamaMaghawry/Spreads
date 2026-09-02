import Stripe from "npm:stripe@17";

// One Stripe client per function invocation, built from the secret the owner
// sets on the project. Absent secret → a clear error at the call site rather
// than an authentication failure three layers down.
export function stripeClient() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Billing is not configured on this environment (STRIPE_SECRET_KEY).");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as any, httpClient: Stripe.createFetchHttpClient() });
}

// Where Checkout and the portal send the user back. The app, not the
// marketing site: a returning subscriber lands on the billing screen that
// shows what they just bought.
export function appUrl() {
  return (Deno.env.get("APP_URL") || "https://dashboard.deltamint.app").replace(/\/$/, "");
}

// Find the customer already tied to this user, or create one that is. The
// user id goes onto the customer's metadata so a webhook can always resolve
// the row even if a subscription object arrives without it.
export async function customerFor(stripe: Stripe, admin: any, user: { id: string; email?: string | null }) {
  const { data: row } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (row?.stripe_customer_id) return row.stripe_customer_id as string;
  const existing = await stripe.customers.search({ query: `metadata['user_id']:'${user.id}'`, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.customers.create({ email: user.email || undefined, metadata: { user_id: user.id } });
  return created.id;
}
