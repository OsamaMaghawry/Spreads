import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { readChainFor } from "../_shared/chainRead.ts";

// The option chain for one underlying, as a ladder, with what the account
// holds of it. The work is in _shared/chainRead.ts, shared with the Claude
// connector.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const r = await readChainFor(adminClient(), user.id, await req.json());
    return jsonResponse(r.body, r.status);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
