import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { snapFetch, snapCredentials } from "../_shared/snaptrade.ts";
import { ensureSnapUser, loadSnapUser } from "../_shared/snaptradeUser.ts";
import { isPaperAccount } from "../_shared/snaptradeShape.ts";

// Connect any broker, read-only.
//
// The user-facing half of the any-broker plan (10 Oct). A signed-in user opens
// SnapTrade's connection portal for their own broker, then imports the
// accounts it connected as DeltaMint accounts that DeltaMint reads and never
// trades: their history runs through the same engine (tradeHistory), their
// positions through the same Dashboard sync (accountSync), and every order
// path refuses them (loadAccount).
//
// Separate from `snaptrade`, which is the admin's evaluation bench and can
// place paper orders: nothing reachable from here can.
//
// FAILS CLOSED where SnapTrade is not configured. Production has no SnapTrade
// keys, so this answers 404 there with nothing to switch off -- the same rule
// as the bench.

const enabled = () =>
  ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY"].every((k) => (Deno.env.get(k) || "").trim() !== "");

// Where the portal's Done button returns: our own app's Accounts page, read
// from configuration or the request's own origin -- never from the body, which
// would make this an open redirect.
function returnTo(req: Request): string | null {
  const configured = (Deno.env.get("APP_URL") || "").trim().replace(/\/$/, "");
  if (configured) return `${configured}/accounts?linked=1`;
  const origin = req.headers.get("origin") || "";
  return /^https:\/\/[a-z0-9.-]+\.deltamint\.app$/i.test(origin) ? `${origin}/accounts?linked=1` : null;
}

const label = (a: Record<string, unknown>) => {
  const inst = String(a.institution_name ?? "").trim();
  const name = String(a.name ?? "").trim();
  if (inst && name && !name.toLowerCase().startsWith(inst.toLowerCase())) return `${inst} — ${name}`;
  return name || inst || "Connected account";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!enabled() || !snapCredentials()) return jsonResponse({ error: "Connecting other brokers is not available yet." }, 404);
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const { action } = await req.json().catch(() => ({ action: null }));
    const admin = adminClient();

    switch (action) {
      // Open SnapTrade's portal for this user, read-only. Their link expires in
      // five minutes, so it is fetched per click.
      case "connect": {
        const { user: snap, error } = await ensureSnapUser(admin, user.id);
        if (!snap) return jsonResponse({ error }, 502);
        const back = returnTo(req);
        const res = await snapFetch<{ redirectURI?: string }>({
          path: "/snapTrade/login",
          method: "POST",
          userId: snap.snapTradeUserId,
          userSecret: snap.userSecret,
          body: {
            connectionType: "read",
            ...(back ? { customRedirect: back, immediateRedirect: true } : {})
          }
        });
        if (!res.ok) return jsonResponse({ error: `The broker list could not be opened (${res.status}). Try again in a minute.` }, 502);
        return jsonResponse({ url: res.data?.redirectURI || null });
      }

      // Bring every account the user has connected at SnapTrade into DeltaMint,
      // once each. Re-running adds only what is new.
      case "import": {
        const snap = await loadSnapUser(admin, user.id);
        if (!snap) return jsonResponse({ imported: 0, accounts: [] });
        const res = await snapFetch<Record<string, unknown>[]>({
          path: "/accounts",
          userId: snap.snapTradeUserId,
          userSecret: snap.userSecret
        });
        if (!res.ok) return jsonResponse({ error: `Your broker accounts could not be read (${res.status}).` }, 502);
        const theirs = Array.isArray(res.data) ? res.data : [];

        const { data: ours, error: readError } = await admin
          .from("trading_accounts")
          .select("id, snaptrade_account_id")
          .eq("user_id", user.id)
          .not("snaptrade_account_id", "is", null);
        if (readError) throw new Error(readError.message);
        const have = new Set((ours || []).map((r: any) => r.snaptrade_account_id));

        const rows = theirs
          .filter((a) => a.id && !have.has(String(a.id)))
          .map((a) => ({
            user_id: user.id,
            name: label(a),
            is_paper: isPaperAccount(a),
            provider: "snaptrade",
            snaptrade_account_id: String(a.id),
            broker_account_number: a.number ? String(a.number) : null
          }));
        if (rows.length) {
          const { error } = await admin.from("trading_accounts").insert(rows);
          if (error) throw new Error(error.message);
        }
        return jsonResponse({
          imported: rows.length,
          accounts: theirs.map((a) => ({ name: label(a), paper: isPaperAccount(a), alreadyAdded: have.has(String(a.id)) }))
        });
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
