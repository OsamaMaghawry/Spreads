// Starts a Stripe Checkout for the Live plan and returns the page to send the user to.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { stripeClient, appUrl, customerFor } from "../_shared/stripe.ts";
import { readSettings } from "../_shared/settings.ts";

// The card is entered on Stripe's hosted page, never on ours. What this
// function decides is only which price and which customer; the amount lives
// in the Stripe dashboard, so a price change is never a deploy.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // No card is taken while the payment surface is off. Checked here rather
    // than only in the browser, because a hidden button is not a control.
    if (!(await readSettings(adminClient())).billingVisible) {
      return jsonResponse({ error: "Plans are not open yet." }, 403);
    }

    const { interval } = await req.json().catch(() => ({}));
    const price = interval === "annual" ? Deno.env.get("STRIPE_PRICE_ANNUAL") : Deno.env.get("STRIPE_PRICE_MONTHLY");
    if (!price) return jsonResponse({ error: "Billing is not configured on this environment (price id)." }, 503);

    const stripe = stripeClient();
    const admin = adminClient();
    const customer = await customerFor(stripe, admin, user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        // 30 days free is the offer on the page; the trial is Stripe's, not
        // a flag of ours, so the invoice and the portal both say the same.
        trial_period_days: 30,
        metadata: { user_id: user.id, plan: "live" }
      },
      metadata: { user_id: user.id, plan: "live" },
      success_url: `${appUrl()}/billing?checkout=success`,
      cancel_url: `${appUrl()}/billing?checkout=cancelled`
    });
    return jsonResponse({ url: session.url });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
