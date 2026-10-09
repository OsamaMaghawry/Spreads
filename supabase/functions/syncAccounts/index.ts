import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { syncAccountsFor } from "../_shared/accountSync.ts";

// Rebuilds the live picture for every account the caller owns: positions paired
// into structures, credit and risk per position, and totals that net a ticker's
// condors instead of double counting both wings. The work is in
// _shared/accountSync.ts, shared with the Claude connector.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    return jsonResponse(await syncAccountsFor(adminClient(), user.id));
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
