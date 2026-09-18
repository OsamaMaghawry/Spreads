// SnapTrade, held against what this product actually needs.
//
// One connection layer in front of many brokers is either a large saving or a
// middleman on the money path, and the difference is decided by capabilities
// that can be measured rather than argued about. This function measures them:
// it signs real requests with the project's own keys, asks their API every
// question the product would have to ask in production, and records what came
// back -- status, latency, row counts and a redacted sample of each answer.
//
// ADMIN ONLY, and that is not incidental. It registers users on a third-party
// platform, returns a connection portal link, and can preview an order. None
// of that is a thing a customer's session may do on somebody else's behalf.
//
// NOTHING HERE FEEDS A NUMBER THE PRODUCT SHOWS. No position, balance or
// result read through SnapTrade reaches the dashboard, the Analysis page or
// the weekly email. It is an evaluation, kept at arm's length until it earns
// its place.
//
// ORDER PLACEMENT IS DOUBLE-LOCKED. See `place` at the bottom: a plainly
// simulated account, and an explicit confirmation token in the body. An
// evaluation must never be the reason a real order reaches a real account.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";
import { snapFetch, snapCredentials, type SnapCall } from "../_shared/snaptrade.ts";
import {
  redact,
  brokerMatrix,
  verdicts,
  looksPaper,
  type ProbeResult
} from "../_shared/snaptradeShape.ts";

// ---------------------------------------------------------------------------
// One probe
// ---------------------------------------------------------------------------

const rowsOf = (data: unknown): number | null => {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    for (const key of ["data", "results", "orders", "accounts", "positions", "option_positions"]) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v.length;
    }
  }
  return null;
};

// A sample small enough to store and read, large enough to show the shape.
// One element of a list is what answers "how does an option position come
// back"; the whole list answers nothing extra and fills the record.
const sampleOf = (data: unknown): unknown => {
  if (Array.isArray(data)) return data.length ? redact(data[0]) : [];
  return redact(data);
};

async function probe(name: string, need: string, call: SnapCall): Promise<ProbeResult> {
  const res = await snapFetch(call);
  return {
    name,
    need,
    method: call.method || "GET",
    path: call.path,
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    error: res.error,
    count: rowsOf(res.data),
    sample: res.ok ? sampleOf(res.data) : redact(res.data)
  };
}

// ---------------------------------------------------------------------------
// The SnapTrade user behind one of ours
// ---------------------------------------------------------------------------
//
// Their userSecret is issued once at registration and never shown again: lose
// it and every connection that user made is unreachable. So it is written
// encrypted, in the same envelope as every other broker credential, before the
// function returns anything at all.

interface SnapUser {
  snapTradeUserId: string;
  userSecret: string;
  created: boolean;
}

async function loadSnapUser(admin: any, userId: string): Promise<SnapUser | null> {
  const { data, error } = await admin
    .from("snaptrade_users")
    .select("snaptrade_user_id, user_secret")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const secret = await decryptSecret(data.user_secret);
  // A stored secret that will not decrypt is the same situation as no user at
  // all -- nothing can be signed for them -- and saying so names the fix
  // (resetUser) rather than failing later as an unexplained 401 from SnapTrade.
  if (!secret) {
    throw new Error(
      "The stored SnapTrade user secret could not be decrypted, so nothing can be signed for this user. " +
      "Run the resetUser action to delete and re-register."
    );
  }
  return { snapTradeUserId: data.snaptrade_user_id, userSecret: secret, created: false };
}

async function ensureSnapUser(
  admin: any,
  userId: string
): Promise<{ user: SnapUser | null; error: string | null }> {
  const existing = await loadSnapUser(admin, userId);
  if (existing) return { user: existing, error: null };

  // Their user id must be unique and immutable, so it is our uuid and nothing
  // else -- an email would change, and a changed id orphans every connection.
  const res = await snapFetch<{ userId?: string; userSecret?: string }>({
    path: "/snapTrade/registerUser",
    method: "POST",
    body: { userId }
  });
  if (!res.ok) {
    return {
      user: null,
      error:
        `SnapTrade would not register this user (${res.status}): ${res.error}. ` +
        `If it says the user already exists, a previous attempt registered them and the secret was not stored; ` +
        `run the "resetUser" action to delete and re-register.`
    };
  }
  const secret = res.data?.userSecret;
  if (!secret) {
    return { user: null, error: "SnapTrade registered the user but returned no userSecret, so nothing could be stored." };
  }

  const { error } = await admin.from("snaptrade_users").insert({
    user_id: userId,
    snaptrade_user_id: String(res.data?.userId || userId),
    user_secret: await encryptSecret(secret)
  });
  if (error) throw new Error(error.message);

  return { user: { snapTradeUserId: String(res.data?.userId || userId), userSecret: secret, created: true }, error: null };
}

// ---------------------------------------------------------------------------
// The full probe
// ---------------------------------------------------------------------------

async function runProbe(admin: any, userId: string) {
  const probes: ProbeResult[] = [];
  const notes: string[] = [];

  // --- what they are, before any user exists -------------------------------
  probes.push(await probe("api status", "Is their API up, and does our signature authenticate?", { path: "/" }));
  probes.push(await probe("partner info", "What does our own client id allow: data, trading, which brokers?", { path: "/snapTrade/partners" }));

  const brokerages = await probe("brokerages", "How many brokers, and how many can place an order?", { path: "/brokerages" });
  probes.push(brokerages);

  // The matrix needs the WHOLE list, and the probe above deliberately keeps
  // only one row as a sample. So it is fetched once more, unsampled, rather
  // than making every probe carry its full body into the record.
  let matrixOut = null as ReturnType<typeof brokerMatrix> | null;
  if (brokerages.ok) {
    const full = await snapFetch({ path: "/brokerages" });
    if (full.ok) matrixOut = brokerMatrix(full.data);
  }

  probes.push(await probe("connection types", "Which brokers connect by OAuth and which want a password?", { path: "/brokerageAuthorizationTypes" }));

  // --- the user, and what they have connected ------------------------------
  const { user, error: userError } = await ensureSnapUser(admin, userId);
  if (!user) {
    notes.push(userError || "No SnapTrade user, so nothing account-shaped could be asked.");
    return { probes, matrix: matrixOut, verdicts: verdicts(probes, matrixOut), notes, accounts: [] };
  }
  if (user.created) notes.push("A SnapTrade user was registered for this admin during this run.");

  const scoped = { userId: user.snapTradeUserId, userSecret: user.userSecret };

  probes.push(await probe("connections", "What has this user connected, and is the connection still alive?", { path: "/authorizations", ...scoped }));

  const accountsProbe = await probe("accounts", "Do accounts arrive with enough identity to match our own records?", { path: "/accounts", ...scoped });
  probes.push(accountsProbe);

  // --- everything that needs a connected account ---------------------------
  const accountsRes = await snapFetch<Record<string, unknown>[]>({ path: "/accounts", ...scoped });
  const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
  const summary = accounts.map((a) => ({
    id: String(a.id ?? ""),
    name: String(a.name ?? ""),
    number: a.number ? "[redacted]" : null,
    institution: String(a.institution_name ?? ""),
    paper: looksPaper(String(a.institution_name ?? ""), String(a.name ?? ""))
  }));

  if (!accounts.length) {
    notes.push(
      "No brokerage account is connected to this SnapTrade user, so positions, orders, activities and quotes were " +
      "not asked. Use the Connect button, link a broker in their portal, then run this again."
    );
    return { probes, matrix: matrixOut, verdicts: verdicts(probes, matrixOut), notes, accounts: summary };
  }

  const id = String(accounts[0].id);
  notes.push(`Account-scoped probes ran against "${summary[0].institution} — ${summary[0].name}".`);

  probes.push(await probe("balances", "Does cash arrive per currency, the way the dashboard needs it?", { path: `/accounts/${id}/balances`, ...scoped }));
  probes.push(await probe("positions", "Do share lots arrive with quantity and average price?", { path: `/accounts/${id}/positions`, ...scoped }));
  probes.push(await probe("option positions", "Are options returned as options — strike, expiry, right?", { path: `/accounts/${id}/options`, ...scoped }));
  probes.push(await probe("orders (90 days)", "How far back does order history go, and do multi-leg orders keep their legs?", { path: `/accounts/${id}/orders`, query: { days: 90 }, ...scoped }));
  probes.push(await probe("recent orders", "Is there a fast path for an order placed seconds ago?", { path: `/accounts/${id}/recentOrders`, ...scoped }));
  probes.push(await probe("activities", "Do assignments, expiries and dividends arrive as their own events?", { path: `/accounts/${id}/activities`, ...scoped }));
  probes.push(await probe("quotes", "Is there a usable price, or must a data feed come from elsewhere?", { path: `/accounts/${id}/quotes`, query: { symbols: "AAPL", use_ticker: true }, ...scoped }));

  return { probes, matrix: matrixOut, verdicts: verdicts(probes, matrixOut), notes, accounts: summary };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (gate.response) return gate.response;
  const admin = gate.admin!;
  const userId = gate.user!.id;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");
    const creds = snapCredentials();

    // Every action needs the keys, so the refusal is one place and says
    // exactly what to do rather than failing later as a 401 from them.
    if (!creds && action !== "status") {
      return jsonResponse({
        error:
          "SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are not set on this project. " +
          "Add them under Edge Functions → Secrets in the Supabase dashboard; they are never sent anywhere else."
      }, 400);
    }

    switch (action) {
      // ---------------------------------------------------------------- status
      case "status": {
        if (!creds) {
          return jsonResponse({
            configured: false,
            message:
              "SnapTrade keys are not set on this project. Add SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY " +
              "under Edge Functions → Secrets, then press Run the probe."
          });
        }
        const [status, partner] = await Promise.all([
          snapFetch({ path: "/" }),
          snapFetch({ path: "/snapTrade/partners" })
        ]);
        return jsonResponse({
          configured: true,
          // The client id identifies us to them and is not a secret; the
          // consumer key is, and is never returned.
          clientId: creds.clientId,
          api: { ok: status.ok, status: status.status, ms: status.ms, error: status.error, body: redact(status.data) },
          partner: { ok: partner.ok, status: partner.status, error: partner.error, body: redact(partner.data) }
        });
      }

      // ------------------------------------------------------------ brokerages
      case "brokerages": {
        const res = await snapFetch({ path: "/brokerages" });
        if (!res.ok) return jsonResponse({ error: `${res.status}: ${res.error}` }, 502);
        return jsonResponse({ matrix: brokerMatrix(res.data) });
      }

      // --------------------------------------------------------------- connect
      case "connect": {
        const { user, error } = await ensureSnapUser(admin, userId);
        if (!user) return jsonResponse({ error }, 502);
        const res = await snapFetch<{ redirectURI?: string }>({
          path: "/snapTrade/login",
          method: "POST",
          userId: user.snapTradeUserId,
          userSecret: user.userSecret,
          // `broker` narrows the portal to one institution when asked for;
          // absent, the user picks from the whole list, which is the thing
          // being evaluated.
          body: {
            ...(body?.broker ? { broker: String(body.broker) } : {}),
            immediateRedirect: false
          }
        });
        if (!res.ok) return jsonResponse({ error: `${res.status}: ${res.error}` }, 502);
        return jsonResponse({
          // Expires in five minutes on their side, so it is fetched fresh per
          // click rather than cached anywhere.
          url: res.data?.redirectURI || null,
          registered: user.created
        });
      }

      // ------------------------------------------------------------- resetUser
      case "resetUser": {
        // The recovery for a half-finished registration: their side has the
        // user, we have no secret, and nothing can be signed for them. Deletes
        // on their side and forgets our row; the next connect registers again.
        const existing = await loadSnapUser(admin, userId);
        const res = await snapFetch({
          path: "/snapTrade/deleteUser",
          method: "DELETE",
          query: { userId: existing?.snapTradeUserId || userId }
        });
        await admin.from("snaptrade_users").delete().eq("user_id", userId);
        return jsonResponse({ deleted: res.ok, status: res.status, error: res.error });
      }

      // ----------------------------------------------------------------- probe
      case "probe": {
        const report = await runProbe(admin, userId);
        const stored = {
          ranAt: new Date().toISOString(),
          clientId: creds!.clientId,
          ...report
        };
        // Recorded before it is returned. An evaluation nobody can read back
        // later is an opinion; this makes it a record.
        const { error } = await admin.from("snaptrade_probes").insert({ ran_by: userId, report: stored });
        if (error) console.error(`snaptrade: probe not recorded: ${error.message}`);
        return jsonResponse(stored);
      }

      // --------------------------------------------------------------- history
      case "history": {
        const { data, error } = await admin
          .from("snaptrade_probes")
          .select("id, ran_at, report")
          .order("ran_at", { ascending: false })
          .limit(10);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ runs: data || [] });
      }

      // ---------------------------------------------------------------- impact
      case "impact": {
        // A preview. It places nothing, and it is the only order-shaped call
        // that runs without the paper gate below — because there is no order.
        const user = await loadSnapUser(admin, userId);
        if (!user) return jsonResponse({ error: "No SnapTrade user yet. Connect a broker first." }, 400);
        const res = await snapFetch({
          path: "/trade/impact",
          method: "POST",
          userId: user.snapTradeUserId,
          userSecret: user.userSecret,
          body: body?.order ?? {}
        });
        return jsonResponse({ ok: res.ok, status: res.status, error: res.error, body: redact(res.data) });
      }

      // ----------------------------------------------------------------- place
      case "place": {
        // LOCK ONE: an explicit token in the body, so no accidental call from
        // a retry, a refresh or a fat-fingered action name can reach this.
        if (body?.confirm !== "PLACE") {
          return jsonResponse({
            error: 'Order placement needs "confirm": "PLACE" in the request. Nothing was sent to a broker.'
          }, 400);
        }
        const user = await loadSnapUser(admin, userId);
        if (!user) return jsonResponse({ error: "No SnapTrade user yet. Connect a broker first." }, 400);

        const accountId = String(body?.accountId || "");
        if (!accountId) return jsonResponse({ error: "accountId is required." }, 400);

        // LOCK TWO: the account must be one the broker itself calls simulated.
        // Read fresh from SnapTrade rather than trusted from the request —
        // the caller does not get to assert that an account is paper.
        const accounts = await snapFetch<Record<string, unknown>[]>({
          path: "/accounts",
          userId: user.snapTradeUserId,
          userSecret: user.userSecret
        });
        if (!accounts.ok) return jsonResponse({ error: `Could not read accounts to check this one is paper: ${accounts.error}` }, 502);
        const account = (accounts.data || []).find((a) => String(a.id) === accountId);
        if (!account) return jsonResponse({ error: "That account is not connected to this SnapTrade user." }, 404);

        const institution = String(account.institution_name ?? "");
        const name = String(account.name ?? "");
        if (!looksPaper(institution, name)) {
          return jsonResponse({
            error:
              `"${institution} — ${name}" is not plainly a paper account, so this evaluation will not send it an order. ` +
              `Connect a paper account (their portal lists "Alpaca Paper" among others) and try there.`
          }, 403);
        }

        const legs = Array.isArray(body?.order?.legs) ? body.order.legs : null;
        const res = await snapFetch({
          // Single leg and multi-leg are the same endpoint on their side, with
          // one leg or several -- which is why a spread is worth testing here
          // and not only a stock order.
          path: legs ? `/accounts/${accountId}/trading/options` : "/trade/place",
          method: "POST",
          userId: user.snapTradeUserId,
          userSecret: user.userSecret,
          body: body?.order ?? {}
        });
        return jsonResponse({ ok: res.ok, status: res.status, error: res.error, body: redact(res.data) });
      }

      default:
        return jsonResponse({ error: `Unknown action "${action}".` }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
});
