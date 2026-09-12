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
// from anon and authenticated, so nothing sensitive crosses the wire.
//
// WHO MAY CAPTURE. Until this check existed, any valid project key could name
// any account id and this function would decrypt that account's credentials
// and pull its whole trade history -- the one function on the money path that
// reached trading_accounts without a user_id filter. The caller must now be
// signed in, and must either own the account or be an administrator; an
// administrator is allowed because a support capture on someone else's account
// is the reason the function exists, and that access is already the one the
// back-office holds.
//
// The Alpaca calls are inlined rather than imported from _shared/alpaca.ts:
// that module re-exports the OCC parser and the spread pairer, which would drag
// the whole reconstruction chain into a function that only needs one
// authenticated GET.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { isAdminUser } from "../_shared/admin.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
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
    const { accountId, ticket } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();

    // A PLATFORM CAPTURE, alongside the signed-in one.
    //
    // Three production accounts stopped syncing on the impossible-result
    // guard, and diagnosing that needs the exact feed -- which is why this
    // function exists. But capturing it needed a signed-in session, and the
    // maintenance path has none: a scheduled job, or an operator working
    // through the database, holds the service role and no user.
    //
    // So a single-use ticket minted inside the database authorises it too,
    // the same mechanism the equity rebuild uses. It cannot be forged by
    // anything holding the published anon key -- `cron_tickets` and
    // `mint_cron_ticket` are revoked from anon and authenticated -- and it is
    // spent on redemption. Nothing about what this function DOES widens: it
    // still only reads a broker feed into a table revoked from the browser.
    const byTicket = await redeemCronTicket(admin, ticket, "broker_feed_dump");

    let user: any = null;
    if (!byTicket) {
      user = await requireUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data, error } = await admin
      .from("trading_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!byTicket) {
      // Same answer for "no such account" and "not yours" — which of the two
      // it is would tell an unauthorised caller that the id is real.
      const owned = !!data && data.user_id === user.id;
      if (!owned && !(data && (await isAdminUser(user, admin)).isAdmin)) {
        return jsonResponse({ error: "account not found" }, 404);
      }
    }
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

    // Positions and working orders, captured beside the activities.
    //
    // The dashboard reads positions live on every load and stores nothing, so
    // when a trader reports a position the broker shows and the app does not,
    // there was no way to tell whether the broker sent it. Now there is.
    // Failures here do not lose the activity capture, which is what this
    // function existed for first.
    const positions = await get(`${base}/positions`, account).catch(() => null);
    const openOrders = await get(`${base}/orders?status=open&nested=true&limit=100`, account).catch(() => null);

    // The filled orders, byte for byte the request syncAccounts makes.
    //
    // This is the PROVENANCE, not another view of the same holdings: the
    // pairing groups legs by the ticket that filled them, so a dump without it
    // regroups by shape and produces a grouping production never produced.
    // Replaying such a fixture debugs the capture rather than the account. The
    // query string is kept identical to syncAccounts on purpose — a different
    // limit or direction is a different set of orders and therefore a
    // different grouping.
    const filledOrders = await get(
      `${base}/orders?status=closed&nested=true&limit=200&direction=desc`,
      account
    ).catch(() => null);

    await admin.from("broker_feed_dumps").insert({
      account_id: accountId,
      activities,
      activity_count: activities.length,
      positions,
      position_count: Array.isArray(positions) ? positions.length : null,
      open_orders: openOrders,
      filled_orders: filledOrders,
      filled_order_count: Array.isArray(filledOrders) ? filledOrders.length : null
    });

    return jsonResponse({
      ok: true,
      accountId,
      activityCount: activities.length,
      positionCount: Array.isArray(positions) ? positions.length : null,
      openOrderCount: Array.isArray(openOrders) ? openOrders.length : null,
      filledOrderCount: Array.isArray(filledOrders) ? filledOrders.length : null
    });
  } catch (error) {
    console.error("dumpBrokerFeed failed", error?.message || error);
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
