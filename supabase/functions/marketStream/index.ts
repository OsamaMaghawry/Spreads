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
import { isConnectorToken } from "../_shared/connectorToken.ts";

// The free IEX feed. SIP is a paid entitlement and returns an auth error rather
// than falling back, so the feed is a deliberate choice here, not a default.
const ALPACA_STREAM = "wss://stream.data.alpaca.markets/v2/iex";
// Crypto (terminal only): Alpaca's own crypto venue, around the clock, with
// what the stock feed lacks: the full order book and the side that took each
// trade.
const CRYPTO_STREAM = "wss://stream.data.alpaca.markets/v1beta3/crypto/us";
const SHARE = /^[A-Z][A-Z0-9.]{0,9}$/;
const COIN = /^[A-Z0-9]{1,10}\/(USD|USDT|USDC|BTC)$/;
// Refusals that another try will not change: auth failed, no entitlement,
// the account's connection already in use.
const FINAL = new Set([401, 402, 403, 405, 406, 409]);

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
  // shares and coins, through its own relay (relayDetail, below). Without
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
    relayDetail(socket, auth, symbols, (url.searchParams.get("book") || "").toUpperCase());
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

// The trading terminal's relay (detail mode). The full message: trade size,
// exchange and, for crypto, the side that took the trade, for its time &
// sales; bid and ask sizes; one-minute bars for its chart; and for one coin at
// a time, the order book. The watchlist can hold shares and coins together, so
// this holds up to two upstream sockets, the stock feed and the crypto feed,
// each opened only once a symbol needs it. Symbols change on the open socket
// ({action: "set", symbols, book}) rather than by reconnecting, because Alpaca
// allows one data connection per account per feed and a reconnect races the
// old one. Still read-only: the browser can choose symbols, nothing else.
type Feed = { kind: "stocks" | "crypto"; ws: WebSocket | null; authed: boolean; subscribed: Set<string>; book: string; attempts: number; final: string | null };

function relayDetail(client: WebSocket, auth: { key: string; secret: string }, initial: string[], initialBook: string) {
  let closed = false;
  let wanted = new Set(initial);
  let book = COIN.test(initialBook) ? initialBook : "";
  const feeds: Record<"stocks" | "crypto", Feed> = {
    stocks: { kind: "stocks", ws: null, authed: false, subscribed: new Set(), book: "", attempts: 0, final: null },
    crypto: { kind: "crypto", ws: null, authed: false, subscribed: new Set(), book: "", attempts: 0, final: null }
  };
  const timers = new Set<number>();
  const of = (f: Feed) => [...wanted].filter((s) => (f.kind === "crypto" ? COIN.test(s) : SHARE.test(s)));

  const send = (payload: unknown) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
  };
  const shut = () => {
    if (closed) return;
    closed = true;
    timers.forEach((t) => clearTimeout(t));
    for (const f of Object.values(feeds)) { try { f.ws?.close(); } catch { /* already gone */ } }
    try { client.close(); } catch { /* already gone */ }
  };

  // Brings one feed's subscriptions to what the browser wants, opening the
  // feed first if it has symbols and no socket.
  const sync = (f: Feed) => {
    const want = new Set(of(f));
    if (!f.ws) {
      if (want.size && !f.final && !closed) open(f);
      return;
    }
    if (!f.authed || f.ws.readyState !== WebSocket.OPEN) return;
    const add = [...want].filter((s) => !f.subscribed.has(s));
    const drop = [...f.subscribed].filter((s) => !want.has(s));
    if (drop.length) f.ws.send(JSON.stringify({ action: "unsubscribe", trades: drop, quotes: drop, bars: drop, updatedBars: drop }));
    if (add.length) f.ws.send(JSON.stringify({ action: "subscribe", trades: add, quotes: add, bars: add, updatedBars: add }));
    f.subscribed = want;
    if (f.kind === "crypto") {
      const next = want.has(book) ? book : "";
      if (f.book && f.book !== next) f.ws.send(JSON.stringify({ action: "unsubscribe", orderbooks: [f.book] }));
      // A new order-book subscription starts with the whole book (r: true).
      if (next && f.book !== next) f.ws.send(JSON.stringify({ action: "subscribe", orderbooks: [next] }));
      f.book = next;
    }
  };

  const open = (f: Feed) => {
    const ws = new WebSocket(f.kind === "crypto" ? CRYPTO_STREAM : ALPACA_STREAM);
    f.ws = ws;
    f.authed = false;
    f.subscribed = new Set();
    f.book = "";
    ws.onopen = () => ws.send(JSON.stringify({ action: "auth", ...auth }));
    ws.onmessage = (event) => {
      let messages: any[];
      try { messages = JSON.parse(String(event.data)); } catch { return; }
      if (!Array.isArray(messages)) return;
      for (const m of messages) {
        if (m.T === "success" && m.msg === "authenticated") {
          f.authed = true;
          f.attempts = 0;
          sync(f);
          send({ type: "ready", feed: f.kind, symbols: [...wanted], book });
          continue;
        }
        if (m.T === "error") {
          if (FINAL.has(Number(m.code))) f.final = `${m.code}: ${m.msg}`;
          send({ type: "error", feed: f.kind, code: m.code, message: m.msg });
          continue;
        }
        if (!m.S) continue;
        if (m.T === "t") {
          send({
            type: "trade", symbol: m.S, price: m.p, size: m.s, at: m.t, exchange: m.x, conditions: m.c, id: m.i,
            // Crypto states who took the trade: B, a buyer lifting the offer; S, a seller hitting the bid.
            takerSide: m.tks === "B" ? "buy" : m.tks === "S" ? "sell" : undefined
          });
        } else if (m.T === "q") {
          send({ type: "quote", symbol: m.S, bid: m.bp, ask: m.ap, bidSize: m.bs, askSize: m.as, at: m.t });
        } else if (m.T === "b" || m.T === "u") {
          // b = a finished one-minute bar, u = a correction to one.
          send({ type: "bar", symbol: m.S, t: m.t, o: m.o, h: m.h, l: m.l, c: m.c, v: m.v });
        } else if (m.T === "o") {
          // The order book: the whole book when r is set, otherwise only the
          // levels that changed, a size of 0 meaning the level is gone.
          const side = (list: any) => (Array.isArray(list) ? list : []).map((l: any) => [l.p, l.s]);
          send({ type: "book", symbol: m.S, at: m.t, reset: !!m.r, bids: side(m.b), asks: side(m.a) });
        }
      }
    };
    ws.onerror = () => send({ type: "error", feed: f.kind, message: `The ${f.kind === "crypto" ? "crypto" : "stock"} price stream failed.` });
    ws.onclose = () => {
      if (f.ws !== ws) return;
      f.ws = null;
      f.authed = false;
      if (closed) return;
      send({ type: "feed", feed: f.kind, state: "down", message: f.final });
      // A dropped feed comes back by itself, a little later each time; a
      // refusal does not, and the other feed carries on either way.
      if (f.final || f.attempts >= 6 || !of(f).length) return;
      f.attempts += 1;
      const t = setTimeout(() => { timers.delete(t); if (!closed && !f.ws) sync(f); }, Math.min(30000, 1000 * 2 ** f.attempts));
      timers.add(t);
    };
  };

  client.onopen = () => {
    sync(feeds.stocks);
    sync(feeds.crypto);
  };
  client.onmessage = (event) => {
    let msg: any;
    try { msg = JSON.parse(String(event.data)); } catch { return; }
    if (msg?.action !== "set" || !Array.isArray(msg.symbols)) return;
    const next = new Set<string>(msg.symbols
      .map((s: unknown) => String(s).toUpperCase().trim())
      .filter((s: string) => SHARE.test(s) || COIN.test(s))
      .slice(0, 30));
    if (!next.size) return;
    wanted = next;
    const b = String(msg.book || "").toUpperCase();
    book = COIN.test(b) ? b : "";
    sync(feeds.stocks);
    sync(feeds.crypto);
    send({ type: "ready", symbols: [...wanted], book });
  };
  client.onerror = shut;
  client.onclose = shut;
}
