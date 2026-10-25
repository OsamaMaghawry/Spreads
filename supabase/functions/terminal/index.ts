import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import { readSettings } from "../_shared/settings.ts";
import { recordAttempt, updateAttempt } from "../_shared/orderAttempts.ts";
import { brokerRefusal } from "../_shared/orderWarnings.ts";
import { stockOrderBody, SYMBOL } from "../_shared/stockOrder.ts";
import { cryptoOrderBody, cryptoSymbol, isCrypto, CRYPTO } from "../_shared/cryptoOrder.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { houseDataAccount } from "../_shared/marketData.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { relayDetail } from "../_shared/terminalRelay.ts";
import { sessionCandles } from "../_shared/sessionBars.ts";
import { currentReports } from "../_shared/earnings.ts";
import { secReports, withFigures, earningsTimeline, cikMap } from "../_shared/earningsHistory.ts";
import { dailyStats, isFundName } from "../_shared/screenStats.ts";
import { historyRow, premarket, nyMoment } from "../_shared/screenHistory.ts";
import { usSession, stopPlan, exitPlan, tradeSize, partialQty, targetPlan, existingExits, exitBody } from "../_shared/positionTools.ts";
import { inBackground } from "../_shared/background.ts";

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

// How far back each chart interval reads, and the bar size it asks for:
// Alpaca's own bars from one minute to a month ("all the time intervals ...
// from Monthly down to 5 seconds", 24 Oct). Its bars stop at one minute;
// seconds candles are built here from the trades (SECONDS, below).
const RANGES: Record<string, { tf: string; days: number }> = {
  "1Min": { tf: "1Min", days: 4 },
  "2Min": { tf: "2Min", days: 6 },
  "3Min": { tf: "3Min", days: 8 },
  "5Min": { tf: "5Min", days: 10 },
  "10Min": { tf: "10Min", days: 20 },
  "15Min": { tf: "15Min", days: 30 },
  "30Min": { tf: "30Min", days: 60 },
  "1Hour": { tf: "1Hour", days: 120 },
  "2Hour": { tf: "2Hour", days: 240 },
  "4Hour": { tf: "4Hour", days: 365 },
  "1Day": { tf: "1Day", days: 1825 },
  "1Week": { tf: "1Week", days: 3650 },
  "1Month": { tf: "1Month", days: 7300 }
};
const SECONDS: Record<string, number> = { "5Sec": 5, "10Sec": 10, "15Sec": 15, "30Sec": 30 };
const TRADES_FOR_SECONDS = 10000;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Seconds candles: the latest trades (up to ten thousand), bucketed. On a busy
// share that is the last hour or two; on a thin coin, days. A candle exists
// only where a trade did, as on any trade-built chart.
async function secondBars(account: any, symbol: string, interval: string) {
  const step = SECONDS[interval];
  const crypto = isCrypto(symbol);
  const start = new Date(Date.now() - 7 * 86400000).toISOString();
  const trades: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const url = (crypto
      ? `${CRYPTO_DATA}/trades?symbols=${encodeURIComponent(symbol)}&start=${start}&limit=10000&sort=desc`
      : `${DATA}/stocks/${encodeURIComponent(symbol)}/trades?feed=${FEED}&start=${start}&limit=10000&sort=desc`) +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    trades.push(...((crypto ? page?.trades?.[symbol] : page?.trades) || []));
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && trades.length < TRADES_FOR_SECONDS && pages < 10);
  const out: any[] = [];
  for (const t of trades.slice(0, TRADES_FOR_SECONDS).reverse()) {
    const price = num(t.p);
    const size = num(t.s) || 0;
    const sec = Math.floor(Date.parse(t.t) / 1000);
    if (price === null || !Number.isFinite(sec)) continue;
    const time = Math.floor(sec / step) * step;
    const last = out.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, price); last.low = Math.min(last.low, price); last.close = price; last.volume += size;
    } else {
      out.push({ time, open: price, high: price, low: price, close: price, volume: size });
    }
  }
  return { symbol, interval, feed: crypto ? "crypto" : FEED, bars: out, fromTrades: true };
}

// A share's hourly candles on a regular-hours chart, aligned to the session:
// 9:30-10:30, 10:30-11:30 ... 15:30-16:00, as TradingView draws them. Alpaca's
// own hourly bars run on the clock (9:00-10:00), so the first of each day
// carried half an hour of pre-market prices into a regular-hours chart: on
// 23 Oct, AAPL's 9:00 bar opened at 347.51 while the session opened at
// 349.155, and the hourly chart disagreed with the minute one ("the prices
// levels are different between the intervals", 24 Oct). Built here from
// 30-minute bars, which do start at 9:30.
const HOUR_SPANS: Record<string, number> = { "1Hour": 60, "2Hour": 120, "4Hour": 240 };

async function sessionHours(account: any, symbol: string, interval: string) {
  const span = HOUR_SPANS[interval];
  const start = new Date(Date.now() - RANGES[interval].days * 86400000).toISOString();
  const halves = (await allPages(account,
    `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=30Min&start=${start}&limit=10000&feed=${FEED}&adjustment=split&sort=desc`,
    (page) => page?.bars, 8)).reverse();
  const out = sessionCandles(halves, span);
  return { symbol, interval, feed: FEED, bars: out, session: "regular" };
}

// How far back a coin's intraday charts read. Alpaca serves crypto history a
// week per page whatever the limit asked (measured 24 Oct: 168 one-hour
// candles, 43 four-hour, 697 fifteen-minute per page), so each week is a
// request. Read oldest first and stopped after five pages, the one-hour chart
// covered late June to late July and never reached today: its price axis sat
// near 63,000 with BTC at 80,500 ("The hourly chart still has an issue").
// Now the weeks are read together and always end now.
const CRYPTO_DAYS: Record<string, number> = {
  "1Min": 2, "2Min": 4, "3Min": 4, "5Min": 10, "10Min": 20, "15Min": 30, "30Min": 60, "1Hour": 70, "2Hour": 70, "4Hour": 70
};
const WEEK_MS = 7 * 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const candle = (b: any) => ({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });

// Every page of one request, following Alpaca's page token.
async function allPages(account: any, url: string, pick: (page: any) => any[], maxPages: number) {
  const out: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const page = await alpacaFetch(url + (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
    out.push(...(pick(page) || []));
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && pages < maxPages);
  return out;
}

async function bars(account: any, symbol: string, interval: string, session = "") {
  if (SECONDS[interval]) return secondBars(account, symbol, interval);
  if (session === "regular" && HOUR_SPANS[interval] && !isCrypto(symbol)) return sessionHours(account, symbol, interval);
  const r = RANGES[interval] || RANGES["5Min"];
  const crypto = isCrypto(symbol);
  const end = Date.now();

  if (crypto && CRYPTO_DAYS[r.tf]) {
    const start = end - CRYPTO_DAYS[r.tf] * 86400000;
    const windows: [number, number][] = [];
    for (let s = start; s < end; s += WEEK_MS) windows.push([s, Math.min(end, s + WEEK_MS)]);
    const chunks = await Promise.all(windows.map(([s, e]) => allPages(account,
      `${CRYPTO_DATA}/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${r.tf}&start=${iso(s)}&end=${iso(e)}&limit=10000&sort=asc`,
      (page) => page?.bars?.[symbol], 4)));
    // A candle on a window's edge can come back in both; keep one of each.
    const byTime = new Map<number, any>();
    for (const b of chunks.flat()) byTime.set(Math.floor(Date.parse(b.t) / 1000), b);
    const out = [...byTime.values()].map(candle).sort((x, y) => x.time - y.time);
    return { symbol, interval, feed: "crypto", bars: out };
  }

  // Everything else newest first, then put in order: if the pages run out
  // before the start, what is missing is the oldest end, never today's.
  const start = iso(end - r.days * 86400000);
  const list = await allPages(account, crypto
    ? `${CRYPTO_DATA}/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${r.tf}&start=${start}&limit=10000&sort=desc`
    : `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${r.tf}&start=${start}&limit=10000&feed=${FEED}&adjustment=split&sort=desc`,
  (page) => (crypto ? page?.bars?.[symbol] : page?.bars), 8);
  return { symbol, interval, feed: crypto ? "crypto" : FEED, bars: list.map(candle).reverse() };
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
  symbol: string; name: string; exchange: string; shortable: boolean; fractionable: boolean; assetClass: "us_equity" | "crypto";
  minOrderSize: number | null; minTradeIncrement: number | null; priceIncrement: number | null;
  options: boolean; easyToBorrow: boolean;
};
let assets: Asset[] | null = null;
let assetsAt = 0;

const shape = (a: any): Asset => ({
  symbol: a.class === "crypto" ? cryptoSymbol(a.symbol) : a.symbol, name: a.name || "", exchange: a.exchange || "",
  shortable: !!a.shortable, fractionable: !!a.fractionable, assetClass: a.class === "crypto" ? "crypto" : "us_equity",
  minOrderSize: num(a.min_order_size), minTradeIncrement: num(a.min_trade_increment), priceIncrement: num(a.price_increment),
  options: Array.isArray(a.attributes) && a.attributes.includes("has_options"), easyToBorrow: !!a.easy_to_borrow
});

async function assetList(account: any): Promise<Asset[]> {
  if (!assets || Date.now() - assetsAt > 6 * 3600000) {
    const base = tradingBase(account);
    const [shares, coins] = await Promise.all([
      alpacaFetch(`${base}/assets?status=active&asset_class=us_equity`, account),
      alpacaFetch(`${base}/assets?status=active&asset_class=crypto`, account).catch(() => [])
    ]);
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

// One symbol's asset: from the whole list when this instance has it, else
// the broker's single-asset lookup. An order does not wait for the list of
// every listed share (two large reads, a second or two on a fresh instance;
// the first ETH order of 25 Oct took 2.3 s for it).
const oneAsset = new Map<string, { at: number; asset: Asset | null }>();
async function assetFor(account: any, symbol: string) {
  if (assets && Date.now() - assetsAt < 6 * 3600000) return assets.find((a) => a.symbol === symbol) || null;
  const hit = oneAsset.get(symbol);
  if (hit && Date.now() - hit.at < 3600000) return hit.asset;
  const base = tradingBase(account);
  const a = await alpacaFetch(`${base}/assets/${encodeURIComponent(symbol)}`, account)
    .catch(() => (symbol.includes("/") ? alpacaFetch(`${base}/assets/${symbol.replace("/", "")}`, account) : null))
    .catch(() => null);
  const asset = a && a.tradable ? shape(a) : null;
  oneAsset.set(symbol, { at: Date.now(), asset });
  return asset;
}

// ---------- earnings on the chart ----------
//
// Past reports from the SEC (8-K Item 2.02, with the moment filed), the next
// one from the cached calendar, and EPS from the calendar's provider where
// its free tier has it (earningsHistory.ts). None of it is price data, so it
// is held for every caller alike for a few hours.

const SEC_HEADERS = { "User-Agent": "DeltaMint support@deltamint.app", Accept: "application/json" };
const SEC_TTL = 24 * 3600000;
const EVENTS_TTL = 6 * 3600000;
let ciks: Map<string, string> | null = null;
let ciksAt = 0;
const earningsCache = new Map<string, { at: number; body: any }>();

async function secJson(url: string) {
  const r = await fetch(url, { headers: SEC_HEADERS });
  if (!r.ok) throw new Error(`SEC answered ${r.status}`);
  return r.json();
}

async function cikFor(symbol: string) {
  if (!ciks || Date.now() - ciksAt > SEC_TTL) {
    ciks = cikMap(await secJson("https://www.sec.gov/files/company_tickers.json"));
    ciksAt = Date.now();
  }
  return ciks.get(symbol) || null;
}

async function secHistory(symbol: string) {
  const cik = await cikFor(symbol);
  if (!cik) return { reports: [], note: "no SEC filer under this symbol" };
  const sub = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  let reports = secReports(sub?.filings?.recent);
  // A busy filer's recent list covers about a year; a chart shows more.
  const twoYears = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  // A bank's filing pages are short (prospectuses by the hundred), so walk
  // up to three older pages until two years are covered.
  for (const file of (sub?.filings?.files || []).slice(0, 3)) {
    if (reports.length && reports[0].date <= twoYears) break;
    const more = await secJson(`https://data.sec.gov/submissions/${file.name}`).catch(() => null);
    const seen = new Set(reports.map((r) => r.date));
    reports = [...secReports(more).filter((r) => !seen.has(r.date)), ...reports].sort((a, b) => a.date.localeCompare(b.date));
  }
  return { reports, note: null };
}

const nyDate = (ms = Date.now()) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function earningsFor(admin: any, symbol: string) {
  const hit = earningsCache.get(symbol);
  if (hit && Date.now() - hit.at < EVENTS_TTL) return hit.body;
  const today = nyDate();
  const token = Deno.env.get("EARNINGS_API_KEY");
  const finnhub = (path: string) => (token
    ? fetch(`https://finnhub.io/api/v1${path}&token=${token}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    : Promise.resolve(null));
  const from = nyDate(Date.now() - 35 * 86400000);
  const to = nyDate(Date.now() + 120 * 86400000);
  const [sec, cached, surprises, calendar] = await Promise.all([
    secHistory(symbol).catch((e: Error) => ({ reports: [], note: e.message })),
    admin.from("earnings_calendar").select("symbol, report_date, session, fetched_at").eq("symbol", symbol),
    finnhub(`/stock/earnings?symbol=${encodeURIComponent(symbol)}`),
    finnhub(`/calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`)
  ]);
  const rows = currentReports(cached?.data || []);
  const cal = calendar?.earningsCalendar || [];
  const reports = earningsTimeline(withFigures(sec.reports, surprises || [], cal), rows, cal, today);
  const body = {
    symbol, earnings: reports,
    sources: { sec: sec.reports.length, secNote: sec.note, calendar: rows.length, figures: Array.isArray(surprises) && surprises.length > 0 }
  };
  earningsCache.set(symbol, { at: Date.now(), body });
  return body;
}

// ---------- the stock screener ----------
//
// "Stock Screener, with some extensive filtrations like the advanced tools to
// see the stocks in play" (24 Oct). Two reads, both with the caller's own
// account. `universe`: every listed US share's snapshot, so the screen covers
// the whole market, not a list; refreshed on demand. `daily`: a year of daily
// candles for the symbols the screen asks about, reduced to the numbers that
// move once a day (screenStats.ts); the browser keeps those for the day. The
// browser combines the two and filters as the trader types (src/lib/screener.js).
//
// Volume: the free IEX feed carries IEX's own trades only, a few percent of
// the market, which would make every volume filter wrong. So volume and the
// day's candle come from the consolidated tape, fifteen minutes delayed (all
// an account without a paid data plan may read), and the price from IEX in
// real time. Daily candles are consolidated too.

const SCREEN_EXCHANGES = new Set(["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"]);
const SNAP_CHUNK = 800;
const DAILY_MAX = 200;

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

// Shares outstanding as companies state them on their latest 10-Q or 10-K
// cover (SEC XBRL frames, dei:EntityCommonStockSharesOutstanding): one file
// per quarter for every filer, the latest per company kept. Companies with
// several share classes state them per class and are left out (no market cap
// shown rather than a wrong one).
let sharesByCik: Map<string, number> | null = null;
let sharesAt = 0;
async function sharesOutstanding() {
  if (sharesByCik && Date.now() - sharesAt < SEC_TTL) return sharesByCik;
  const now = new Date();
  const frames: string[] = [];
  for (let back = 0; back < 4; back++) {
    const q = Math.floor(now.getUTCMonth() / 3) - back;
    const y = now.getUTCFullYear() + Math.floor(q / 4);
    frames.push(`CY${y}Q${((q % 4) + 4) % 4 + 1}I`);
  }
  const files = await Promise.all(frames.map((f) =>
    secJson(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/${f}.json`).catch(() => null)));
  const latest = new Map<string, { end: string; val: number }>();
  for (const file of files) {
    for (const row of file?.data || []) {
      const cik = String(row.cik).padStart(10, "0");
      const cur = latest.get(cik);
      if (num(row.val) && (!cur || String(row.end) > cur.end)) latest.set(cik, { end: String(row.end), val: Number(row.val) });
    }
  }
  sharesByCik = new Map([...latest].map(([k, v]) => [k, v.val]));
  sharesAt = Date.now();
  return sharesByCik;
}

// The next report within six weeks for every symbol in the cached calendar.
async function upcomingEarnings(admin: any) {
  const today = nyDate();
  const through = nyDate(Date.now() + 42 * 86400000);
  const rows: any[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await admin.from("earnings_calendar").select("symbol, report_date, session, fetched_at")
      .gte("report_date", today).lte("report_date", nyDate(Date.now() + 90 * 86400000))
      .order("report_date").range(page * 1000, page * 1000 + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const next: Record<string, [string, string | null]> = {};
  for (const r of currentReports(rows).sort((a, b) => a.report_date.localeCompare(b.report_date))) {
    if (r.report_date > through || next[r.symbol]) continue;
    next[r.symbol] = [r.report_date, r.session];
  }
  return next;
}

async function snapsFor(account: any, symbols: string[], feed: string) {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += SNAP_CHUNK) chunks.push(symbols.slice(i, i + SNAP_CHUNK));
  const parts = await inBatches(chunks, 6, (c) => alpacaFetch(`${DATA}/stocks/snapshots?symbols=${c.join(",")}&feed=${feed}`, account));
  return Object.assign({}, ...parts.map((p) => p || {}));
}

const SCREEN_COLUMNS = [
  "symbol", "name", "exchange", "price", "priceAt", "day", "prevClose", "open", "high", "low", "close", "volume", "prevVolume", "vwap", "trades",
  "bid", "ask", "options", "shortable", "easyToBorrow", "fund", "shares", "earnDate", "earnSession"
];

async function screenUniverse(admin: any, account: any) {
  const list = (await assetList(account)).filter((a) => a.assetClass === "us_equity" && SCREEN_EXCHANGES.has(a.exchange) && SYMBOL.test(a.symbol));
  const symbols = list.map((a) => a.symbol);
  // The day's candle and volume from the delayed consolidated tape; IEX
  // alone if the account cannot read that.
  let dayFeed = "delayed_sip";
  const [iex, day, earnings, shares] = await Promise.all([
    snapsFor(account, symbols, FEED),
    snapsFor(account, symbols, "delayed_sip").catch(() => { dayFeed = FEED; return null; }),
    upcomingEarnings(admin).catch(() => ({} as Record<string, [string, string | null]>)),
    sharesOutstanding().catch(() => null),
    cikFor("AAPL").catch(() => null)
  ]);
  const rows: any[][] = [];
  for (const a of list) {
    const live = iex?.[a.symbol];
    const d = day?.[a.symbol] || live;
    if (!d && !live) continue;
    // The later of the two last trades: IEX's is real time but may be hours
    // old on a thin name; the consolidated one is fifteen minutes behind.
    const liveAt = live?.latestTrade?.t ? Date.parse(live.latestTrade.t) : 0;
    const dayAt = d?.latestTrade?.t ? Date.parse(d.latestTrade.t) : 0;
    const useLive = liveAt >= dayAt && num(live?.latestTrade?.p) !== null;
    const price = useLive ? num(live.latestTrade.p) : num(d?.latestTrade?.p) ?? num(d?.dailyBar?.c);
    if (price === null) continue;
    const cik = ciks?.get(a.symbol);
    rows.push([
      a.symbol, a.name, a.exchange, price, (useLive ? live?.latestTrade?.t : d?.latestTrade?.t) || null,
      // The day the day's candle belongs to (Alpaca stamps it at New York midnight).
      d?.dailyBar?.t ? nyDate(Date.parse(d.dailyBar.t) + 3600000) : null,
      num(d?.prevDailyBar?.c), num(d?.dailyBar?.o), num(d?.dailyBar?.h), num(d?.dailyBar?.l), num(d?.dailyBar?.c), num(d?.dailyBar?.v), num(d?.prevDailyBar?.v),
      num(d?.dailyBar?.vw), num(d?.dailyBar?.n),
      num(live?.latestQuote?.bp), num(live?.latestQuote?.ap),
      a.options, a.shortable, a.easyToBorrow, isFundName(a.name),
      cik && shares ? shares.get(cik) ?? null : null,
      earnings[a.symbol]?.[0] ?? null, earnings[a.symbol]?.[1] ?? null
    ]);
  }
  return { columns: SCREEN_COLUMNS, rows, dayFeed, priceFeed: FEED, at: new Date().toISOString(), listed: list.length };
}

// `asOf`: a past date for the historical screen, whose daily numbers are
// those of the days before it.
async function screenDaily(account: any, symbols: string[], asOf = "") {
  const list = [...new Set(symbols.map((s) => String(s).toUpperCase()))].filter((s) => SYMBOL.test(s)).slice(0, DAILY_MAX);
  if (!list.length) return { stats: {}, feed: "sip" };
  const past = /^\d{4}-\d{2}-\d{2}$/.test(asOf) && asOf < nyDate() ? asOf : "";
  const until = past ? Date.parse(`${past}T00:00:00Z`) : Date.now();
  const start = iso(until - 380 * 86400000);
  // Consolidated history ends fifteen minutes back for an account without a
  // paid data plan; finished days are all the screen uses anyway.
  const end = iso(past ? until : Date.now() - 16 * 60000);
  const read = async (feed: string) => {
    const all: Record<string, any[]> = {};
    let token: string | null = null;
    let pages = 0;
    do {
      const page = await alpacaFetch(`${DATA}/stocks/bars?symbols=${list.join(",")}&timeframe=1Day&start=${start}&end=${end}&limit=10000&feed=${feed}&adjustment=split` +
        (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
      for (const [s, bars] of Object.entries(page?.bars || {})) (all[s] = all[s] || []).push(...(bars as any[]));
      token = page?.next_page_token || null;
      pages += 1;
    } while (token && pages < 12);
    return all;
  };
  let feed = "sip";
  const bars = await read("sip").catch(() => { feed = FEED; return read(FEED); });
  const today = past || nyDate();
  const stats: Record<string, any> = {};
  for (const s of list) stats[s] = dailyStats(bars[s] || [], today);
  return { stats, feed };
}

// ---------- the historical screen ----------
//
// "Historical screener to filter stock in history to get the criteria for
// the stocks in play at that period" (25 Oct). Every listed share's daily
// candles from six weeks before a past date through it, read in slices of
// symbols together and reduced to one row each as they arrive
// (_shared/screenHistory.ts); at the open, the pre-market of the shares that
// gapped most, from their one-minute candles (stage "premarket", for the
// symbols the screen picks). The market comes in parts (`part` of `parts`):
// a function has about two seconds of processor time a request, and the
// whole market's candles in one request took more (25 Oct, "CPU Time
// exceeded"). Each part is kept by the instance a few hours per account and
// date: the past does not change.
//
// The universe is the shares listed today: a company delisted since is
// missing (survivorship), and names, shares outstanding and options are
// today's.

const HISTORY_COLUMNS = [
  "symbol", "name", "exchange", "price", "priceAt", "day", "prevClose", "open", "high", "low", "close", "volume", "prevVolume", "vwap", "trades",
  "bid", "ask", "options", "shortable", "easyToBorrow", "fund", "shares", "earnDate", "earnSession",
  "lastDate", "lastClose", "avgVol20", "avgDollar20", "atr14", "sma20", "d5", "d21", "pmVolume", "pmHigh", "pmLow", "pmLast"
];
const HISTORY_CHUNK = 300;
const PM_CANDIDATES = 300;
const PM_CHUNK = 25;
const historyCache = new Map<string, { at: number; value: any }>();

const pastDateProblem = (date: string) => (!/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick a date."
  : date < "2016-01-04" ? "Alpaca's history starts in 2016."
    : date >= nyDate() ? "Pick a day before today: today is the live screen." : null);

async function screenHistory(account: any, date: string, asOf: "open" | "close", partIn = 0, partsIn = 1) {
  const problem = pastDateProblem(date);
  if (problem) return { error: problem };
  const parts = Math.min(8, Math.max(1, Math.floor(partsIn) || 1));
  const part = Math.min(parts - 1, Math.max(0, Math.floor(partIn) || 0));
  const key = `${account.id}|${date}|${asOf}|${part}/${parts}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600000) return hit.value;

  const everyone = (await assetList(account)).filter((a) => a.assetClass === "us_equity" && SCREEN_EXCHANGES.has(a.exchange) && SYMBOL.test(a.symbol));
  const size = Math.ceil(everyone.length / parts);
  const list = everyone.slice(part * size, (part + 1) * size);
  const [shares] = await Promise.all([sharesOutstanding().catch(() => null), cikFor("AAPL").catch(() => null)]);
  const start = iso(Date.parse(`${date}T00:00:00Z`) - 45 * 86400000);
  const end = iso(Date.parse(`${date}T23:59:59Z`));
  let feed = "sip";
  const readDaily = async (symbols: string[], f: string) => {
    const all: Record<string, any[]> = {};
    let token: string | null = null;
    let pages = 0;
    do {
      const page = await alpacaFetch(`${DATA}/stocks/bars?symbols=${symbols.join(",")}&timeframe=1Day&start=${start}&end=${end}&limit=10000&feed=${f}&adjustment=split` +
        (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
      for (const [sym, bars] of Object.entries(page?.bars || {})) (all[sym] = all[sym] || []).push(...(bars as any[]));
      token = page?.next_page_token || null;
      pages += 1;
    } while (token && pages < 8);
    return all;
  };
  const chunks: Asset[][] = [];
  for (let i = 0; i < list.length; i += HISTORY_CHUNK) chunks.push(list.slice(i, i + HISTORY_CHUNK));
  const found: { a: Asset; r: NonNullable<ReturnType<typeof historyRow>> }[] = [];
  await inBatches(chunks, 6, async (c) => {
    const symbols = c.map((a) => a.symbol);
    const bars = await readDaily(symbols, feed).catch(() => { feed = FEED; return readDaily(symbols, FEED); });
    for (const a of c) {
      // A day's candle is stamped at New York midnight (4:00 or 5:00 UTC),
      // the same calendar date in UTC: read straight from the stamp.
      const r = historyRow(bars[a.symbol] || [], date, asOf);
      if (r) found.push({ a, r });
    }
    return null;
  });
  const rows = found.map(({ a, r }) => {
    const cik = ciks?.get(a.symbol);
    return [
      a.symbol, a.name, a.exchange, asOf === "close" ? r.close : r.open, null, r.day, r.prevClose, r.open, r.high, r.low, r.close, r.volume, r.prevVolume, r.vwap, r.trades,
      null, null, a.options, a.shortable, a.easyToBorrow, isFundName(a.name), cik && shares ? shares.get(cik) ?? null : null, null, null,
      r.lastDate, r.lastClose, r.avgVol20, r.avgDollar20, r.atr14, r.sma20, r.d5, r.d21,
      null, null, null, null
    ];
  });
  const value = { columns: HISTORY_COLUMNS, rows, history: true, date, asOf, part, parts, dayFeed: feed, priceFeed: feed, at: new Date().toISOString(), listed: everyone.length };
  historyCache.set(key, { at: Date.now(), value });
  if (historyCache.size > 40) historyCache.delete(historyCache.keys().next().value!);
  return value;
}

// A past day's pre-market, 4:00 to 9:30 New York, for the symbols asked
// (the screen asks for the biggest gaps among liquid shares).
async function screenPremarket(account: any, date: string, symbolsIn: string[]) {
  const problem = pastDateProblem(date);
  if (problem) return { error: problem };
  const symbols = [...new Set(symbolsIn.map((x) => String(x).toUpperCase()))].filter((x) => SYMBOL.test(x)).slice(0, PM_CANDIDATES);
  const from = iso(nyMoment(date, "04:00"));
  const to = iso(nyMoment(date, "09:30") - 1000);
  const groups: string[][] = [];
  for (let i = 0; i < symbols.length; i += PM_CHUNK) groups.push(symbols.slice(i, i + PM_CHUNK));
  const pm: Record<string, ReturnType<typeof premarket>> = {};
  let feed = "sip";
  const read = async (g: string[], f: string) => {
    const all: Record<string, any[]> = {};
    let token: string | null = null;
    let pages = 0;
    do {
      const page = await alpacaFetch(`${DATA}/stocks/bars?symbols=${g.join(",")}&timeframe=1Min&start=${from}&end=${to}&limit=10000&feed=${f}` +
        (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
      for (const [sym, bars] of Object.entries(page?.bars || {})) (all[sym] = all[sym] || []).push(...(bars as any[]));
      token = page?.next_page_token || null;
      pages += 1;
    } while (token && pages < 6);
    return all;
  };
  await inBatches(groups, 6, async (g) => {
    const all = await read(g, feed).catch(() => { feed = FEED; return read(g, FEED); });
    for (const sym of g) pm[sym] = premarket(all[sym] || []);
    return null;
  });
  return { date, pm, feed };
}

// One order as the terminal shows it, finished or not: what was asked, what
// filled and at what average price, and when.
function orderView(o: any) {
  return {
    id: o.id, symbol: o.asset_class === "crypto" ? cryptoSymbol(o.symbol) : o.symbol, assetClass: o.asset_class,
    side: o.side, type: o.type, tif: o.time_in_force, status: o.status,
    qty: num(o.qty), notional: num(o.notional), filled: num(o.filled_qty), avgPrice: num(o.filled_avg_price),
    limit: num(o.limit_price), stop: num(o.stop_price),
    submittedAt: o.submitted_at || o.created_at || null, filledAt: o.filled_at || null,
    updatedAt: o.updated_at || null, orderClass: o.order_class || "simple"
  };
}

// The ticket follows its order to the end: sent, accepted, filled (or
// cancelled, or refused), with the fill price, rather than showing the first
// status and stopping. The attempt record follows too.
async function orderStatus(admin: any, account: any, orderId: string) {
  const o = await alpacaFetch(`${tradingBase(account)}/orders/${encodeURIComponent(orderId)}`, account);
  inBackground(updateAttempt(admin, o.id, o.status, o.filled_qty, o.filled_avg_price));
  return { order: orderView(o) };
}

async function accountView(account: any) {
  const base = tradingBase(account);
  // Working orders, and the last week's finished ones (filled, cancelled,
  // rejected): a filled order leaves the working list at once, and a trader
  // looks for it next ("I bought. I see them on Alpaca. Not here", 24 Oct).
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const [acct, positions, orders, closed] = await Promise.all([
    alpacaFetch(`${base}/account`, account),
    alpacaFetch(`${base}/positions`, account),
    alpacaFetch(`${base}/orders?status=open&nested=true&limit=200`, account),
    alpacaFetch(`${base}/orders?status=closed&after=${week}&limit=100&direction=desc`, account).catch(() => [])
  ]);
  return {
    paper: !!account.is_paper,
    buyingPower: num(acct?.buying_power), cash: num(acct?.cash), equity: num(acct?.equity),
    dayTradeCount: num(acct?.daytrade_count), patternDayTrader: !!acct?.pattern_day_trader,
    // The account summary tab ("a snapshot of the account summary ... including
    // options buying power", 24 Oct): the broker's own figures, as it reports
    // them, nothing derived here except today's change in equity.
    summary: {
      accountNumber: acct?.account_number || null, status: acct?.status || null, currency: acct?.currency || "USD",
      equity: num(acct?.equity), lastEquity: num(acct?.last_equity),
      dayChange: num(acct?.equity) !== null && num(acct?.last_equity) !== null ? num(acct?.equity)! - num(acct?.last_equity)! : null,
      cash: num(acct?.cash), longMarketValue: num(acct?.long_market_value), shortMarketValue: num(acct?.short_market_value),
      buyingPower: num(acct?.buying_power), regtBuyingPower: num(acct?.regt_buying_power),
      daytradingBuyingPower: num(acct?.daytrading_buying_power), optionsBuyingPower: num(acct?.options_buying_power),
      nonMarginableBuyingPower: num(acct?.non_marginable_buying_power),
      initialMargin: num(acct?.initial_margin), maintenanceMargin: num(acct?.maintenance_margin), sma: num(acct?.sma),
      multiplier: num(acct?.multiplier), optionsApprovedLevel: num(acct?.options_approved_level), optionsTradingLevel: num(acct?.options_trading_level),
      dayTradeCount: num(acct?.daytrade_count), patternDayTrader: !!acct?.pattern_day_trader,
      shortingEnabled: acct?.shorting_enabled ?? null, cryptoStatus: acct?.crypto_status || null,
      tradingBlocked: !!acct?.trading_blocked, accountBlocked: !!acct?.account_blocked,
      accruedFees: num(acct?.accrued_fees), pendingTransferIn: num(acct?.pending_transfer_in)
    },
    positions: (Array.isArray(positions) ? positions : [])
      .filter((p: any) => p.asset_class === "us_equity" || p.asset_class === "crypto")
      .map((p: any) => ({
        symbol: p.asset_class === "crypto" ? cryptoSymbol(p.symbol) : p.symbol, assetClass: p.asset_class,
        // The quantity exactly as the broker holds it, for selling all of it:
        // a coin after fees is rarely a round number (0.498749999 ETH).
        qty: num(p.qty), qtyText: String(p.qty_available ?? p.qty ?? ""), side: p.side, avgPrice: num(p.avg_entry_price), last: num(p.current_price),
        marketValue: num(p.market_value), unrealized: num(p.unrealized_pl), unrealizedPct: num(p.unrealized_plpc),
        today: num(p.unrealized_intraday_pl)
      })),
    recent: (Array.isArray(closed) ? closed : []).map(orderView),
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
  // How long after Alpaca's own timestamp each kind of message reached this
  // server: the delay before anything is drawn. Median and 95th percentile, ms.
  const delay = (type: string) => {
    const d = got.filter((g) => g.m.type === type && g.m.at).map((g) => g.at - Date.parse(g.m.at)).filter(Number.isFinite).sort((a, b) => a - b);
    return d.length ? { n: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] } : null;
  };
  return {
    delayMs: { trade: delay("trade"), quote: delay("quote"), book: delay("book") },
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
// Read-only checks the owner's reports call for, 24 Oct: "the price levels are
// different between the intervals" and "today's order is not showing".
// `bars`: one stock day's minute candles combined (all hours, and regular hours
// only) against Alpaca's hourly and daily candles for the same day.
// `account`: the account's positions with their exact quantities, and its
// working and finished orders as Alpaca returns them.
async function diagnose(account: any, mode: string, symbol: string, day: string) {
  if (mode === "account") {
    const base = tradingBase(account);
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const [positions, open, closed] = await Promise.all([
      alpacaFetch(`${base}/positions`, account),
      alpacaFetch(`${base}/orders?status=open&limit=50`, account),
      alpacaFetch(`${base}/orders?status=closed&after=${week}&limit=100&direction=desc`, account).catch((e: Error) => ({ error: e.message }))
    ]);
    return {
      positions: (positions || []).map((p: any) => ({ symbol: p.symbol, qty: p.qty, qtyAvailable: p.qty_available, cls: p.asset_class })),
      open: (open || []).map((o: any) => ({ symbol: o.symbol, side: o.side, qty: o.qty, status: o.status, type: o.type })),
      closed: Array.isArray(closed) ? closed.slice(0, 15).map((o: any) => ({ symbol: o.symbol, side: o.side, qty: o.qty, notional: o.notional, filled: o.filled_qty, avg: o.filled_avg_price, status: o.status, at: o.filled_at || o.updated_at })) : closed,
      closedCount: Array.isArray(closed) ? closed.length : null
    };
  }
  const start = `${day}T00:00:00Z`;
  const end = `${day}T23:59:59Z`;
  const get = async (tf: string) => {
    const r = await alpacaFetch(`${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${tf}&start=${start}&end=${end}&limit=10000&feed=${FEED}&adjustment=split`, account);
    return r?.bars || [];
  };
  const [m1, h1, d1] = await Promise.all([get("1Min"), get("1Hour"), get("1Day")]);
  const agg = (list: any[]) => list.length ? { open: list[0].o, high: Math.max(...list.map((b) => b.h)), low: Math.min(...list.map((b) => b.l)), close: list.at(-1).c, volume: list.reduce((a, b) => a + b.v, 0), first: list[0].t, last: list.at(-1).t } : null;
  const ny = (t: string) => { const d = new Date(t); const m = Number(d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })) * 60 + d.getUTCMinutes(); return m; };
  const regular = m1.filter((b: any) => { const m = ny(b.t); return m >= 570 && m < 960; });
  return {
    symbol, day,
    minutesAllHours: agg(m1), minutesRegular: agg(regular), hoursAll: agg(h1),
    dailyBar: d1[0] ? { open: d1[0].o, high: d1[0].h, low: d1[0].l, close: d1[0].c, volume: d1[0].v, t: d1[0].t } : null,
    firstHours: h1.slice(0, 3).map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }))
  };
}

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
  if (only === "bars" || only === "account") return diagnose(house, only, extra[0] || "SPY", extra[1] || "2026-10-23");
  if (only === "history") {
    // Every interval's history as the chart receives it: how many candles,
    // the first and last, and the last close, for a coin and a share.
    const rows: any[] = [];
    for (const sym of [extra[0] || "BTC/USD", extra[1] || "AAPL"]) {
      for (const tf of ["1Min", "5Min", "15Min", "30Min", "1Hour", "2Hour", "4Hour", "1Day", "1Week", "1Month"]) {
        try {
          const r = await bars(house, sym, tf);
          const list = r.bars;
          rows.push({ sym, tf, n: list.length, first: list[0] ? iso(list[0].time * 1000) : null, last: list.at(-1) ? iso(list.at(-1).time * 1000) : null, close: list.at(-1)?.close ?? null });
        } catch (e) { rows.push({ sym, tf, error: String((e as Error).message || e) }); }
      }
    }
    return { rows };
  }
  if (only === "events") {
    // Earnings as the chart receives them, for a US filer, a bank that
    // reports before the open, a foreign filer and a fund.
    const out: Record<string, any> = {};
    for (const sym of extra.length ? extra : ["AAPL", "JPM", "NVDA", "TSM", "SPY"]) {
      try {
        const r = await earningsFor(admin, sym);
        out[sym] = { sources: r.sources, reports: r.earnings.slice(-6).map((e: any) => [e.date, e.session, e.source, e.upcoming, e.epsActual ?? null, e.epsEstimate ?? null, e.at ? iso(e.at * 1000) : null]) };
      } catch (e) { out[sym] = { error: String((e as Error).message || e) }; }
    }
    return out;
  }
  if (only === "screen") {
    // The screener's two reads, timed, with a sample of what comes back.
    const t0 = Date.now();
    const u = await screenUniverse(admin, house);
    const t1 = Date.now();
    const col = (name: string) => u.columns.indexOf(name);
    const pick = (s: string) => u.rows.find((r) => r[0] === s);
    const names = (extra.length ? extra : ["AAPL", "NVDA", "SPY", "TSLA", "PLTR"]);
    const d = await screenDaily(house, names);
    const t2 = Date.now();
    return {
      universe: { ms: t1 - t0, bytes: JSON.stringify(u).length, listed: u.listed, rows: u.rows.length, dayFeed: u.dayFeed, withShares: u.rows.filter((r) => r[col("shares")]).length, withEarnings: u.rows.filter((r) => r[col("earnDate")]).length, withOptions: u.rows.filter((r) => r[col("options")]).length, funds: u.rows.filter((r) => r[col("fund")]).length },
      sample: Object.fromEntries(names.map((s) => [s, pick(s) ? Object.fromEntries(u.columns.map((c, i) => [c, pick(s)![i]])) : null])),
      daily: { ms: t2 - t1, feed: d.feed, stats: d.stats }
    };
  }
  if (only === "latency") {
    // How long each kind of request takes from wherever this instance runs:
    // the database, the broker's trading and data servers.
    const time = async (f: () => Promise<unknown>) => { const t = performance.now(); try { await f(); } catch { /* timed anyway */ } return Math.round(performance.now() - t); };
    const runs = async (f: () => Promise<unknown>, n = 4) => { const out: number[] = []; for (let i = 0; i < n; i++) out.push(await time(f)); return out; };
    return {
      region: Deno.env.get("SB_REGION") || null,
      db: await runs(() => admin.from("app_settings").select("key").limit(1)),
      settings: await runs(() => readSettings(admin), 2),
      account: await runs(() => loadAccount(admin, house.id, house.user_id), 2),
      tradingClock: await runs(() => alpacaFetch(`${tradingBase(house)}/clock`, house)),
      positions: await runs(() => alpacaFetch(`${tradingBase(house)}/positions`, house)),
      openOrders: await runs(() => alpacaFetch(`${tradingBase(house)}/orders?status=open&limit=5`, house)),
      quote: await runs(() => alpacaFetch(`${DATA}/stocks/AAPL/quotes/latest?feed=${FEED}`, house))
    };
  }
  if (only === "replay") {
    // A replay's two reads, as the chart receives them: counts, first and
    // last candle, the feed.
    const sym = extra[0] || "AAPL";
    const from = extra[1] || "2026-03-02T00:00:00Z";
    const out: Record<string, any> = {};
    const at = (days: number) => new Date(Date.parse(from) + days * 86400000).toISOString();
    for (const [tf, f, t] of [["1Min", at(-30), at(5)], ["30Min", at(-30 - (isCrypto(sym) ? 180 : 365)), at(-30)], ["1Day", at(-3650), at(366)]]) {
      const t0 = Date.now();
      const r: any = await replayData(house, sym, tf, f, t);
      // The longest stretch without a candle, in days: a short read shows here.
      const gap = r.bars ? Math.max(0, ...r.bars.slice(1).map((b: any, i: number) => b.time - r.bars[i].time)) / 86400 : null;
      out[tf] = r.error ? r : { ms: Date.now() - t0, feed: r.feed, n: r.bars.length, first: r.bars[0] && iso(r.bars[0].time * 1000), last: r.bars.at(-1) && iso(r.bars.at(-1).time * 1000), lastClose: r.bars.at(-1)?.close, maxGapDays: Math.round(gap * 10) / 10 };
    }
    return { symbol: sym, from, ...out };
  }
  if (only === "pastScreen") {
    // The historical screen as the screener receives it: how long, how many,
    // and the biggest gaps with their pre-market.
    const date = extra[0] || "2026-10-23";
    // The self-test's words come upper-cased, as symbols.
    const asOf = String(extra[1] || "").toLowerCase() === "close" ? "close" : "open";
    const part = Number(extra[2] || 0);
    const parts = Number(extra[3] || 4);
    const t0 = Date.now();
    const r: any = await screenHistory(house, date, asOf, part, parts);
    if (r.error) return r;
    const msHistory = Date.now() - t0;
    const at = (row: any[], c: string) => row[r.columns.indexOf(c)];
    const gap = (row: any[]) => (at(row, "prevClose") ? at(row, "open") / at(row, "prevClose") - 1 : 0);
    const ranked = [...r.rows].filter((row) => at(row, "prevClose") >= 1 && at(row, "avgDollar20") >= 1e6).sort((a, b) => gap(b) - gap(a));
    const t1 = Date.now();
    const pm: any = asOf === "open" ? await screenPremarket(house, date, ranked.slice(0, 100).map((row) => at(row, "symbol"))) : { pm: {} };
    const top = ranked.slice(0, 8)
      .map((row) => ({ s: at(row, "symbol"), prevClose: at(row, "prevClose"), open: at(row, "open"), gap: Math.round(gap(row) * 1000) / 10, pm: pm.pm?.[at(row, "symbol")] || null, close: at(row, "close"), volume: at(row, "volume"), avgVol20: Math.round(at(row, "avgVol20") || 0) }));
    return { date, asOf, part, parts, msHistory, msPremarket: Date.now() - t1, listed: r.listed, rows: r.rows.length, premarket: Object.keys(pm.pm || {}).length, feed: r.dayFeed, top };
  }
  if (only === "hours") {
    // The regular-hours hourly candles the chart now asks for, as served.
    const r = await sessionHours(house, extra[0] || "AAPL", "1Hour");
    const day = extra[1] || "2026-10-23";
    return { symbol: r.symbol, day, candles: r.bars.filter((b: any) => new Date(b.time * 1000).toISOString().startsWith(day)).map((b: any) => ({ t: new Date(b.time * 1000).toISOString(), o: b.open, h: b.high, l: b.low, c: b.close })) };
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

// ---------- the person's terminal settings ----------
//
// Watchlist, each symbol's drawings, indicators, chart events and hotkeys,
// kept with the person rather than the browser (public.terminal_prefs), so
// another device or a cleared browser finds them as left. One row per key;
// a symbol's drawings are a key of their own ("drawings:AAPL").

const PREF_KEY = /^[a-z]+(:[A-Z0-9./]{1,24})?$/;
const PREF_MAX_BYTES = 256 * 1024;

async function prefs(admin: any, userId: string, body: any): Promise<[any, number?]> {
  const table = admin.from("terminal_prefs");
  if (body.op === "set") {
    const entries = Array.isArray(body.entries) ? body.entries : [{ key: body.key, value: body.value }];
    const rows = [];
    for (const e of entries.slice(0, 50)) {
      const key = String(e?.key || "");
      if (!PREF_KEY.test(key)) return [{ error: `Not a setting: ${key}` }, 400];
      if (e.value === undefined) return [{ error: "Nothing to save." }, 400];
      if (JSON.stringify(e.value).length > PREF_MAX_BYTES) return [{ error: `${key} is too large to save.` }, 413];
      rows.push({ user_id: userId, key, value: e.value, updated_at: new Date().toISOString() });
    }
    const { error } = await table.upsert(rows, { onConflict: "user_id,key" });
    if (error) return [{ error: error.message }, 500];
    return [{ saved: rows.map((r) => r.key) }];
  }
  // Reading: named keys, or every key under a prefix ("drawings:").
  let q = admin.from("terminal_prefs").select("key, value, updated_at").eq("user_id", userId);
  const keys = (Array.isArray(body.keys) ? body.keys : []).map(String).filter((k: string) => PREF_KEY.test(k)).slice(0, 50);
  if (keys.length) q = q.in("key", keys);
  else if (/^[a-z]+:$/.test(String(body.prefix || ""))) q = q.like("key", `${body.prefix}%`);
  else return [{ error: "Which settings?" }, 400];
  const { data, error } = await q;
  if (error) return [{ error: error.message }, 500];
  return [{ prefs: Object.fromEntries((data || []).map((r: any) => [r.key, { value: r.value, at: r.updated_at }])) }];
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
    // A buy needs no holding check; a sale reads the holding alongside the asset.
    const [asset, positions] = await Promise.all([
      assetFor(account, symbol),
      input.side === "sell" ? alpacaFetch(`${tradingBase(account)}/positions`, account) : Promise.resolve([])
    ]);
    const held = (Array.isArray(positions) ? positions : []).find((p: any) => p.asset_class === "crypto" && cryptoSymbol(p.symbol) === symbol);
    built = cryptoOrderBody(input, `TERM_${Date.now()}`, asset, num(held?.qty) || 0);
  } else {
    built = stockOrderBody(input, `TERM_${Date.now()}`);
  }
  if (!built.ok) return { status: 400, body: { error: built.reason } };
  const body = built.body as any;
  const attempt = {
    userId: user.id, accountId: account.id, intent: "open", ticker: body.symbol,
    legs: [{ symbol: body.symbol, side: body.side, ratio: 1 }], qty: body.qty ? Number(body.qty) : null, orderType: body.type,
    limitPrice: body.limit_price ?? null,
    quote: input.reference || body.notional ? { reference: input.reference ?? null, notional: body.notional ?? null } : null
  };
  try {
    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, { method: "POST", body: JSON.stringify(body) });
    // The record is written after the answer goes back, not before it: the
    // trader hears about the order a database write sooner.
    inBackground(recordAttempt(admin, { ...attempt, brokerOrderId: order.id, status: order.status }));
    return { status: 200, body: { orderId: order.id, status: order.status } };
  } catch (e) {
    const message = brokerRefusal(String((e as Error)?.message || e), body.symbol);
    inBackground(recordAttempt(admin, { ...attempt, error: message }));
    return { status: 422, body: { error: message } };
  }
}

// ---------- bar replay ----------
//
// "stock replay where I can set the date from to ... for training purposes.
// and make sure to be accurate accross all time frames" (25 Oct). The replay
// builds every interval from one-minute candles and finished days from daily
// ones (src/lib/replay.js), so it reads just those two, in the ranges it asks
// for. Shares come from the consolidated tape: history older than fifteen
// minutes is open to an account without a paid data plan, and it is the same
// tape every interval is drawn from. Half-hour candles reach the hourly
// charts further back than the minutes ("when i change the time frames.
// everything thing looks normal during the replay mode so i can have a look
// on the bigger pic", 25 Oct), and the daily candles go back ten years.

// The chart asks for ten years of days up to a year past the start, and a
// year of half hours. Each is read in slices, together: a long read in one
// request came back short (a year of AAPL's half hours stopped in September),
// and a coin's intraday history comes a week per page.
const REPLAY_MAX_DAYS: Record<string, number> = { "1Min": 45, "30Min": 400, "1Day": 4400 };
const REPLAY_NAMES: Record<string, string> = { "1Min": "one-minute", "30Min": "half-hour", "1Day": "daily" };
const REPLAY_SLICE_DAYS: Record<string, number> = { "1Min": 7, "30Min": 30, "1Day": 730 };

async function replayData(account: any, symbol: string, tf: string, from: string, to: string) {
  if (!REPLAY_MAX_DAYS[tf]) return { error: "Replay reads one-minute, half-hour or daily candles." };
  const crypto = isCrypto(symbol);
  const start = Date.parse(from);
  const end = Math.min(Date.parse(to), Date.now() - 16 * 60000);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(start < end)) return { symbol, tf, bars: [] };
  if (end - start > REPLAY_MAX_DAYS[tf] * 86400000) return { error: `At most ${REPLAY_MAX_DAYS[tf]} days of ${REPLAY_NAMES[tf]} candles at a time.` };
  const slice = (crypto && tf !== "1Day" ? 7 : REPLAY_SLICE_DAYS[tf]) * 86400000;
  const windows: [number, number][] = [];
  for (let w = start; w < end; w += slice) windows.push([w, Math.min(end, w + slice)]);
  const readAll = (url: (a: number, b: number) => string, pick: (page: any) => any[]) =>
    inBatches(windows, 8, ([a, b]) => allPages(account, url(a, b), pick, 12));
  let feed = crypto ? "crypto" : "sip";
  const chunks = crypto
    ? await readAll((a, b) => `${CRYPTO_DATA}/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${tf}&start=${iso(a)}&end=${iso(b)}&limit=10000&sort=asc`, (page) => page?.bars?.[symbol])
    : await (async () => {
      const stockUrl = (f: string) => (a: number, b: number) =>
        `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${tf}&start=${iso(a)}&end=${iso(b)}&limit=10000&feed=${f}&adjustment=split&sort=asc`;
      return readAll(stockUrl("sip"), (page) => page?.bars).catch(() => { feed = FEED; return readAll(stockUrl(FEED), (page) => page?.bars); });
    })();
  // A candle on a slice's edge can come back in both; keep one of each.
  const byTime = new Map<number, any>();
  for (const b of chunks.flat()) byTime.set(Math.floor(Date.parse(b.t) / 1000), b);
  return { symbol, tf, feed, bars: [...byTime.values()].map(candle).sort((x, y) => x.time - y.time) };
}

// ---------- one-key actions on a position (hotkeys) ----------
//
// "exiting full position has a key. Partial exit has a key with its default
// percentage of position ... stop loss order in general; with keys" (25 Oct).
// Each is several broker requests that must happen in order, so they run
// here rather than in the browser: what is held, which orders are in the way,
// cancel them and wait, then send. The rules are positionTools.ts.

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ownSymbol = (o: any) => (o?.asset_class === "crypto" ? cryptoSymbol(o.symbol) : o?.symbol);

async function positionOf(account: any, symbol: string) {
  const list = await alpacaFetch(`${tradingBase(account)}/positions`, account);
  const p = (Array.isArray(list) ? list : []).find((x: any) => ownSymbol(x) === symbol);
  if (!p) return null;
  return {
    qty: num(p.qty) || 0, qtyText: String(p.qty_available ?? p.qty), available: Math.abs(num(p.qty_available ?? p.qty) || 0),
    side: p.side === "short" ? "short" as const : "long" as const, avgPrice: num(p.avg_entry_price), last: num(p.current_price)
  };
}

async function openOrdersFor(account: any, symbol: string) {
  const list = await alpacaFetch(`${tradingBase(account)}/orders?status=open&nested=true&limit=200&symbols=${encodeURIComponent(symbol)}`, account);
  return (Array.isArray(list) ? list : []).filter((o: any) => ownSymbol(o) === symbol);
}

// Cancel, then wait until the broker no longer lists them as working (it
// releases the shares they held only then), for up to three seconds.
async function cancelAndWait(account: any, symbol: string, ids: string[]) {
  if (!ids.length) return true;
  await Promise.all(ids.map((id) => alpacaFetch(`${tradingBase(account)}/orders/${id}`, account, { method: "DELETE" }).catch(() => null)));
  for (let i = 0; i < 10; i++) {
    const open = await openOrdersFor(account, symbol);
    if (!open.some((o: any) => ids.includes(o.id))) return true;
    await pause(300);
  }
  return false;
}

async function sendBody(admin: any, user: any, account: any, intent: string, body: any) {
  const attempt = {
    userId: user.id, accountId: account.id, intent, ticker: body.symbol, legs: [{ symbol: body.symbol, side: body.side, ratio: 1 }],
    qty: body.qty ? Number(body.qty) : null, orderType: body.type, limitPrice: body.limit_price ?? null, quote: { stop: body.stop_price ?? null }
  };
  try {
    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, { method: "POST", body: JSON.stringify(body) });
    inBackground(recordAttempt(admin, { ...attempt, brokerOrderId: order.id, status: order.status }));
    return { order };
  } catch (e) {
    const message = brokerRefusal(String((e as Error)?.message || e), body.symbol);
    inBackground(recordAttempt(admin, { ...attempt, error: message }));
    return { error: message };
  }
}

async function stopBody(account: any, symbol: string, plan: any, qtyText: string, held: number) {
  if (isCrypto(symbol)) {
    return cryptoOrderBody({ symbol, side: plan.side, qty: qtyText, type: "stop_limit", stopPrice: plan.stopPrice, limitPrice: plan.limitPrice, timeInForce: "gtc" },
      `TERM_${Date.now()}`, await assetFor(account, symbol), held);
  }
  return stockOrderBody({ symbol, side: plan.side, qty: plan.qty, type: "stop", stopPrice: plan.stopPrice, timeInForce: plan.timeInForce }, `TERM_${Date.now()}`);
}

// A stop or a take-profit for the whole position (kind "stop" or "target"),
// kept together with the other one if it is already working: both go as one
// one-cancels-other order (positionTools.ts exitBody), since two separate
// orders could not both hold the same shares at the broker.
async function protect(admin: any, user: any, account: any, input: any) {
  const symbol = cryptoSymbol(String(input?.symbol || "").toUpperCase());
  const crypto = isCrypto(symbol);
  const kind = input.kind === "target" ? "target" : "stop";
  const [pos, open] = await Promise.all([positionOf(account, symbol), openOrdersFor(account, symbol)]);
  if (!pos) return { status: 400, body: { error: `No ${symbol} position to ${kind === "stop" ? "protect" : "take profit on"}.` } };
  const closing = pos.side === "short" ? "buy" : "sell";
  const have = existingExits(open, closing);
  const measure = { mode: input.mode, value: Number(input.value), from: input.from === "entry" ? "entry" as const : "last" as const };
  let stop = have.stop;
  let target = have.target;
  let note: string | null = null;
  if (kind === "stop") {
    const plan = stopPlan(pos, measure, crypto);
    if (!plan.ok) return { status: 400, body: { error: plan.reason } };
    stop = plan.stopPrice;
    note = plan.note;
  } else {
    const plan = targetPlan(pos, measure);
    if (!plan.ok) return { status: 400, body: { error: plan.reason } };
    target = plan.targetPrice;
  }
  // Checked before anything is cancelled, so a refusal leaves the old exits working.
  const held = Math.abs(pos.qty);
  if (stop && target) {
    const check = exitBody(symbol, closing, held, { stop, target }, "check", { crypto });
    if (!check.ok) return { status: 400, body: { error: check.reason } };
  }
  if (!(await cancelAndWait(account, symbol, have.ids))) {
    return { status: 409, body: { error: "The old exit is still being cancelled; press again in a moment." } };
  }
  // What is free to cover: read again only if an exit was just released.
  const now = have.ids.length ? await positionOf(account, symbol) : pos;
  if (!now || now.available + 1e-9 < held) {
    const busy = now ? held - now.available : held;
    return { status: 409, body: { error: `${busy} of ${held} are held by other working orders on ${symbol}. Cancel them first, or exit.` } };
  }
  let built;
  let limitPrice: number | null = null;
  if (stop && !target) {
    const plan = stopPlan(now, { mode: "price", value: stop }, crypto);
    if (!plan.ok) return { status: 400, body: { error: plan.reason } };
    limitPrice = plan.limitPrice;
    built = await stopBody(account, symbol, plan, now.qtyText, now.available);
  } else {
    built = exitBody(symbol, closing, held, { stop, target }, `TERM_${Date.now()}`, { crypto, qtyText: now.qtyText });
  }
  if (!built.ok) return { status: 400, body: { error: built.reason } };
  const sent = await sendBody(admin, user, account, "protect", built.body);
  if (sent.error) return { status: 422, body: { error: sent.error } };
  return {
    status: 200,
    body: { orderId: sent.order.id, status: sent.order.status, kind, stopPrice: stop, targetPrice: target, limitPrice, qty: held, side: closing, replaced: have.ids.length, paired: !!(stop && target), note }
  };
}

async function exitPosition(admin: any, user: any, account: any, input: any) {
  const symbol = cryptoSymbol(String(input?.symbol || "").toUpperCase());
  const crypto = isCrypto(symbol);
  const percent = Number(input.percent ?? 100);
  const session = usSession(Date.now());
  const partial = percent < 100;
  // Everything the exit needs, read together: the position, the orders
  // holding it, the fills that say how big the trade was (a partial exit is a
  // share of the trade, not of what is left), the coin's steps, the quote.
  const [pos, open, fills, asset, quote] = await Promise.all([
    positionOf(account, symbol),
    openOrdersFor(account, symbol),
    partial ? alpacaFetch(`${tradingBase(account)}/account/activities/FILL?direction=desc&page_size=100`, account).catch(() => []) : Promise.resolve([]),
    partial && crypto ? assetFor(account, symbol) : Promise.resolve(null),
    crypto || session === "regular" ? Promise.resolve({}) : alpacaFetch(`${DATA}/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=${FEED}`, account).then((r: any) => r?.quote || {}).catch(() => ({}))
  ]);
  if (!pos) return { status: 400, body: { error: `No ${symbol} position to exit.` } };
  const held = Math.abs(pos.qty);
  const base = partial ? tradeSize(fills, pos.qty, (s) => cryptoSymbol(s) === symbol) : held;
  const amount = partial
    ? partialQty(held, base, percent, { whole: !crypto && Number.isInteger(held), step: crypto ? asset?.minTradeIncrement : 1e-9, min: crypto ? asset?.minOrderSize : 0 })
    : { qty: held, all: true };
  const plan = exitPlan(pos, amount, session, { bid: num((quote as any).bp), ask: num((quote as any).ap) }, crypto);
  if (!plan.ok) return { status: 400, body: { error: plan.reason } };
  // Every working order on the symbol holds shares the exit needs. A partial
  // exit hands the old stop's price back, for the browser to put the stop
  // back on what remains once the exit has filled.
  const closing = pos.side === "short" ? "buy" : "sell";
  const kept = partial && !amount.all ? existingExits(open, closing) : { stop: null, target: null };
  if (!(await cancelAndWait(account, symbol, open.map((o: any) => o.id)))) {
    return { status: 409, body: { error: `${symbol}'s working orders are still being cancelled; press again in a moment.` } };
  }
  let order: any;
  if (plan.how === "close") {
    const sym = encodeURIComponent(symbol.replace("/", ""));
    const how = plan.all ? "percentage=100" : `qty=${Number(plan.qty.toFixed(9))}`;
    try {
      order = await alpacaFetch(`${tradingBase(account)}/positions/${sym}?${how}`, account, { method: "DELETE" });
    } catch (e) {
      const message = brokerRefusal(String((e as Error)?.message || e), symbol);
      inBackground(recordAttempt(admin, { userId: user.id, accountId: account.id, intent: "close", ticker: symbol, error: message }));
      return { status: 422, body: { error: message, cancelled: open.length } };
    }
    inBackground(recordAttempt(admin, { userId: user.id, accountId: account.id, intent: "close", ticker: symbol, legs: [{ symbol, side: closing, ratio: 1 }], qty: order?.qty ?? null, orderType: "market", brokerOrderId: order?.id, status: order?.status, quote: { percent, tradeSize: base } }));
  } else {
    const built = stockOrderBody({ symbol, side: plan.side, qty: plan.qty, type: "limit", limitPrice: plan.limitPrice, timeInForce: "day", extendedHours: true }, `TERM_${Date.now()}`);
    if (!built.ok) return { status: 400, body: { error: built.reason } };
    const sent = await sendBody(admin, user, account, "close", built.body);
    if (sent.error) return { status: 422, body: { error: sent.error, cancelled: open.length } };
    order = sent.order;
  }
  return {
    status: 200,
    body: {
      orderId: order?.id, status: order?.status, how: plan.how, percent, side: closing, tradeSize: base, all: plan.how === "close" ? plan.all : false,
      limitPrice: plan.how === "limit" ? plan.limitPrice : null, qty: plan.how === "limit" ? plan.qty : num(order?.qty) ?? plan.qty,
      note: plan.how === "limit" ? plan.note : null, cancelled: open.length, restopPrice: kept.stop, retargetPrice: kept.target
    }
  };
}

async function cancelOrders(account: any, symbol: string) {
  if (!symbol) {
    const r = await alpacaFetch(`${tradingBase(account)}/orders`, account, { method: "DELETE" });
    return { cancelled: Array.isArray(r) ? r.length : 0 };
  }
  const open = await openOrdersFor(account, symbol);
  await cancelAndWait(account, symbol, open.map((o: any) => o.id));
  return { cancelled: open.length };
}

// Every request first asks whether the terminal is switched on and who is
// calling: two round trips before the broker hears anything (25 Oct: "is
// there anyway to make it a little faster"). Both are read at the same time
// now, and kept for a short while by this instance: the switch for 30
// seconds, a caller's token for 60. The account and its credentials are still
// read for each request and never kept.
let lab = { at: 0, on: false };
async function labOn(admin: any) {
  if (Date.now() - lab.at < 30000) return lab.on;
  lab = { at: Date.now(), on: (await readSettings(admin)).terminalLab };
  return lab.on;
}
const callers = new Map<string, { at: number; user: any }>();
async function caller(req: Request) {
  const token = req.headers.get("Authorization") || "";
  const hit = callers.get(token);
  if (hit && Date.now() - hit.at < 60000) return hit.user;
  const user = await requireUser(req);
  if (user) {
    if (callers.size > 500) callers.clear();
    callers.set(token, { at: Date.now(), user });
  }
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const [on, body] = await Promise.all([labOn(admin), req.json().catch(() => ({}))]);
    if (!on) return jsonResponse({ error: "The trading terminal is not available here." }, 404);
    if (body?.action === "selftest") {
      if (!(await redeemCronTicket(admin, body.ticket, "terminal_selftest"))) return jsonResponse({ error: "not authorised" }, 401);
      const report = await selftest(admin, String(body.only || ""), Number(body.seconds) || 8, String(body.accountId || ""),
        (Array.isArray(body.coins) ? body.coins : []).map((c: unknown) => String(c).toUpperCase()));
      console.log(`terminal selftest: ${JSON.stringify(report)}`);
      return jsonResponse(report);
    }

    const user = await caller(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const { action, accountId } = body || {};
    if (action === "prefs") return jsonResponse(...(await prefs(admin, user.id, body)));
    if (!accountId) return jsonResponse({ error: "Choose an account." }, 400);
    // The account's row (credentials still encrypted) kept 30 seconds by this
    // instance: a burst of key presses reads the database once.
    const account = await loadAccount(admin, accountId, user.id, { cacheMs: 30000 });

    const symbol = String(body.symbol || "").toUpperCase().trim();
    if (action === "bars") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await bars(account, symbol, String(body.interval || "5Min"), String(body.session || "")));
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
    if (action === "events") {
      if (!SYMBOL.test(symbol)) return jsonResponse({ symbol, earnings: [], sources: { note: "no earnings for coins" } });
      return jsonResponse(await earningsFor(admin, symbol));
    }
    if (action === "screen") {
      if (body.stage === "daily") return jsonResponse(await screenDaily(account, Array.isArray(body.symbols) ? body.symbols : [], String(body.asOf || "")));
      if (body.stage === "history") {
        const r = await screenHistory(account, String(body.date || ""), body.asOf === "close" ? "close" : "open", Number(body.part) || 0, Number(body.parts) || 1);
        return jsonResponse(r, (r as any).error ? 400 : 200);
      }
      if (body.stage === "premarket") {
        const r = await screenPremarket(account, String(body.date || ""), Array.isArray(body.symbols) ? body.symbols : []);
        return jsonResponse(r, (r as any).error ? 400 : 200);
      }
      return jsonResponse(await screenUniverse(admin, account));
    }
    if (action === "orderStatus") {
      if (!body.orderId) return jsonResponse({ error: "Which order?" }, 400);
      return jsonResponse(await orderStatus(admin, account, String(body.orderId)));
    }
    if (action === "order") {
      const r = await placeOrder(admin, user, account, body.order || {});
      return jsonResponse(r.body, r.status);
    }
    if (action === "replay") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      const r = await replayData(account, symbol, String(body.tf || "1Min"), String(body.from || ""), String(body.to || ""));
      return jsonResponse(r, (r as any).error ? 400 : 200);
    }
    if (action === "protect" || action === "exit" || action === "cancelOrders") {
      if (!account.is_paper) return jsonResponse({ error: "Orders from the terminal go to paper accounts only during this test. Choose a paper account." }, 403);
      if (action === "cancelOrders") return jsonResponse(await cancelOrders(account, symbol ? cryptoSymbol(symbol) : ""));
      const r = action === "protect" ? await protect(admin, user, account, body) : await exitPosition(admin, user, account, body);
      return jsonResponse(r.body, r.status);
    }
    return jsonResponse({ error: `Unknown action "${action}"` }, 400);
  } catch (error) {
    return jsonResponse({ error: brokerRefusal(String((error as Error)?.message || error)) }, 500);
  }
});
