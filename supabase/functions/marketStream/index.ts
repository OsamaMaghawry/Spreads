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
// Deliberately one-way and read-only: it subscribes to trades and quotes for the
// symbols asked for and relays them. It cannot place, change or cancel anything.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

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
  const symbols = (url.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
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

  const key = await decryptSecret(account.api_key);
  const secret = await decryptSecret(account.api_secret);
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
