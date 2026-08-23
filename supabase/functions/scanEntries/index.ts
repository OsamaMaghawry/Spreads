import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount } from "../_shared/alpaca.ts";
import { scanCandidates } from "../_shared/optionScan.ts";
import { earningsThrough, daysUntil } from "../_shared/earnings.ts";

// Sweeps multiple tickers across DTE / delta / width ranges and returns ranked
// setups, each flagged if the underlying reports earnings before it expires.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { accountId, tickers, strategy } = body;
    if (!accountId || !Array.isArray(tickers) || tickers.length === 0 || !strategy) {
      return jsonResponse({ error: "accountId, tickers[] and strategy are required" }, 400);
    }
    if (!["put_spread", "call_spread", "iron_condor"].includes(strategy)) {
      return jsonResponse({ error: "Unsupported strategy" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const result = await scanCandidates(account, body);

    // Annotate rather than filter: an earnings release inside the holding
    // period is a risk the trader should see and decide on, not one the
    // software should quietly make for them.
    const candidates = result.candidates || [];
    if (candidates.length > 0) {
      const latestExpiry = candidates.reduce((a, c) => (c.expiry > a ? c.expiry : a), candidates[0].expiry);
      const calendar = await earningsThrough(admin, [...new Set(candidates.map((c) => c.ticker))], latestExpiry);

      for (const c of candidates) {
        const event = calendar[c.ticker];
        // Only a report that lands on or before expiry is held through.
        if (event && event.reportDate <= c.expiry) {
          c.earnings = {
            date: event.reportDate,
            session: event.session,
            daysAway: daysUntil(event.reportDate)
          };
        }
      }
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
