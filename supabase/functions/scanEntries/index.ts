import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { scanEntriesFor } from "../_shared/entryScan.ts";

// Sweeps multiple tickers across DTE / delta / width ranges and returns ranked
// setups, each flagged if the underlying reports earnings before it expires.
// The work is in _shared/entryScan.ts, shared with the Claude connector.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const r = await scanEntriesFor(adminClient(), user.id, body);
    return jsonResponse(r.body, r.status);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
