import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import { readSettings } from "../_shared/settings.ts";
import { recordAttempt } from "../_shared/orderAttempts.ts";
import { brokerRefusal } from "../_shared/orderWarnings.ts";
import { stockOrderBody, SYMBOL } from "../_shared/stockOrder.ts";

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

const DATA = "https://data.alpaca.markets/v2";
const FEED = "iex";

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
  const start = new Date(Date.now() - r.days * 86400000).toISOString();
  const out: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const url = `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${r.tf}&start=${start}&limit=10000` +
      `&feed=${FEED}&adjustment=split&sort=asc` + (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    for (const b of page?.bars || []) {
      out.push({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    }
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && pages < 5);
  return { symbol, interval, feed: FEED, bars: out };
}

async function snapshot(account: any, symbols: string[]) {
  const list = symbols.filter((s) => SYMBOL.test(s)).slice(0, 50);
  if (!list.length) return { quotes: {} };
  const snaps = await alpacaFetch(`${DATA}/stocks/snapshots?symbols=${list.join(",")}&feed=${FEED}`, account);
  const quotes: Record<string, any> = {};
  for (const s of list) {
    const d = snaps?.[s];
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

// Every tradable US share, held for the life of this function instance: the
// list is large and changes rarely, and search runs on every keystroke.
let assets: { symbol: string; name: string; exchange: string; shortable: boolean }[] | null = null;
let assetsAt = 0;

async function search(account: any, q: string) {
  if (!assets || Date.now() - assetsAt > 6 * 3600000) {
    const list = await alpacaFetch(`${tradingBase(account)}/assets?status=active&asset_class=us_equity`, account);
    assets = (Array.isArray(list) ? list : [])
      .filter((a: any) => a.tradable)
      .map((a: any) => ({ symbol: a.symbol, name: a.name || "", exchange: a.exchange || "", shortable: !!a.shortable }));
    assetsAt = Date.now();
  }
  const s = q.trim().toUpperCase();
  if (!s) return { results: [] };
  const exact = assets.filter((a) => a.symbol === s);
  const starts = assets.filter((a) => a.symbol !== s && a.symbol.startsWith(s));
  const named = assets.filter((a) => !a.symbol.startsWith(s) && a.name.toUpperCase().includes(s));
  return { results: [...exact, ...starts.sort((a, b) => a.symbol.length - b.symbol.length), ...named].slice(0, 20) };
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
      .filter((p: any) => p.asset_class === "us_equity")
      .map((p: any) => ({
        symbol: p.symbol, qty: num(p.qty), side: p.side, avgPrice: num(p.avg_entry_price), last: num(p.current_price),
        marketValue: num(p.market_value), unrealized: num(p.unrealized_pl), unrealizedPct: num(p.unrealized_plpc),
        today: num(p.unrealized_intraday_pl)
      })),
    orders: (Array.isArray(orders) ? orders : []).map((o: any) => ({
      id: o.id, symbol: o.symbol, side: o.side, qty: num(o.qty), filled: num(o.filled_qty), type: o.type,
      limit: num(o.limit_price), stop: num(o.stop_price), tif: o.time_in_force, status: o.status,
      orderClass: o.order_class || "simple", submittedAt: o.submitted_at,
      legs: (o.legs || []).map((l: any) => ({ id: l.id, side: l.side, type: l.type, limit: num(l.limit_price), stop: num(l.stop_price), status: l.status }))
    }))
  };
}

// Whether the stock feed carries an order book (Level 2). Alpaca documents
// order books for crypto only; rather than state that from memory, the
// terminal asks the feed itself and shows its answer. Three seconds, one
// symbol, then closed: it holds the account's single data connection only
// that long.
async function depth(account: any, symbol: string) {
  const replies: any[] = [];
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`wss://stream.data.alpaca.markets/v2/${FEED}`);
    const done = () => { try { ws.close(); } catch { /* closed */ } resolve(); };
    const timer = setTimeout(done, 3000);
    ws.onopen = () => ws.send(JSON.stringify({ action: "auth", key: account.api_key, secret: account.api_secret }));
    ws.onmessage = (e) => {
      let msgs: any[] = [];
      try { msgs = JSON.parse(String(e.data)); } catch { return; }
      for (const m of Array.isArray(msgs) ? msgs : []) {
        replies.push(m);
        if (m.T === "success" && m.msg === "authenticated") ws.send(JSON.stringify({ action: "subscribe", orderbooks: [symbol] }));
      }
    };
    ws.onerror = () => { clearTimeout(timer); done(); };
  });
  const book = replies.find((m) => m.T === "o");
  const sub = replies.find((m) => m.T === "subscription");
  const error = replies.find((m) => m.T === "error");
  return {
    symbol,
    available: !!book || !!(sub?.orderbooks?.length),
    reply: error ? `${error.code}: ${error.msg}` : sub ? JSON.stringify(sub) : replies.length ? JSON.stringify(replies.at(-1)) : "no reply"
  };
}

async function placeOrder(admin: any, user: any, account: any, input: any) {
  if (!account.is_paper) {
    return { status: 403, body: { error: "Orders from the terminal go to paper accounts only during this test. Choose a paper account." } };
  }
  const built = stockOrderBody(input, `TERM_${Date.now()}`);
  if (!built.ok) return { status: 400, body: { error: built.reason } };
  const body = built.body as any;
  const attempt = {
    userId: user.id, accountId: account.id, intent: "open", ticker: body.symbol,
    legs: [{ symbol: body.symbol, side: body.side, ratio: 1 }], qty: body.qty, orderType: body.type,
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
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const admin = adminClient();
    if (!(await readSettings(admin)).terminalLab) {
      return jsonResponse({ error: "The trading terminal is not available here." }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const { action, accountId } = body || {};
    if (!accountId) return jsonResponse({ error: "Choose an account." }, 400);
    const account = await loadAccount(admin, accountId, user.id);

    const symbol = String(body.symbol || "").toUpperCase().trim();
    if (action === "bars") {
      if (!SYMBOL.test(symbol)) return jsonResponse({ error: "Choose a stock symbol." }, 400);
      return jsonResponse(await bars(account, symbol, String(body.interval || "5Min")));
    }
    if (action === "snapshot") {
      const list = (Array.isArray(body.symbols) ? body.symbols : [symbol]).map((s: string) => String(s).toUpperCase().trim());
      return jsonResponse(await snapshot(account, list));
    }
    if (action === "search") return jsonResponse(await search(account, String(body.q || "")));
    if (action === "account") return jsonResponse(await accountView(account));
    if (action === "depth") {
      if (!SYMBOL.test(symbol)) return jsonResponse({ error: "Choose a stock symbol." }, 400);
      if (!account.api_key || !account.api_secret) return jsonResponse({ symbol, available: false, reply: "This account has no API key pair to ask the feed with." });
      return jsonResponse(await depth(account, symbol));
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
