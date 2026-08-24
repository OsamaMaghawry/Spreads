import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { refreshEarningsWindow } from "../_shared/earnings.ts";

// Refreshes the cached earnings calendar for the next 90 days from the provider.
//
// Safe to run repeatedly: rows are upserted on (symbol, report_date), so a
// re-run corrects dates the provider has since moved. Intended to be called on
// a daily schedule; it is admin-gated so a signed-in user cannot spend the
// provider quota.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

    const result = await refreshEarningsWindow(admin);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
