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
      //
      // Also says which connections have no accounts yet. A new connection can
      // exist before its broker has sent any accounts (Interactive Brokers on
      // 10 Oct), and without this the page reads "nothing to add" while the
      // user is looking at a connection they just made.
      case "import": {
        const snap = await loadSnapUser(admin, user.id);
        if (!snap) return jsonResponse({ imported: 0, accounts: [], waiting: [], broken: [] });
        const scoped = { userId: snap.snapTradeUserId, userSecret: snap.userSecret };
        const [res, auths] = await Promise.all([
          snapFetch<Record<string, unknown>[]>({ path: "/accounts", ...scoped }),
          snapFetch<Record<string, unknown>[]>({ path: "/authorizations", ...scoped })
        ]);
        if (!res.ok) return jsonResponse({ error: `Your broker accounts could not be read (${res.status}).` }, 502);
        const theirs = Array.isArray(res.data) ? res.data : [];
        const connections = auths.ok && Array.isArray(auths.data) ? auths.data : [];
        const brokerOf = (c: any) => String(c?.brokerage?.display_name || c?.brokerage?.name || "A broker");
        const withAccounts = new Set(theirs.map((a: any) => String(a.brokerage_authorization ?? "")));
        const waiting = connections.filter((c: any) => !c.disabled && !withAccounts.has(String(c.id))).map(brokerOf);
        const broken = connections.filter((c: any) => c.disabled).map(brokerOf);

        const { data: ours, error: readError } = await admin
          .from("trading_accounts")
          .select("id, snaptrade_account_id, broker_account_number, is_paper")
          .eq("user_id", user.id);
        if (readError) throw new Error(readError.message);
        const have = new Set((ours || []).filter((r: any) => r.snaptrade_account_id).map((r: any) => r.snaptrade_account_id));

        // An account already connected directly stays connected directly. The
        // same broker account read a second way would show every position
        // twice, and the direct connection is the one that can trade. One row
        // per broker account is also what the database holds to
        // (trading_accounts_user_broker_account_number_idx).
        const numberKey = (n: unknown, paper: boolean) => `${String(n)}|${paper}`;
        const direct = new Set(
          (ours || []).filter((r: any) => r.broker_account_number).map((r: any) => numberKey(r.broker_account_number, r.is_paper))
        );
        const isDirect = (a: Record<string, unknown>) => !!a.number && direct.has(numberKey(a.number, isPaperAccount(a)));
        const alreadyConnected = theirs.filter((a) => !have.has(String(a.id)) && isDirect(a)).map(label);

        const rows = theirs
          .filter((a) => a.id && !have.has(String(a.id)) && !isDirect(a))
          .map((a) => ({
            user_id: user.id,
            name: label(a),
            is_paper: isPaperAccount(a),
            provider: "snaptrade",
            snaptrade_account_id: String(a.id),
            broker_account_number: a.number ? String(a.number) : null
          }));
        // One at a time, so one account the database refuses does not keep
        // the others out.
        let imported = 0;
        const refused: string[] = [];
        for (const row of rows) {
          const { error } = await admin.from("trading_accounts").insert(row);
          if (error) refused.push(row.name);
          else imported += 1;
        }
        return jsonResponse({
          imported,
          alreadyConnected,
          refused,
          accounts: theirs.map((a) => ({ name: label(a), paper: isPaperAccount(a), alreadyAdded: have.has(String(a.id)) })),
          waiting,
          broken
        });
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
