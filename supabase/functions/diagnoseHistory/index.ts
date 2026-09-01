// Why a trade-history sync refused to write, answered without a browser.
//
// Three accounts stopped syncing because reconstruction produced a loss beyond
// what the strikes can lose, and tradeHistory correctly refused to store it.
// The detail needed to find that defect already exists -- tradeHistory's audit
// mode returns it -- but only through a signed-in admin clicking a button.
// That put diagnosing a money-correctness bug behind a human being available.
//
// This is the same computation reachable from a server: it authenticates with
// the service role rather than a user session, reads the account directly, and
// returns the breaching records beside the lots that fed them. It writes
// nothing, ever.
//
// Service role ONLY. The anon key opens sendDigest deliberately; it must never
// open this, which returns one user's entire trading history.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch } from "../_shared/alpaca.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { reconstruct } from "../_shared/tradeReconstruction.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function loadAccountAsAdmin(admin, accountId) {
  const { data, error } = await admin
    .from("trading_accounts").select("*").eq("id", accountId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trading account not found");
  return {
    ...data,
    api_key: await decryptSecret(data.api_key),
    api_secret: await decryptSecret(data.api_secret),
    oauth_access_token: await decryptSecret(data.oauth_access_token)
  };
}

// Same feed tradeHistory reads, minus the strategy-prefix pass: a breach is an
// arithmetic defect, and the prefix only labels a row as spreads or wheel.
async function fetchActivities(account, base) {
  let activities: any[] = [];
  let pageToken = null;
  for (let i = 0; i < 100; i++) {
    const url = `${base}/account/activities?activity_types=FILL,OPEXP,OPASN,OPEXC&direction=desc&page_size=100` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
    const page = await alpacaFetch(url, account);
    if (!Array.isArray(page) || page.length === 0) break;
    activities = activities.concat(page);
    if (page.length < 100) break;
    pageToken = page[page.length - 1].id;
  }
  return activities;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!SERVICE_KEY || auth !== SERVICE_KEY) {
      return jsonResponse({ error: "service role required" }, 403);
    }

    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccountAsAdmin(admin, accountId);
    const base = tradingBase(account);
    const activities = await fetchActivities(account, base);

    const { records, stockLots, orphanedStockPL, breaches } =
      reconstruct(activities, {}, accountId);

    // Only the rows the breach is about, plus every lot naming the same
    // ticker. Returning the whole history would bury the two rows that matter.
    const tickersInBreach = new Set(
      (breaches || []).map((b: any) => String(b.short_symbol || "").slice(0, 3))
    );
    const near = (sym: string) =>
      [...tickersInBreach].some((t) => String(sym || "").startsWith(t));

    return jsonResponse({
      accountId,
      accountName: account.name,
      activityCount: activities.length,
      recordCount: records.length,
      lotCount: stockLots.length,
      orphanedStockPL,
      breaches,
      breachingRecords: records.filter((r: any) => near(r.short_symbol)),
      relatedLots: stockLots.filter((l: any) => near(l.ticker + "26")),
      // Everything the ticker filter may have missed, when a breach names a
      // symbol the heuristic cannot match -- better verbose than silent.
      allLots: stockLots.length <= 40 ? stockLots : undefined
    });
  } catch (error) {
    console.error("diagnoseHistory failed", error?.message || error);
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
