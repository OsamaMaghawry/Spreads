// Opens Stripe's customer portal so a subscriber can change card, switch interval or cancel.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { stripeClient, appUrl } from "../_shared/stripe.ts";
import { readSettings } from "../_shared/settings.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const admin = adminClient();
    // The switch is server truth, not a hidden nav item: while the payment
    // surface is off there is no route to Stripe from here at all.
    if (!(await readSettings(admin)).billingVisible) {
      return jsonResponse({ error: "Plans are not open yet." }, 403);
    }
    const { data: row } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!row?.stripe_customer_id) return jsonResponse({ error: "No billing account yet — choose a plan first." }, 404);
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${appUrl()}/billing`
    });
    return jsonResponse({ url: session.url });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
