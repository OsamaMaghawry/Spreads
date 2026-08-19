import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount } from "../_shared/alpaca.ts";
import { findSetup } from "../_shared/optionScan.ts";

// Scans the live chain and returns the delta-targeted setup for one strategy.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { accountId, ticker, strategy } = body;
    if (!accountId || !ticker || !strategy) {
      return jsonResponse({ error: "accountId, ticker and strategy are required" }, 400);
    }
    if (!["put_spread", "call_spread", "iron_condor"].includes(strategy)) {
      return jsonResponse({ error: "Unsupported strategy" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const result = await findSetup(account, { ...body, ticker: ticker.trim().toUpperCase() });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
