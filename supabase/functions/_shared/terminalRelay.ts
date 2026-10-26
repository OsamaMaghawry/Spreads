// The trading terminal's live prices: the relay between one browser and
// Alpaca's stock and crypto streams. functions/marketStream runs it for the
// terminal (detail mode); functions/terminal's self-test runs the same code
// against the live feeds with a stand-in browser, so what is checked is what
// ships. The dashboard's own stream path stays in marketStream, unchanged.

// The free IEX feed for shares, and Alpaca's own crypto venue for coins:
// around the clock, with what the stock feed lacks, the full order book and
// the side that took each trade. While IEX is closed (before 8:00 and after
// 17:00 New York) the terminal asks for the consolidated tape instead,
// fifteen minutes late on an account without a paid data plan
// ("delayed_sip"), so the pre-market from 4:00 shows; with a paid plan,
// "sip", in real time.
const STOCK_STREAMS: Record<string, string> = {
  iex: "wss://stream.data.alpaca.markets/v2/iex",
  delayed_sip: "wss://stream.data.alpaca.markets/v2/delayed_sip",
  sip: "wss://stream.data.alpaca.markets/v2/sip"
};
const CRYPTO_STREAM = "wss://stream.data.alpaca.markets/v1beta3/crypto/us";
export const SHARE = /^[A-Z][A-Z0-9.]{0,9}$/;
export const COIN = /^[A-Z0-9]{1,10}\/(USD|USDT|USDC|BTC)$/;
// Refusals that another try will not change: auth failed, no entitlement.
// "Connection limit exceeded" (406) is not among them: when the browser
// reconnects, Alpaca can still be holding the connection it just lost for a
// moment, and the same request a few seconds later goes through. Treating it
// as final left a feed dead until the next reconnect (found 24 Oct: the
// terminal's time & sales stopped updating).
const FINAL = new Set([401, 402, 403, 405, 409]);

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

// EODHD's real-time stream for shares, trades and bid/ask on two sockets,
// pre-market and after hours included (26 Oct, 5:34 New York: AAPL trades
// tagged "extended-hours", quotes about a second behind; Alpaca's free IEX
// feed had nothing before 8:00). The owner's own EODHD plan, so only for the
// owner (functions/marketStream decides). Its messages become the relay's
// own: a trade's size is EODHD's v, its time t in milliseconds; dp marks a
// dark-pool print and ms the session ("extended-hours", "open").
const EODHD_STREAM = "wss://ws.eodhistoricaldata.com/ws";

function eodhdShares(key: string, send: (m: any) => void, said: string[], isClosed: () => boolean) {
  const ends = { trades: "us", quotes: "us-quote" } as const;
  type Side = { ws: WebSocket | null; authed: boolean; subscribed: Set<string>; attempts: number; final: string | null };
  const sides: Record<keyof typeof ends, Side> = {
    trades: { ws: null, authed: false, subscribed: new Set(), attempts: 0, final: null },
    quotes: { ws: null, authed: false, subscribed: new Set(), attempts: 0, final: null }
  };
  let want = new Set<string>();
  const timers = new Set<number>();
  const at = (t: unknown) => new Date(Number(t)).toISOString();

  const bring = (side: Side) => {
    if (!side.ws || !side.authed || side.ws.readyState !== WebSocket.OPEN) return;
    const add = [...want].filter((x) => !side.subscribed.has(x));
    const drop = [...side.subscribed].filter((x) => !want.has(x));
    if (drop.length) side.ws.send(JSON.stringify({ action: "unsubscribe", symbols: drop.join(",") }));
    if (add.length) side.ws.send(JSON.stringify({ action: "subscribe", symbols: add.join(",") }));
    side.subscribed = new Set(want);
  };

  const open = (kind: keyof typeof ends) => {
    const side = sides[kind];
    const ws = new WebSocket(`${EODHD_STREAM}/${ends[kind]}?api_token=${encodeURIComponent(key)}`);
    side.ws = ws;
    side.authed = false;
    side.subscribed = new Set();
    ws.onmessage = (event) => {
      let m: any;
      try { m = JSON.parse(String(event.data)); } catch { return; }
      if (m.status_code !== undefined) {
        said.push(`eodhd ${kind}: ${m.status_code} ${m.message || ""}`.trim());
        if (Number(m.status_code) === 200) {
          side.authed = true;
          side.attempts = 0;
          bring(side);
          send({ type: "ready", feed: "stocks", source: "eodhd", symbols: [...want] });
        } else {
          side.final = `EODHD ${m.status_code}: ${m.message || "refused"}`;
          send({ type: "error", feed: "stocks", code: m.status_code, message: side.final });
        }
        return;
      }
      if (!m.s) return;
      if (kind === "trades") {
        send({ type: "trade", symbol: m.s, price: m.p, size: m.v, at: at(m.t), conditions: m.c, darkPool: !!m.dp, session: m.ms, source: "eodhd" });
      } else {
        send({ type: "quote", symbol: m.s, bid: m.bp, ask: m.ap, bidSize: m.bs, askSize: m.as, at: at(m.t) });
      }
    };
    ws.onerror = () => send({ type: "error", feed: "stocks", message: "The EODHD price stream failed." });
    ws.onclose = () => {
      if (side.ws !== ws) return;
      side.ws = null;
      side.authed = false;
      if (isClosed()) return;
      said.push(`eodhd ${kind}: closed`);
      send({ type: "feed", feed: "stocks", state: "down", message: side.final });
      if (side.final || side.attempts >= 6 || !want.size) return;
      side.attempts += 1;
      const t = setTimeout(() => { timers.delete(t); if (!isClosed() && !side.ws) open(kind); }, Math.min(30000, 1000 * 2 ** side.attempts));
      timers.add(t);
    };
  };

  return {
    sync(symbols: string[]) {
      want = new Set(symbols);
      for (const kind of Object.keys(ends) as (keyof typeof ends)[]) {
        const side = sides[kind];
        if (!side.ws) { if (want.size && !side.final) open(kind); } else bring(side);
      }
    },
    close() {
      timers.forEach((t) => clearTimeout(t));
      for (const side of Object.values(sides)) { try { side.ws?.close(); } catch { /* already gone */ } }
    }
  };
}

// The watcher of the account's stops outside regular hours (stopGuardRun.ts
// guardWatcher): the shares it guards are streamed too, every share trade
// goes past it, and what it says goes to the browser as {type: "guard"}.
type StopWatch = { start(onChange: () => void): void; stop(): void; symbols(): string[]; trade(symbol: string, price: number, size: number, at: number, tell: (m: any) => void): Promise<void> };

/**
 * `stockFeed`: "iex" (default), "delayed_sip" or "sip" from Alpaca, or
 * "eodhd" with `eodhdKey` for EODHD's real-time stream. `guard`: the stops
 * watcher, when the account has one.
 */
export function relayDetail(client: WebSocket, auth: { key: string; secret: string }, initial: string[], initialBook: string, stockFeed = "iex", eodhdKey: string | null = null, guard: StopWatch | null = null) {
  const STOCK_STREAM = STOCK_STREAMS[stockFeed] || STOCK_STREAMS.iex;
  let closed = false;
  const startedAt = Date.now();
  // What this session sent the browser, and what each feed said, logged when
  // it ends: the only view from here of whether a trader's tape was live.
  const sent: Record<string, number> = {};
  const said: Record<string, string[]> = { stocks: [], crypto: [] };
  // Tells the runtime the socket is still working, so it does not retire the
  // worker as idle once the upgrade is answered. It cannot outlast the
  // platform's limit: Supabase ends a function's socket at about half its
  // wall-clock limit, 75 seconds on this plan, logged as EarlyDrop. So the
  // browser reconnects every 75 seconds or so (useTerminalStream), a feed
  // Alpaca still counts as connected is retried rather than given up on, and
  // the tape reads back what printed in the gap.
  let finished: () => void = () => {};
  const done = new Promise<void>((resolve) => { finished = resolve; });
  (globalThis as any).EdgeRuntime?.waitUntil?.(done);
  const summary = () => JSON.stringify({ seconds: Math.round((Date.now() - startedAt) / 1000), symbols: wanted.size, book, stockFeed, sent, said });
  // Every 30 seconds as well as at the end: a worker the platform stops does
  // not reach the end of its session to say so.
  const heartbeat = setInterval(() => console.log(`terminal relay (open): ${summary()}`), 30000);
  let wanted = new Set(initial);
  let book = COIN.test(initialBook) ? initialBook : "";
  const feeds: Record<"stocks" | "crypto", Feed> = {
    stocks: { kind: "stocks", ws: null, authed: false, subscribed: new Set(), book: "", attempts: 0, final: null },
    crypto: { kind: "crypto", ws: null, authed: false, subscribed: new Set(), book: "", attempts: 0, final: null }
  };
  const timers = new Set<number>();
  // The shares guarded are streamed with those on screen (up to the feed's
  // own limit), though only those on screen reach the browser.
  const of = (f: Feed) => (f.kind === "crypto" ? [...wanted].filter((s) => COIN.test(s))
    : [...new Set([...[...wanted].filter((s) => SHARE.test(s)), ...(guard?.symbols() || [])])].slice(0, 30));
  const eodhd = stockFeed === "eodhd" && eodhdKey ? eodhdShares(eodhdKey, (m) => send(m), said.stocks, () => closed) : null;

  const deliver = (payload: any) => {
    if (client.readyState !== WebSocket.OPEN) return;
    sent[payload.type] = (sent[payload.type] || 0) + 1;
    client.send(JSON.stringify(payload));
  };
  const send = (payload: any) => {
    const symbol = payload?.symbol;
    if (guard && payload.type === "trade" && SHARE.test(String(symbol))) {
      guard.trade(symbol, Number(payload.price), Number(payload.size), Date.parse(payload.at), deliver).catch(() => {});
    }
    if ((payload.type === "trade" || payload.type === "quote" || payload.type === "bar") && symbol && !wanted.has(symbol)) return;
    deliver(payload);
  };
  const shut = () => {
    if (closed) return;
    closed = true;
    timers.forEach((t) => clearTimeout(t));
    for (const f of Object.values(feeds)) { try { f.ws?.close(); } catch { /* already gone */ } }
    eodhd?.close();
    guard?.stop();
    try { client.close(); } catch { /* already gone */ }
    clearInterval(heartbeat);
    console.log(`terminal relay: ${summary()}`);
    finished();
  };

  // Brings one feed's subscriptions to what the browser wants, opening the
  // feed first if it has symbols and no socket.
  const sync = (f: Feed) => {
    // Shares from EODHD: its own two sockets.
    if (f.kind === "stocks" && eodhd) { if (!closed) eodhd.sync(of(f)); return; }
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
    const ws = new WebSocket(f.kind === "crypto" ? CRYPTO_STREAM : STOCK_STREAM);
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
          said[f.kind].push("authenticated");
          f.authed = true;
          f.attempts = 0;
          sync(f);
          send({ type: "ready", feed: f.kind, symbols: [...wanted], book });
          continue;
        }
        if (m.T === "error") {
          said[f.kind].push(`${m.code}: ${m.msg}`);
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
      said[f.kind].push("closed");
      send({ type: "feed", feed: f.kind, state: "down", message: f.final });
      // A dropped or crowded-out feed comes back by itself, a little later
      // each time; a refusal does not, and the other feed carries on either way.
      if (f.final || f.attempts >= 6 || !of(f).length) return;
      f.attempts += 1;
      const t = setTimeout(() => { timers.delete(t); if (!closed && !f.ws) sync(f); }, Math.min(30000, 1000 * 2 ** f.attempts));
      timers.add(t);
    };
  };

  client.onopen = () => {
    sync(feeds.stocks);
    sync(feeds.crypto);
    guard?.start(() => { if (!closed) sync(feeds.stocks); });
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
