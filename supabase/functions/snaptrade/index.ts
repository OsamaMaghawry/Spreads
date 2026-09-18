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
import { adminClient } from "../_shared/supabaseClients.ts";
import { isServiceRole } from "../_shared/serviceRole.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
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
// Which signature does their API actually accept?
// ---------------------------------------------------------------------------
//
// The first real run split: `/` and `/brokerages` answered 200 while
// `/snapTrade/partners` and `/brokerageAuthorizationTypes` answered 401
// "Unable to verify signature sent". That is not a broken key -- a wrong key
// fails everything. It means the first two do not verify signatures at all
// and the other two do, so the signature has been wrong from the start and
// looked right.
//
// Their documentation describes the algorithm in prose, and prose leaves
// exactly the choices this got wrong: whether `path` carries the /api/v1
// prefix, whether an absent body is a null or an absent key, and whether the
// credentials travel as query parameters or as headers. So rather than guess
// again, every plausible reading is sent to one endpoint that DOES verify, and
// their API says which is right.
//
// Deliberately read-only, and deliberately against an endpoint that returns
// reference data: settling this must not create, change or trade anything.

// ROUND ONE SETTLED TWO THINGS and left the third open.
//
//   Credentials go in the QUERY STRING. The header-only variants came back
//   "Authentication credentials were not provided" (code 0000) rather than a
//   signature complaint, so Partner* headers alone are not a way in.
//
//   The query itself is read correctly. Every query-param variant reached the
//   signature check (code 1076, "Unable to verify signature sent") instead of
//   failing earlier, so clientId and timestamp arrive intact.
//
// What is left is the HMAC itself: which bytes are the key, and how the digest
// is encoded. Round two varies exactly that, against the same read-only
// reference endpoint.

interface SigVariant {
  name: string;
  /** Include the /api/v1 prefix in the signed `path`. */
  prefix: boolean;
  /** "null" | "omit" | "empty" | "object" -- how an absent request body is signed. */
  content: "null" | "omit" | "empty" | "object";
  /** Credentials as query parameters, as Partner* headers, or both. */
  where: "query" | "headers" | "both";
  /** The header the signature itself travels in. */
  header: "Signature" | "PartnerSignature";
  /** How the consumer key becomes HMAC key bytes. */
  key?: "utf8" | "base64" | "uriEncoded" | "alnum";
  /** How the digest is encoded for the header. */
  digest?: "base64" | "base64url" | "hex";
  /** Sign the whole URL rather than the path. */
  fullUrl?: boolean;
}

const SIG_VARIANTS: SigVariant[] = [
  { name: "path with /api/v1, content null, query params, Signature", prefix: true, content: "null", where: "query", header: "Signature" },
  { name: "path WITHOUT /api/v1, content null, query params, Signature", prefix: false, content: "null", where: "query", header: "Signature" },
  { name: "path with /api/v1, content key omitted, query params, Signature", prefix: true, content: "omit", where: "query", header: "Signature" },
  { name: "path WITHOUT /api/v1, content key omitted, query params, Signature", prefix: false, content: "omit", where: "query", header: "Signature" },
  { name: "path with /api/v1, content empty string, query params, Signature", prefix: true, content: "empty", where: "query", header: "Signature" },
  { name: "path with /api/v1, content null, Partner* headers, PartnerSignature", prefix: true, content: "null", where: "headers", header: "PartnerSignature" },
  { name: "path with /api/v1, content null, query params AND Partner* headers", prefix: true, content: "null", where: "both", header: "Signature" },
  { name: "path WITHOUT /api/v1, content null, Partner* headers, PartnerSignature", prefix: false, content: "null", where: "headers", header: "PartnerSignature" },
  // Round two: the HMAC itself.
  { name: "key base64-decoded to bytes", prefix: true, content: "null", where: "query", header: "Signature", key: "base64" },
  { name: "key URI-encoded first, as their example writes it", prefix: true, content: "null", where: "query", header: "Signature", key: "uriEncoded" },
  { name: "digest base64url instead of base64", prefix: true, content: "null", where: "query", header: "Signature", digest: "base64url" },
  { name: "digest hex instead of base64", prefix: true, content: "null", where: "query", header: "Signature", digest: "hex" },
  { name: "content as an empty object", prefix: true, content: "object", where: "query", header: "Signature" },
  { name: "the whole URL signed as path", prefix: true, content: "null", where: "query", header: "Signature", fullUrl: true },
  // ROUND THREE. Fourteen readings of the algorithm were refused with the same
  // code, and the algorithm matches their documentation, so the suspect is no
  // longer the algorithm: it is the key. Its shape does not match what
  // SnapTrade issues -- 57 characters carrying exactly one non-alphanumeric,
  // against the ~50 all-alphanumeric of their own example -- and a zero-width
  // character picked up by a copy and paste is invisible in a dashboard and
  // fatal to an HMAC. If this variant is the one that passes, that is the
  // whole answer.
  { name: "key with non-alphanumeric characters stripped", prefix: true, content: "null", where: "query", header: "Signature", key: "alnum" }
];

async function trySignature(v: SigVariant, creds: { clientId: string; consumerKey: string }) {
  // One endpoint, reference data only, and one that we know verifies.
  const endpoint = "/brokerageAuthorizationTypes";
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPath = v.prefix ? `/api/v1${endpoint}` : endpoint;
  const query = v.where === "headers" ? "" : `clientId=${encodeURIComponent(creds.clientId)}&timestamp=${timestamp}`;

  const pathForSig = v.fullUrl
    ? `https://api.snaptrade.com/api/v1${endpoint}`
    : signedPath;

  const sigObject: Record<string, unknown> =
    v.content === "omit"
      ? { path: pathForSig, query }
      : { content: v.content === "empty" ? "" : v.content === "object" ? {} : null, path: pathForSig, query };
  const payload = JSON.stringify(sigObject);

  // The key bytes. Their own example writes `encodeURI(consumerKey)`, which is
  // identity for an alphanumeric key and is not for one carrying anything
  // else -- so it is a variant rather than an assumption.
  let keyBytes: Uint8Array;
  if (v.key === "base64") {
    try {
      const bin = atob(creds.consumerKey);
      keyBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i);
    } catch {
      return { variant: v.name, status: 0, ok: false, signed: payload, body: "the consumer key is not valid base64, so this variant cannot be tried" };
    }
  } else {
    keyBytes = new TextEncoder().encode(
      v.key === "uriEncoded" ? encodeURI(creds.consumerKey)
        : v.key === "alnum" ? creds.consumerKey.replace(/[^A-Za-z0-9]/g, "")
          : creds.consumerKey
    );
  }

  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const raw = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  let binary = "";
  for (const b of raw) binary += String.fromCharCode(b);
  const signature =
    v.digest === "hex"
      ? [...raw].map((b) => b.toString(16).padStart(2, "0")).join("")
      : v.digest === "base64url"
        ? btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : btoa(binary);

  const headers: Record<string, string> = { Accept: "application/json", [v.header]: signature };
  if (v.where === "headers" || v.where === "both") {
    headers.PartnerClientId = creds.clientId;
    headers.PartnerTimestamp = String(timestamp);
  }

  try {
    const res = await fetch(`https://api.snaptrade.com/api/v1${endpoint}${query ? `?${query}` : ""}`, { headers });
    const text = await res.text();
    return {
      variant: v.name,
      status: res.status,
      ok: res.ok,
      // The signed string itself, so a wrong one can be compared by eye
      // against their documentation. It contains no key material.
      signed: payload,
      body: text.slice(0, 200)
    };
  } catch (e) {
    return { variant: v.name, status: 0, ok: false, signed: payload, body: String(e?.message || e) };
  }
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

// `userId` null runs the PUBLIC half only: their status, our partner record,
// the brokerage matrix and the connection types. That half needs no connected
// account and no SnapTrade user, which is what makes it runnable from a
// deploy check rather than only from a browser -- and it is also the half that
// answers the question that comes first, which is how far their reach goes.
async function runProbe(admin: any, userId: string | null) {
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
  if (!userId) {
    notes.push(
      "Public half only: no SnapTrade user was registered, so connections, accounts, positions, orders and " +
      "activities were not asked. Run this from the Admin panel, signed in, to reach those."
    );
    return { probes, matrix: matrixOut, verdicts: verdicts(probes, matrixOut), notes, accounts: [] };
  }

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

  // TWO WAYS IN, and the second is strictly narrower.
  //
  // An admin's own session does everything, because registering a user on a
  // third-party platform and opening a connection portal are things a person
  // does on their own behalf.
  //
  // The platform itself -- not merely somebody signed in -- gets the PUBLIC
  // half: is their API up, does our signature authenticate, and what is their
  // brokerage reach. That is what a deploy check can prove without a browser,
  // and it touches no user and no account.
  //
  // It proves it one of two ways, and the body is read before the gate because
  // the second one lives in the body: a single-use ticket minted inside the
  // database. See cronTicket.ts -- the Vault row every scheduled job reads as
  // the service-role key holds the ANON key on this project, so a service-role
  // check on its own refuses the platform's own calls.
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "status");

  let admin: ReturnType<typeof adminClient>;
  let userId: string | null = null;

  const platform =
    isServiceRole(req) || (await redeemCronTicket(adminClient(), body?.ticket, "snaptrade"));

  if (platform) {
    admin = adminClient();
  } else {
    const gate = await requireAdmin(req);
    if (gate.response) return gate.response;
    admin = gate.admin!;
    userId = gate.user!.id;
  }

  try {
    const creds = snapCredentials();

    // Anything that acts FOR a person needs a person. The service-role caller
    // is the platform, which has no SnapTrade identity and must not borrow
    // one -- so these are refused rather than silently run as somebody.
    if (!userId && ["connect", "resetUser", "impact", "place"].includes(action)) {
      return jsonResponse({
        error: `"${action}" acts for a signed-in administrator and cannot be run by the platform itself.`
      }, 403);
    }

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

      // ------------------------------------------------------------- signature
      case "signature": {
        // Read-only, against reference data. Settles which reading of their
        // signing rules their API actually accepts.
        const results = [];
        for (const v of SIG_VARIANTS) results.push(await trySignature(v, creds!));
        return jsonResponse({
          // Not secret: it identifies us to them and travels in every query
          // string. Printed because a client id that looks like a 50-character
          // random string means the two keys were pasted the wrong way round,
          // which fails exactly like a wrong algorithm.
          clientId: creds!.clientId,
          // THE KEY'S SHAPE, NEVER THE KEY. A truncated paste, a stray quote,
          // a trailing newline or a key from the other environment all fail
          // exactly like a wrong algorithm, and telling those apart should not
          // cost an afternoon. None of this reveals key material: it is a
          // length and a character census.
          consumerKey: {
            length: creds!.consumerKey.length,
            allAlphanumeric: /^[A-Za-z0-9]+$/.test(creds!.consumerKey),
            hasWhitespace: /\s/.test(creds!.consumerKey),
            hasQuotes: /["']/.test(creds!.consumerKey),
            looksBase64: /^[A-Za-z0-9+/]+={0,2}$/.test(creds!.consumerKey),
            otherCharacterCount: creds!.consumerKey.replace(/[A-Za-z0-9]/g, "").length,
            // Where the odd characters are, and what they are ONLY when they
            // are not printable -- a zero-width space or a byte-order mark is
            // a paste artifact rather than key material, and naming it is the
            // difference between a fix and another afternoon. A printable
            // punctuation mark could be real key material, so its value stays
            // unsaid and only its position is given.
            oddCharacters: [...creds!.consumerKey]
              .map((ch, i) => ({ ch, i }))
              .filter(({ ch }) => !/[A-Za-z0-9]/.test(ch))
              .map(({ ch, i }) => {
                const code = ch.codePointAt(0)!;
                const printable = code >= 0x20 && code <= 0x7e;
                return {
                  index: i,
                  atEnd: i === creds!.consumerKey.length - 1,
                  printableAscii: printable,
                  codePoint: printable ? "(printable, withheld)" : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`
                };
              })
          },
          accepted: results.filter((r) => r.ok).map((r) => r.variant),
          results
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
