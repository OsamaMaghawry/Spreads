// Receives Stripe's signed subscription events and keeps one row per user current.
import Stripe from "npm:stripe@17";
import { adminClient } from "../_shared/supabaseClients.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { rowForEvent } from "../_shared/billingEvents.ts";

// This endpoint runs with verify_jwt off (see supabase/config.toml): Stripe
// holds no Supabase token. Its authentication is the signature Stripe puts on
// every delivery, checked against STRIPE_WEBHOOK_SECRET before the body is
// believed. An unsigned or mis-signed request is refused with 400 and writes
// nothing. This is the only writer of the subscriptions table.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return new Response("Webhook not configured", { status: 400 });

  let event: any;
  try {
    const stripe = stripeClient();
    const raw = await req.text();
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, Stripe_cryptoProvider());
  } catch (e) {
    return new Response(`Signature check failed: ${e instanceof Error ? e.message : String(e)}`, { status: 400 });
  }

  const { row, reason } = rowForEvent(event);
  if (!row) return Response.json({ received: true, stored: false, reason });

  const admin = adminClient();
  // A subscription created from Checkout carries metadata.user_id; one
  // created in the Stripe dashboard may not. Resolve from the customer we
  // tagged at creation, then from an existing row, before giving up.
  let userId = row.user_id;
  if (!userId && row.stripe_customer_id) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", row.stripe_customer_id).maybeSingle();
    userId = data?.user_id || null;
    if (!userId) {
      try {
        const c: any = await stripeClient().customers.retrieve(row.stripe_customer_id);
        userId = c?.metadata?.user_id || null;
      } catch { /* resolved below as unmatched */ }
    }
  }
  if (!userId) return Response.json({ received: true, stored: false, reason: "no user for this customer" });

  const { error } = await admin.from("subscriptions").upsert(
    { ...row, user_id: userId },
    { onConflict: "user_id" }
  );
  if (error) return new Response(`Could not store: ${error.message}`, { status: 500 });
  return Response.json({ received: true, stored: true, status: row.status });
});

// Deno has SubtleCrypto; Stripe's default provider expects Node's crypto.
function Stripe_cryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}
