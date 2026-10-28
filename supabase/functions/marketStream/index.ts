// Live underlying prices, relayed from Alpaca's stream.
//
// The dashboard refreshed every sixty seconds, which meant a spot price could be
// most of a minute stale while a position moved through a strike. Alpaca streams
// those prices — but the browser cannot subscribe to that stream directly.
// Alpaca's websocket authenticates with the account's API key and secret, and
// those are decrypted only inside a function: credential columns are revoked
// from the browser role entirely, and shipping them to the client to open a
// socket would undo the reason they are encrypted at all.
//
// So the socket lives here. The browser connects to this function, this function
// connects to Alpaca with the decrypted credentials, and only prices travel back
// down. The credentials never leave the server.
//
// Deliberately one-way and read-only for the browser: it subscribes to trades
// and quotes for the symbols asked for and relays them, and nothing the
// browser sends can place, change or cancel anything. The one exception is
// the server's own: the terminal's stops outside regular hours, which its
// relay fires on an account the terminal trades when a trade reaches them
// (stopGuardRun.ts).
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { isConnectorToken } from "../_shared/connectorToken.ts";
import { relayDetail, SHARE, COIN } from "../_shared/terminalRelay.ts";
import { isOwnerEmail, isAdminUser } from "../_shared/admin.ts";
import { loadAccount } from "../_shared/alpaca.ts";
import { guardWatcher } from "../_shared/stopGuardRun.ts";

// The free IEX feed. SIP is a paid entitlement and returns an auth error rather
// than falling back, so the feed is a deliberate choice here, not a default.
const ALPACA_STREAM = "wss://stream.data.alpaca.markets/v2/iex";

// A browser cannot set an Authorization header on a WebSocket, so the caller's
// token arrives in the query string and is verified here. This function
// therefore runs with verify_jwt disabled and does the check itself — without
// this, the endpoint would relay any account's prices to anyone.
async function userFromQuery(url: URL) {
  const token = url.searchParams.get("token");
  if (!token) return null;
  // Not for a third-party app's token -- see connectorToken.ts.
  if (isConnectorToken(token)) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("This endpoint speaks WebSocket only.", { status: 426 });
  }

  const user = await userFromQuery(url);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const accountId = url.searchParams.get("accountId");
  // The trading terminal (functions/terminal) asks for the full message, for
  // shares and coins, through its own relay (_shared/terminalRelay.ts). Without
  // `detail` the messages are exactly what the dashboard has always read.
  const detail = url.searchParams.get("detail") === "1";
  const symbols = (url.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => !detail || SHARE.test(s) || COIN.test(s))
    .slice(0, 30); // one screen's worth; a longer list is a bug, not a need
  if (!accountId || symbols.length === 0) {
    return new Response("accountId and symbols are required", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
  // Ownership re-checked against the caller, not taken from the request: the
  // service-role client above bypasses RLS, so this is the only thing standing
  // between one user's token and another user's account.
  const { data: account } = await admin
    .from("trading_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return new Response("Trading account not found", { status: 404 });
  // The terminal's stream is for administrators only, as the terminal is
  // (functions/terminal); the dashboard's plain stream is for everyone.
  if (detail && !(await isAdminUser(user, admin).catch(() => ({ isAdmin: false }))).isAdmin) {
    return new Response("Not available.", { status: 404 });
  }

  const key = await decryptSecret(account.api_key);
  const secret = await decryptSecret(account.api_secret);
  if (detail) {
    // The terminal also streams for an account connected by OAuth: Alpaca's
    // data stream takes the word "oauth" as the key and the user's token as
    // the secret. OAuth first, as REST does (alpaca.ts authHeaders).
    const token = await decryptSecret(account.oauth_access_token);
    const auth = token ? { key: "oauth", secret: token } : key && secret ? { key, secret } : null;
    if (!auth) return new Response("This account cannot sign in to the price stream.", { status: 409 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    // Shares from EODHD only for the owner, whose plan it is, and only while
    // the project holds the key; anyone else asking gets Alpaca's IEX feed.
    const asked = url.searchParams.get("stocks") || "iex";
    const eodhdKey = asked === "eodhd" && isOwnerEmail(user.email) ? Deno.env.get("EODHD_API_KEY") || null : null;
    const stockFeed = asked === "eodhd" ? (eodhdKey ? "eodhd" : "iex") : asked;
    // While the terminal is open, its relay also fires the account's stops
    // outside regular hours from the trades it streams (stopGuardRun.ts), on
    // every account the terminal trades: paper ones, and the owner's own live
    // Alpaca ones. Not from the delayed tape: a stop fired fifteen minutes
    // late is not a stop.
    const source = stockFeed === "eodhd" ? "eodhd" : stockFeed === "iex" ? "iex" : null;
    const trades = account.is_paper || (isOwnerEmail(user.email) && account.provider !== "snaptrade");
    // Every account the terminal trades for this person, this one first: its
    // relay holds the owner's one EODHD connection, so it guards them all
    // (28 Oct: the minute job watching the others was refused by EODHD).
    let guarded: any[] = [];
    if (trades && source) {
      const owner = isOwnerEmail(user.email);
      const { data: rows } = await admin.from("trading_accounts").select("id, is_paper, provider").eq("user_id", user.id);
      const others = (rows || []).filter((a: any) => a.id !== accountId && a.provider !== "snaptrade" && (a.is_paper || owner)).map((a: any) => a.id);
      guarded = (await Promise.all([accountId, ...others].map((id) => loadAccount(admin, id, user.id).catch(() => null)))).filter(Boolean);
    }
    const guard = guarded.length ? guardWatcher(admin, guarded, user.id, source) : null;
    // And the account's own orders as they move, for an account it trades.
    const orders = trades ? { paper: !!account.is_paper, cred: { token, key, secret } } : null;
    relayDetail(socket, auth, symbols, (url.searchParams.get("book") || "").toUpperCase(), stockFeed, eodhdKey, guard, orders);
    return response;
  }
  if (!key || !secret) {
    // OAuth-connected accounts hold a bearer token rather than a key pair, and
    // Alpaca's market-data stream does not accept one. Saying so lets the client
    // fall back to polling instead of retrying a connection that cannot work.
    return new Response("This account has no API key pair; streaming is unavailable.", { status: 409 });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);
  let upstream: WebSocket | null = null;
  let closed = false;

  const shut = () => {
    if (closed) return;
    closed = true;
    try { upstream?.close(); } catch { /* already gone */ }
    try { client.close(); } catch { /* already gone */ }
  };

  const send = (payload: unknown) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
  };

  client.onopen = () => {
    upstream = new WebSocket(ALPACA_STREAM);

    upstream.onopen = () => {
      upstream?.send(JSON.stringify({ action: "auth", key, secret }));
    };

    upstream.onmessage = (event) => {
      let messages: any[];
      try {
        messages = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!Array.isArray(messages)) return;

      for (const m of messages) {
        // Alpaca answers auth on the same socket rather than by closing it, so
        // success is what triggers the subscribe.
        if (m.T === "success" && m.msg === "authenticated") {
          upstream?.send(JSON.stringify({ action: "subscribe", trades: symbols, quotes: symbols }));
          send({ type: "ready", symbols });
          continue;
        }
        if (m.T === "error") {
          // Relayed rather than swallowed: "connection limit exceeded" and
          // "auth failed" need different responses from the client, and a
          // silent dead socket looks exactly like a quiet market.
          send({ type: "error", code: m.code, message: m.msg });
          continue;
        }
        // t = trade: the last price actually paid, which is what a spot is.
        if (m.T === "t" && m.S) {
          send({ type: "trade", symbol: m.S, price: m.p, at: m.t });
          continue;
        }
        // q = quote. Sent as bid/ask rather than a midpoint: a midpoint between
        // a stale bid and a stale ask is an arithmetic artifact, and the price
        // trust ladder needs both sides to judge that.
        if (m.T === "q" && m.S) {
          send({ type: "quote", symbol: m.S, bid: m.bp, ask: m.ap, at: m.t });
        }
      }
    };

    upstream.onerror = () => send({ type: "error", message: "Upstream market stream failed." });
    upstream.onclose = () => { send({ type: "closed" }); shut(); };
  };

  // The browser has nothing to say back; anything it sends is ignored rather
  // than forwarded, so this can never become a path to Alpaca's trading API.
  client.onmessage = () => {};
  client.onerror = shut;
  client.onclose = shut;

  return response;
});
