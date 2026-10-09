import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient } from "../_shared/supabaseClients.ts";
import { bearerToken, connectorClientId } from "../_shared/connectorToken.ts";
import { connectorAddresses, handleMessage } from "../_shared/mcpProtocol.ts";
import { connectorTools, CONNECTOR_INSTRUCTIONS, type ConnectorDeps } from "../_shared/connectorTools.ts";
import { scanEntriesFor } from "../_shared/entryScan.ts";
import { readChainFor } from "../_shared/chainRead.ts";
import { syncAccountsFor } from "../_shared/accountSync.ts";
import { fetchTrades } from "../_shared/tradeSync.ts";

// THE CLAUDE CONNECTOR. A remote MCP server: Claude (claude.ai, the desktop
// and mobile apps) adds our address as a custom connector, the user signs in
// to DeltaMint and approves it, and Claude can then read the user's accounts,
// positions and option chains and run the Strategy Scanner on their filters.
//
//   https://deltamint.app/mcp               (what people paste; production)
//   https://dev-landing.deltamint.app/mcp   (the same, on staging)
//     -> passed through by the landing Worker (landing/src/connector.js) to
//   https://<project>.supabase.co/functions/v1/mcp   (this; still answers too)
//
// Plan, phases and the owner's steps: docs/product/connector.md.
//
// SIGN-IN is Supabase Auth's OAuth 2.1 server, not code here. This function is
// the "protected resource": an unauthenticated request gets a 401 naming the
// metadata document below, the metadata names our site as the authorization
// server (it fronts Supabase Auth so a person signing in sees only our name:
// landing/src/connector.js), and Claude does discovery, registration, the
// user's approval (src/pages/OAuthConsent.jsx) and the token exchange from there.
// That is also why this function runs with verify_jwt off (supabase/config.toml):
// the gateway's own 401 carries no metadata pointer, so Claude could never
// find where to sign in. The token is checked here instead, on every request.
//
// READ-ONLY. The tools only read (_shared/connectorTools.ts), and the token
// Claude holds is refused by every other function (connectorToken.ts) and
// cannot write to the database (migration 0058).
//
// ON THE TWO KNOWN PROJECTS ONLY, each paired with the one site that fronts
// it. Fails closed on any other project, e.g. a branch or a restored copy.

const SITE_BY_PROJECT: Record<string, string> = {
  yecfbeohyakuoyczvdbj: "https://deltamint.app",
  wpwaomzgpbozzghohwmf: "https://dev-landing.deltamint.app"
};
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PROJECT = Object.keys(SITE_BY_PROJECT).find((ref) => SUPABASE_URL.includes(`://${ref}.supabase.co`));
const enabled = () => Boolean(PROJECT);

const RESOURCE = `${SUPABASE_URL}/functions/v1/mcp`;
// The site whose /mcp passes through to this project (connectorAddresses).
// Only that origin is believed; production's function never names staging's
// address, nor the other way round.
const PUBLIC_ORIGINS = PROJECT ? [SITE_BY_PROJECT[PROJECT]] : [];
const AUTH_SERVER = `${SUPABASE_URL}/auth/v1`;
// Supabase's scopes describe ID-token contents, not access to data (that is
// the policies' job). `email` is enough to sign in; asking for `openid` would
// require asymmetric signing keys on the project for the ID token.
const SCOPE = "email";

const SERVER = { name: "deltamint", title: "DeltaMint", version: "0.1.0" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "www-authenticate"
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

const unauthorized = (why: "missing" | "invalid", metadata: string) =>
  json(
    { error: why === "missing" ? "Sign in to DeltaMint to use this connector." : "This sign-in has expired or was revoked." },
    401,
    {
      "WWW-Authenticate":
        `Bearer resource_metadata="${metadata}", scope="${SCOPE}"` +
        (why === "invalid" ? `, error="invalid_token"` : "")
    }
  );

async function userFor(token: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const { data, error } = await client.auth.getUser();
  return error || !data?.user ? null : data.user;
}

function depsFor(userId: string): ConnectorDeps {
  const admin = adminClient();
  return {
    listAccounts: async () => {
      const { data, error } = await admin
        .from("trading_accounts")
        .select("id, name, is_paper")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
    syncAccounts: () => syncAccountsFor(admin, userId),
    scan: (body) => scanEntriesFor(admin, userId, body),
    chain: (body) => readChainFor(admin, userId, body),
    // The History page's own read (tradeHistory -> fetchTrades), minus the
    // broker refresh it triggers: the connector reads, it does not sync.
    // pickAccount has already confirmed the account is this user's; the
    // user_id filter below repeats that check where the data is read.
    tradeHistory: async (accountId) => {
      const { data: acct, error } = await admin
        .from("trading_accounts")
        .select("id, trades_synced_at, trades_sync_error")
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!acct) throw new Error("Account not found.");
      return {
        trades: await fetchTrades(admin, accountId),
        syncedAt: acct.trades_synced_at || null,
        syncError: acct.trades_sync_error || null
      };
    },
    now: () => new Date()
  };
}

// Serves the DeltaMint MCP server for the Claude connector: OAuth discovery metadata, then read-only tools over JSON-RPC.
Deno.serve(async (req) => {
  if (!enabled()) return new Response("Not found", { status: 404 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const address = connectorAddresses(req.headers.get("X-DeltaMint-Public-Origin"), RESOURCE, AUTH_SERVER, PUBLIC_ORIGINS);

  // RFC 9728: where this resource says to sign in. Public by design.
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: address.resource,
      authorization_servers: [address.authServer],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "DeltaMint",
      resource_documentation: PROJECT ? `${SITE_BY_PROJECT[PROJECT]}/connect` : undefined
    });
  }

  // No server-to-client stream is offered; every answer comes back on the POST.
  if (req.method !== "POST") return json({ error: "Use POST." }, 405, { Allow: "POST, OPTIONS" });

  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) return unauthorized("missing", address.metadata);
  const user = await userFor(token);
  if (!user) return unauthorized("invalid", address.metadata);

  let message: any;
  try {
    message = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, 400);
  }

  const opts = { tools: connectorTools(), ctx: depsFor(user.id), server: SERVER, instructions: CONNECTOR_INSTRUCTIONS };
  const batch = Array.isArray(message) ? message : [message];
  for (const m of batch) {
    if (m?.method === "tools/call") {
      // Who asked for what, for the record. Arguments are filters and tickers.
      console.log(JSON.stringify({
        connector: "tools/call", user: user.id, client: connectorClientId(token),
        tool: m.params?.name, args: m.params?.arguments ?? {}
      }));
    }
  }
  const replies = (await Promise.all(batch.map((m) => handleMessage(m, opts)))).filter((r) => r !== null);

  // Only notifications: accepted, nothing to say.
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(message) ? replies : replies[0]);
});
