import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import { readSettings } from "../_shared/settings.ts";
import { recordAttempt } from "../_shared/orderAttempts.ts";
import { brokerRefusal } from "../_shared/orderWarnings.ts";
import { stockOrderBody, SYMBOL } from "../_shared/stockOrder.ts";
import { cryptoOrderBody, cryptoSymbol, isCrypto, CRYPTO } from "../_shared/cryptoOrder.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { houseDataAccount } from "../_shared/marketData.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { relayDetail } from "../_shared/terminalRelay.ts";

// The staging trading terminal: chart history, quotes, symbol search, the
// account's shares and orders, and share orders.
//
// The owner, 24 Oct 2026: "a full stock trading app, using alpaca prices ...
// to be like tws". Everything is read with the CALLER'S OWN account, never the
// house data account: each person sees the prices their own Alpaca account is
// entitled to (the free IEX feed), which keeps this clear of redistributing
// market data. Live prices stream through marketStream; this answers requests.
//
// Two gates, both server-side. The whole function refuses unless the database
// says terminal_lab is on, which only staging's does, so production fails
// closed with nothing to forget. And orders go to paper accounts only: a live
// account can be looked at, never traded, during this test.
//
// Crypto, added the same day ("I don't see Cryptos to select from ... make
// sure the order book is working and time and sales for anything that is
// available like cryptos"): Alpaca's crypto data carries what its stock feed
// does not, a full order book and the side that took each trade. A symbol with
// a slash ("BTC/USD") is crypto throughout.

const DATA = "https://data.alpaca.markets/v2";
const CRYPTO_DATA = "https://data.alpaca.markets/v1beta3/crypto/us";
const FEED = "iex";
const TERMINAL_SYMBOL = (s: string) => SYMBOL.test(s) || CRYPTO.test(s);

// How far back each chart interval reads, and the bar size it asks for.
const RANGES: Record<string, { tf: string; days: number }> = {
  "1Min": { tf: "1Min", days: 4 },
  "5Min": { tf: "5Min", days: 10 },
  "15Min": { tf: "15Min", days: 30 },
  "1Hour": { tf: "1Hour", days: 120 },
  "1Day": { tf: "1Day", days: 730 }
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function bars(account: any, symbol: string, interval: string) {
  const r = RANGES[interval] || RANGES["5Min"];
  const crypto = isCrypto(symbol);
  // Crypto trades around the clock, so the same span holds about four times
  // the one-minute bars a stock session does; a shorter reach keeps it to one page.
  const days = crypto && r.tf === "1Min" ? 2 : r.days;
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const out: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const url = (crypto
      ? `${CRYPTO_DATA}/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${r.tf}&start=${start}&limit=10000&sort=asc`
      : `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${r.tf}&start=${start}&limit=10000&feed=${FEED}&adjustment=split&sort=asc`) +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    // The stock endpoint answers for one symbol; the crypto one by symbol.
    const list = crypto ? page?.bars?.[symbol] : page?.bars;
    for (const b of list || []) {
      out.push({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    }
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && pages < 5);
  return { symbol, interval, feed: crypto ? "crypto" : FEED, bars: out };
}

async function snapshot(account: any, symbols: string[]) {
  const stocks = symbols.filter((s) => SYMBOL.test(s)).slice(0, 50);
  const coins = symbols.filter((s) => CRYPTO.test(s)).slice(0, 50);
  if (!stocks.length && !coins.length) return { quotes: {} };
  const [stockSnaps, coinSnaps] = await Promise.all([
    stocks.length ? alpacaFetch(`${DATA}/stocks/snapshots?symbols=${stocks.join(",")}&feed=${FEED}`, account) : null,
    coins.length ? alpacaFetch(`${CRYPTO_DATA}/snapshots?symbols=${encodeURIComponent(coins.join(","))}`, account) : null
  ]);
  const quotes: Record<string, any> = {};
  for (const s of [...stocks, ...coins]) {
    // A coin's "previous close" is the last full day in UTC: crypto has no
    // closing bell, and Alpaca's daily bars start at midnight UTC.
    const d = isCrypto(s) ? coinSnaps?.snapshots?.[s] : stockSnaps?.[s];
    if (!d) continue;
    const last = num(d.latestTrade?.p) ?? num(d.dailyBar?.c);
    const prev = num(d.prevDailyBar?.c);
    quotes[s] = {
      last, prevClose: prev,
      change: last !== null && prev ? last - prev : null,
      changePct: last !== null && prev ? (last - prev) / prev : null,
      bid: num(d.latestQuote?.bp), ask: num(d.latestQuote?.ap),
      bidSize: num(d.latestQuote?.bs), askSize: num(d.latestQuote?.as),
      open: num(d.dailyBar?.o), high: num(d.dailyBar?.h), low: num(d.dailyBar?.l), volume: num(d.dailyBar?.v),
      at: d.latestTrade?.t || null
    };
  }
  return { quotes, feed: FEED };
}

// The order book for a coin: every resting price on Alpaca's crypto venue,
// with its size. The stream keeps it live; this is the first picture, and the
// fallback when the stream is down. Shares have no book on Alpaca's feeds (see
// selftest), so for a share this answers with the best bid and ask only.
async function book(account: any, symbol: string) {
  if (!isCrypto(symbol)) {
    const q = await alpacaFetch(`${DATA}/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=${FEED}`, account);
    const quote = q?.quote || {};
    return {
      symbol, levels: false,
      bids: num(quote.bp) ? [[num(quote.bp), num(quote.bs)]] : [],
      asks: num(quote.ap) ? [[num(quote.ap), num(quote.as)]] : [],
      at: quote.t || null
    };
  }
  const r = await alpacaFetch(`${CRYPTO_DATA}/latest/orderbooks?symbols=${encodeURIComponent(symbol)}`, account);
  const b = r?.orderbooks?.[symbol] || {};
  const side = (list: any[]) => (Array.isArray(list) ? list : []).map((l) => [num(l.p), num(l.s)]).filter(([p, sz]) => p !== null && sz !== null);
  return { symbol, levels: true, bids: side(b.b), asks: side(b.a), at: b.t || null };
}

// The last trades, newest first, so time & sales opens with what already
// happened rather than empty. It matters most for coins: Alpaca's crypto
// venue is thin (on 24 Oct, BTC/USD about one trade every two minutes, ETH/USD
// one every six), so a tape that waited for the stream could sit empty for
// minutes. Each coin trade says who took it; a share's does not.
async function trades(account: any, symbol: string) {
  const crypto = isCrypto(symbol);
  const start = new Date(Date.now() - (crypto ? 1 : 5) * 86400000).toISOString();
  const r = await alpacaFetch(crypto
    ? `${CRYPTO_DATA}/trades?symbols=${encodeURIComponent(symbol)}&start=${start}&limit=50&sort=desc`
    : `${DATA}/stocks/${encodeURIComponent(symbol)}/trades?feed=${FEED}&start=${start}&limit=50&sort=desc`, account);
  const list = crypto ? r?.trades?.[symbol] : r?.trades;
  return {
    symbol,
    trades: (Array.isArray(list) ? list : []).map((t: any) => ({
      price: num(t.p), size: num(t.s), at: t.t, id: t.i, exchange: t.x, conditions: t.c,
      takerSide: t.tks === "B" ? "buy" : t.tks === "S" ? "sell" : undefined
    }))
  };
}

// Every tradable US share and coin, held for the life of this function
// instance: the list is large and changes rarely, and search runs on every
// keystroke. A coin carries its own minimum order and quantity and price
// steps, which the ticket shows and the order check uses.
type Asset = {
  symbol: string; name: string; exchange: string; shortable: boolean; assetClass: "us_equity" | "crypto";
  minOrderSize: number | null; minTradeIncrement: number | null; priceIncrement: number | null;
};
let assets: Asset[] | null = null;
let assetsAt = 0;

async function assetList(account: any): Promise<Asset[]> {
  if (!assets || Date.now() - assetsAt > 6 * 3600000) {
    const base = tradingBase(account);
    const [shares, coins] = await Promise.all([
      alpacaFetch(`${base}/assets?status=active&asset_class=us_equity`, account),
      alpacaFetch(`${base}/assets?status=active&asset_class=crypto`, account).catch(() => [])
    ]);
    const shape = (a: any): Asset => ({
      symbol: a.class === "crypto" ? cryptoSymbol(a.symbol) : a.symbol, name: a.name || "", exchange: a.exchange || "",
      shortable: !!a.shortable, assetClass: a.class === "crypto" ? "crypto" : "us_equity",
      minOrderSize: num(a.min_order_size), minTradeIncrement: num(a.min_trade_increment), priceIncrement: num(a.price_increment)
    });
    assets = [...(Array.isArray(coins) ? coins : []), ...(Array.isArray(shares) ? shares : [])]
      .filter((a: any) => a.tradable)
      .map(shape);
    assetsAt = Date.now();
  }
  return assets;
}

async function search(account: any, q: string) {
  const list = await assetList(account);
  const s = q.trim().toUpperCase();
  if (!s) return { results: [] };
  // "BTC", "BTCUSD" and "BTC/USD" all find Bitcoin.
  const bare = (a: Asset) => a.symbol.replace("/", "");
  const exact = list.filter((a) => a.symbol === s || bare(a) === s);
  const starts = list.filter((a) => !exact.includes(a) && (a.symbol.startsWith(s) || bare(a).startsWith(s)));
  const named = list.filter((a) => !exact.includes(a) && !starts.includes(a) && a.name.toUpperCase().includes(s));
  return { results: [...exact, ...starts.sort((a, b) => a.symbol.length - b.symbol.length), ...named].slice(0, 20) };
}

async function assetFor(account: any, symbol: string) {
  return (await assetList(account)).find((a) => a.symbol === symbol) || null;
}

async function accountView(account: any) {
  const base = tradingBase(account);
  const [acct, positions, orders] = await Promise.all([
    alpacaFetch(`${base}/account`, account),
    alpacaFetch(`${base}/positions`, account),
    alpacaFetch(`${base}/orders?status=open&nested=true&limit=200`, account)
  ]);
  return {
    paper: !!account.is_paper,
    buyingPower: num(acct?.buying_power), cash: num(acct?.cash), equity: num(acct?.equity),
    dayTradeCount: num(acct?.daytrade_count), patternDayTrader: !!acct?.pattern_day_trader,
    positions: (Array.isArray(positions) ? positions : [])
      .filter((p: any) => p.asset_class === "us_equity" || p.asset_class === "crypto")
      .map((p: any) => ({
        symbol: p.asset_class === "crypto" ? cryptoSymbol(p.symbol) : p.symbol, assetClass: p.asset_class,
        qty: num(p.qty), side: p.side, avgPrice: num(p.avg_entry_price), last: num(p.current_price),
        marketValue: num(p.market_value), unrealized: num(p.unrealized_pl), unrealizedPct: num(p.unrealized_plpc),
        today: num(p.unrealized_intraday_pl)
      })),
    orders: (Array.isArray(orders) ? orders : []).map((o: any) => ({
      id: o.id, symbol: o.asset_class === "crypto" ? cryptoSymbol(o.symbol) : o.symbol, assetClass: o.asset_class,
      side: o.side, qty: num(o.qty), notional: num(o.notional), filled: num(o.filled_qty), type: o.type,
      limit: num(o.limit_price), stop: num(o.stop_price), tif: o.time_in_force, status: o.status,
      orderClass: o.order_class || "simple", submittedAt: o.submitted_at,
      legs: (o.legs || []).map((l: any) => ({ id: l.id, side: l.side, type: l.type, limit: num(l.limit_price), stop: num(l.stop_price), status: l.status }))
    }))
  };
}

// What Alpaca's live feeds actually send, read from the server: run from the
// database with a scheduler ticket (no user), through the house data account,
// market data only. It opens the crypto and the stock stream at the same time,
// as marketStream does for a watchlist of both, and for a few seconds counts
// what arrives: trades, quotes, order-book messages, and whether the stock
// feed accepts an order-book subscription at all. The terminal's Level 2 and
// time & sales are built on these answers rather than on memory.
async function feedCheck(url: string, auth: { key: string; secret: string }, subscribe: Record<string, string[]>, seconds: number) {
  const report: any = { url, authenticated: false, subscription: null, errors: [], counts: {}, firstBook: null, firstTrade: null };
  await new Promise<void>((resolve) => {
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) { report.errors.push(String(e)); resolve(); return; }
    const done = () => { try { ws.close(); } catch { /* closed */ } resolve(); };
    const timer = setTimeout(done, seconds * 1000);
    ws.onopen = () => ws.send(JSON.stringify({ action: "auth", ...auth }));
    ws.onmessage = (e) => {
      let msgs: any[] = [];
      try { msgs = JSON.parse(String(e.data)); } catch { return; }
      for (const m of Array.isArray(msgs) ? msgs : []) {
        report.counts[m.T] = (report.counts[m.T] || 0) + 1;
        if (m.T === "success" && m.msg === "authenticated") {
          report.authenticated = true;
          ws.send(JSON.stringify({ action: "subscribe", ...subscribe }));
        }
        if (m.T === "subscription") report.subscription = m;
        if (m.T === "error") report.errors.push(`${m.code}: ${m.msg}`);
        if (m.T === "o" && !report.firstBook) report.firstBook = { symbol: m.S, reset: !!m.r, bids: m.b?.length ?? 0, asks: m.a?.length ?? 0, bestBid: m.b?.[0], bestAsk: m.a?.[0] };
        if (m.T === "t" && !report.firstTrade) report.firstTrade = m;
      }
    };
    ws.onerror = () => report.errors.push("socket error");
    ws.onclose = (e) => { report.closed = { code: e.code, reason: e.reason }; clearTimeout(timer); resolve(); };
  });
  return report;
}

// The terminal's own relay (the code marketStream runs), against the live
// feeds with a stand-in browser: it opens on BTC/USD's book, then switches to
// ETH/USD's, as the terminal does when another coin is picked, and counts what
// comes back. Proves the book arrives whole, keeps updating, and follows the
// selected coin; and that shares and coins stream side by side.
async function relayCheck(auth: { key: string; secret: string }, seconds: number, extra: string[] = []) {
  const got: { at: number; m: any }[] = [];
  const client: any = {
    readyState: WebSocket.OPEN,
    send: (d: string) => got.push({ at: Date.now(), m: JSON.parse(d) }),
    close: () => { client.readyState = WebSocket.CLOSED; }
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // More coins give a thin tape more chances to print while the check listens.
  const more = extra.filter((c) => CRYPTO.test(c)).slice(0, 20);
  relayDetail(client, auth, ["BTC/USD", "ETH/USD", "SPY", "AAPL", ...more], "BTC/USD");
  client.onopen?.();
  await wait(seconds * 500);
  const switchedAt = Date.now();
  client.onmessage?.({ data: JSON.stringify({ action: "set", symbols: ["BTC/USD", "ETH/USD", "SOL/USD", "SPY", ...more], book: "ETH/USD" }) });
  await wait(seconds * 500);
  client.onclose?.();
  const count = (f: (m: any, at: number) => boolean) => got.filter((g) => f(g.m, g.at)).length;
  const firstEth = got.find((g) => g.m.type === "book" && g.m.symbol === "ETH/USD" && g.m.reset)?.m;
  return {
    ready: got.filter((g) => g.m.type === "ready").map((g) => g.m.feed || "set"),
    problems: got.filter((g) => g.m.type === "error" || g.m.type === "feed").map((g) => g.m),
    btcBook: { whole: count((m) => m.type === "book" && m.symbol === "BTC/USD" && m.reset), changes: count((m) => m.type === "book" && m.symbol === "BTC/USD" && !m.reset) },
    // A second's grace for what was already on its way when the switch was sent.
    btcBookAfterSwitch: count((m, at) => m.type === "book" && m.symbol === "BTC/USD" && at > switchedAt + 1000),
    ethBook: { whole: count((m) => m.type === "book" && m.symbol === "ETH/USD" && m.reset), changes: count((m) => m.type === "book" && m.symbol === "ETH/USD" && !m.reset), levels: firstEth ? { bids: firstEth.bids.length, asks: firstEth.asks.length } : null },
    quotes: Object.fromEntries(["BTC/USD", "ETH/USD", "SOL/USD", "SPY", "AAPL"].map((s) => [s, count((m) => m.type === "quote" && m.symbol === s)])),
    trades: got.filter((g) => g.m.type === "trade").map((g) => ({ symbol: g.m.symbol, price: g.m.price, size: g.m.size, takerSide: g.m.takerSide })),
    bars: count((m) => m.type === "bar")
  };
}

// How an account signs in to Alpaca's data streams: its key pair, or, for an
// account connected by OAuth, the word "oauth" and the user's token (Alpaca's
// streaming docs; the token, never the app's client secret). OAuth first, as
// authHeaders does for REST.
const streamAuth = (a: any) =>
  a?.oauth_access_token ? { key: "oauth", secret: a.oauth_access_token }
    : a?.api_key && a?.api_secret ? { key: a.api_key, secret: a.api_secret } : null;

// `only` runs one feed ("stocks" or "crypto"), to tell a per-feed connection
// limit from one shared across feeds; `seconds` listens longer, for a thin
// tape; `accountId` signs in with another account, when the house account's
// one connection per feed is in use (a terminal open on it, say).
async function selftest(admin: any, only = "", seconds = 8, accountId = "", extra: string[] = []) {
  let house = await houseDataAccount(admin);
  if (accountId) {
    const { data } = await admin.from("trading_accounts").select("*").eq("id", accountId).maybeSingle();
    house = data && {
      ...data,
      api_key: await decryptSecret(data.api_key), api_secret: await decryptSecret(data.api_secret),
      oauth_access_token: await decryptSecret(data.oauth_access_token)
    };
  }
  const auth = streamAuth(house);
  if (!auth) return { error: "That account has no way to sign in to the streams." };
  const listen = Math.min(only === "relay" ? 120 : 60, Math.max(3, Number(seconds) || 8));
  if (only === "relay") return { at: new Date().toISOString(), signIn: auth.key === "oauth" ? "oauth" : "key pair", relay: await relayCheck(auth, listen, extra) };
  const coins = ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "LTC/USD"];
  const [crypto, stocks, coinAssets] = await Promise.all([
    only === "stocks" ? null : feedCheck("wss://stream.data.alpaca.markets/v1beta3/crypto/us", auth,
      { trades: coins, quotes: coins, bars: coins, orderbooks: ["BTC/USD"] }, listen),
    only === "crypto" ? null : feedCheck(`wss://stream.data.alpaca.markets/v2/${FEED}`, auth,
      { trades: ["SPY", "AAPL"], quotes: ["SPY", "AAPL"], orderbooks: ["AAPL"] }, listen),
    alpacaFetch(`${tradingBase(house)}/assets?status=active&asset_class=crypto`, house).catch((e: Error) => ({ error: e.message }))
  ]);
  const sample = Array.isArray(coinAssets)
    ? coinAssets.filter((a: any) => coins.includes(a.symbol)).map((a: any) => ({
      symbol: a.symbol, tradable: a.tradable, min_order_size: a.min_order_size, min_trade_increment: a.min_trade_increment, price_increment: a.price_increment
    }))
    : coinAssets;
  return { at: new Date().toISOString(), signIn: auth.key === "oauth" ? "oauth" : "key pair", crypto, stocks, cryptoAssets: { count: Array.isArray(coinAssets) ? coinAssets.length : null, sample } };
}

async function placeOrder(admin: any, user: any, account: any, input: any) {
  if (!account.is_paper) {
    return { status: 403, body: { error: "Orders from the terminal go to paper accounts only during this test. Choose a paper account." } };
  }
  const crypto = isCrypto(cryptoSymbol(input?.symbol));
  let built;
  if (crypto) {
    const symbol = cryptoSymbol(input.symbol);
    // What is held, for the no-short-sales check: Alpaca's positions write the
    // coin without its slash.
    const positions = await alpacaFetch(`${tradingBase(account)}/positions`, account);
    const held = (Array.isArray(positions) ? positions : []).find((p: any) => p.asset_class === "crypto" && cryptoSymbol(p.symbol) === symbol);
    built = cryptoOrderBody(input, `TERM_${Date.now()}`, await assetFor(account, symbol), num(held?.qty) || 0);
  } else {
    built = stockOrderBody(input, `TERM_${Date.now()}`);
  }
  if (!built.ok) return { status: 400, body: { error: built.reason } };
  const body = built.body as any;
  const attempt = {
    userId: user.id, accountId: account.id, intent: "open", ticker: body.symbol,
    legs: [{ symbol: body.symbol, side: body.side, ratio: 1 }], qty: Number(body.qty), orderType: body.type,
    limitPrice: body.limit_price ?? null, quote: input.reference ? { reference: input.reference } : null
  };
  try {
    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, { method: "POST", body: JSON.stringify(body) });
    await recordAttempt(admin, { ...attempt, brokerOrderId: order.id, status: order.status });
    return { status: 200, body: { orderId: order.id, status: order.status } };
  } catch (e) {
    const message = brokerRefusal(String((e as Error)?.message || e), body.symbol);
    await recordAttempt(admin, { ...attempt, error: message });
    return { status: 422, body: { error: message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    if (!(await readSettings(admin)).terminalLab) {
      return jsonResponse({ error: "The trading terminal is not available here." }, 404);
    }
    const body = await req.json().catch(() => ({}));
    if (body?.action === "selftest") {
      if (!(await redeemCronTicket(admin, body.ticket, "terminal_selftest"))) return jsonResponse({ error: "not authorised" }, 401);
      const report = await selftest(admin, String(body.only || ""), Number(body.seconds) || 8, String(body.accountId || ""),
        (Array.isArray(body.coins) ? body.coins : []).map((c: unknown) => String(c).toUpperCase()));
      console.log(`terminal selftest: ${JSON.stringify(report)}`);
      return jsonResponse(report);
    }

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const { action, accountId } = body || {};
    if (!accountId) return jsonResponse({ error: "Choose an account." }, 400);
    const account = await loadAccount(admin, accountId, user.id);

    const symbol = String(body.symbol || "").toUpperCase().trim();
    if (action === "bars") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await bars(account, symbol, String(body.interval || "5Min")));
    }
    if (action === "snapshot") {
      const list = (Array.isArray(body.symbols) ? body.symbols : [symbol]).map((s: string) => String(s).toUpperCase().trim());
      return jsonResponse(await snapshot(account, list));
    }
    if (action === "search") return jsonResponse(await search(account, String(body.q || "")));
    if (action === "asset") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse({ asset: await assetFor(account, symbol) });
    }
    if (action === "account") return jsonResponse(await accountView(account));
    if (action === "trades") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await trades(account, symbol));
    }
    if (action === "book") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await book(account, symbol));
    }
    if (action === "order") {
      const r = await placeOrder(admin, user, account, body.order || {});
      return jsonResponse(r.body, r.status);
    }
    return jsonResponse({ error: `Unknown action "${action}"` }, 400);
  } catch (error) {
    return jsonResponse({ error: brokerRefusal(String((error as Error)?.message || error)) }, 500);
  }
});
