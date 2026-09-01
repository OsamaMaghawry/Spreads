// Captures a broker activity feed so a refused sync can be diagnosed off-box.
//
// Three accounts stopped syncing because reconstruction computed a loss beyond
// what the strikes can lose, and the write guard correctly refused to store it.
// Finding that defect needs the exact feed that produced it -- and reaching the
// feed needs the credential decryption key, which lives only in an edge
// function's environment. So this fetches and stores; the analysis then runs
// against the stored copy, where the pure reconstruction can be re-run as often
// as it takes without redeploying anything.
//
// It found the real one: two put spreads sharing a long strike, closed by a
// single exercise of that shared long, with the whole share loss landing on one
// of them.
//
// Returns counts only. The feed goes to broker_feed_dumps, which is revoked
// from anon and authenticated, so nothing sensitive crosses the wire even
// though any valid project key can trigger a capture.
//
// The Alpaca calls are inlined rather than imported from _shared/alpaca.ts:
// that module re-exports the OCC parser and the spread pairer, which would drag
// the whole reconstruction chain into a function that only needs one
// authenticated GET.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { decryptSecret } from "../_shared/crypto.ts";

const tradingBase = (account: any) =>
  account.is_paper ? "https://paper-api.alpaca.markets/v2" : "https://api.alpaca.markets/v2";

const authHeaders = (account: any) =>
  account.oauth_access_token
    ? { Authorization: `Bearer ${account.oauth_access_token}`, "Content-Type": "application/json" }
    : {
        "APCA-API-KEY-ID": account.api_key,
        "APCA-API-SECRET-KEY": account.api_secret,
        "Content-Type": "application/json"
      };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, account: any, retries = 4) {
  let lastErr: any = null;
  for (let i = 0; i <= retries; i++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: authHeaders(account) });
    } catch (e) {
      lastErr = e;
      await wait(600 * (i + 1));
      continue;
    }
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("retry-after") || "0");
      lastErr = new Error("Alpaca rate limit");
      await wait(retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 1000 * Math.pow(2, i)));
      continue;
    }
    lastErr = new Error(`Alpaca ${res.status}: ${text}`);
    if (res.status < 500) throw lastErr;
    await wait(600 * (i + 1));
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const { data, error } = await admin
      .from("trading_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonResponse({ error: "account not found" }, 404);

    const account = {
      ...data,
      api_key: await decryptSecret(data.api_key),
      api_secret: await decryptSecret(data.api_secret),
      oauth_access_token: await decryptSecret(data.oauth_access_token)
    };
    const base = tradingBase(account);

    // The same request tradeHistory makes, read to the end of the feed: a
    // partial capture would reconstruct differently from the real sync, which
    // would make the diagnosis worthless.
    let activities: any[] = [];
    let pageToken: any = null;
    for (let i = 0; i < 100; i++) {
      const url =
        `${base}/account/activities?activity_types=FILL,OPEXP,OPASN,OPEXC&direction=desc&page_size=100` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
      const page = await get(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      activities = activities.concat(page);
      if (page.length < 100) break;
      pageToken = page[page.length - 1].id;
    }

    await admin.from("broker_feed_dumps").insert({
      account_id: accountId,
      activities,
      activity_count: activities.length
    });

    return jsonResponse({ ok: true, accountId, activityCount: activities.length });
  } catch (error) {
    console.error("dumpBrokerFeed failed", error?.message || error);
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
