import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { fetchProviderWindow } from "../_shared/earnings.ts";

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

    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const events = await fetchProviderWindow(from, to);
    if (events.length === 0) return jsonResponse({ from, to, upserted: 0 });

    // Chunked so one oversized payload cannot fail the whole refresh.
    let upserted = 0;
    for (let i = 0; i < events.length; i += 500) {
      const rows = events.slice(i, i + 500).map((e) => ({
        symbol: e.symbol,
        report_date: e.reportDate,
        session: e.session,
        fetched_at: new Date().toISOString()
      }));
      const { error } = await admin
        .from("earnings_calendar")
        .upsert(rows, { onConflict: "symbol,report_date" });
      if (error) throw new Error(error.message);
      upserted += rows.length;
    }

    return jsonResponse({ from, to, upserted });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
