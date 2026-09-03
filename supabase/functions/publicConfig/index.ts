// The operator switches a signed-in customer's browser legitimately needs.
//
// app_settings denies every client role, and adminData is gated to
// administrators, so until now no switch could change what a customer sees.
// billing_visible has to: it decides whether the payment surface exists at
// all, and the nav renders long before anything else is fetched.
//
// Deliberately one key and not a passthrough of readSettings(). manual_api_keys
// and billing_enforced are operator concerns and stay invisible; widening this
// to "return the settings" would leak the next switch somebody adds without
// anyone deciding to.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { readSettings } from "../_shared/settings.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Signed in, but no role required: every customer gets the same answer.
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const { billingVisible } = await readSettings(adminClient());
    return jsonResponse({ billingVisible });
  } catch (e) {
    // A failed read must not open the payment surface: the closed answer is
    // the safe one, and the caller renders as though billing does not exist.
    console.error("publicConfig failed", e instanceof Error ? e.message : e);
    return jsonResponse({ billingVisible: false });
  }
});
