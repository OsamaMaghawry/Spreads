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
//   https://dev-landing.deltamint.app/mcp   (what people paste; staging)
//     -> passed through by the landing Worker (landing/src/connector.js) to
//   https://<project>.supabase.co/functions/v1/mcp   (this; still answers too)
//
// Plan, phases and the owner's steps: docs/product/connector.md.
//
// SIGN-IN is Supabase Auth's OAuth 2.1 server, not code here. This function is
// the "protected resource": an unauthenticated request gets a 401 naming the
// metadata document below, the metadata names Supabase Auth as the
// authorization server, and Claude does discovery, registration, the user's
// approval (src/pages/OAuthConsent.jsx) and the token exchange from there.
// That is also why this function runs with verify_jwt off (supabase/config.toml):
// the gateway's own 401 carries no metadata pointer, so Claude could never
// find where to sign in. The token is checked here instead, on every request.
//
// READ-ONLY. The tools only read (_shared/connectorTools.ts), and the token
// Claude holds is refused by every other function (connectorToken.ts) and
// cannot write to the database (migration 0058).
//
// STAGING ONLY until it is released on purpose. Fails closed anywhere else.

const STAGING_REF = "wpwaomzgpbozzghohwmf";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const enabled = () => SUPABASE_URL.includes(`://${STAGING_REF}.supabase.co`);

const RESOURCE = `${SUPABASE_URL}/functions/v1/mcp`;
// Our sites whose /mcp passes through to here (connectorAddresses). Production
// joins this list when the connector is released.
const PUBLIC_ORIGINS = ["https://dev-landing.deltamint.app"];
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
  const address = connectorAddresses(req.headers.get("X-DeltaMint-Public-Origin"), RESOURCE, PUBLIC_ORIGINS);

  // RFC 9728: where this resource says to sign in. Public by design.
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: address.resource,
      authorization_servers: [AUTH_SERVER],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "DeltaMint",
      resource_documentation: "https://deltamint.app/about"
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
