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
import { usSession, stopPlan, exitPlan, tradeSize, partialQty, targetPlan, existingExits, exitBody, exitSplit, openingQty, replaceable } from "../_shared/positionTools.ts";
import { inBackground } from "../_shared/background.ts";
import { allocate } from "../_shared/proRata.ts";
import { orderStream } from "../_shared/orderStream.ts";
import { isOwnerEmail, isAdminUser } from "../_shared/admin.ts";
import { guardHours } from "../_shared/stopGuard.ts";
import { stopsToWatch, extStopsOn, watchEodhd, checkIex, handBackFired } from "../_shared/stopGuardRun.ts";

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
// closed with nothing to forget. And orders go to paper accounts, and to the
// owner's own live Alpaca accounts (26 Oct: "Activate the Hotkeys on Live
// accounts"; asked, the owner chose his accounts only, everything that sends
// an order, and $5,000 at most for each order that opens or adds to a
// position). Anyone else's live account can be looked at, never traded.
//
// Crypto, added the same day ("I don't see Cryptos to select from ... make
// sure the order book is working and time and sales for anything that is
// available like cryptos"): Alpaca's crypto data carries what its stock feed
// does not, a full order book and the side that took each trade. A symbol with
// a slash ("BTC/USD") is crypto throughout.

const DATA = "https://data.alpaca.markets/v2";
const CRYPTO_DATA = "https://data.alpaca.markets/v1beta3/crypto/us";
const FEED = "iex";

// Which tape a share's prices come from (`stockFeed`): IEX in real time, the
// free feed, which trades only 8:00 to 17:00 New York; or the consolidated
// tape of every exchange, which an account without a paid data plan reads
// fifteen minutes late: its history up to then (feed=sip, ending 16 minutes
// ago), its latest prices delayed (feed=delayed_sip). The terminal uses the
// delayed tape while IEX is closed, so pre-market from 4:00 shows (26 Oct,
// 5:21 New York: "Premarket is open now and I don't see any execution,
// change in prices, time & sales!!"; IEX had nothing, the consolidated tape
// had AAPL at 342.79 from 5:06).
type StockFeed = "iex" | "delayed";
const stockFeedOf = (v: unknown): StockFeed => (v === "delayed" ? "delayed" : "iex");
const historyFeed = (sf: StockFeed) => (sf === "delayed" ? `feed=sip&end=${new Date(Date.now() - 16 * 60000).toISOString()}` : `feed=${FEED}`);
const latestFeed = (sf: StockFeed) => (sf === "delayed" ? "delayed_sip" : FEED);
const feedName = (sf: StockFeed) => (sf === "delayed" ? "sip-delayed" : FEED);
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
async function secondBars(account: any, symbol: string, interval: string, sf: StockFeed = "iex") {
  const step = SECONDS[interval];
  const crypto = isCrypto(symbol);
  const start = new Date(Date.now() - 7 * 86400000).toISOString();
  const trades: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const url = (crypto
      ? `${CRYPTO_DATA}/trades?symbols=${encodeURIComponent(symbol)}&start=${start}&limit=10000&sort=desc`
      : `${DATA}/stocks/${encodeURIComponent(symbol)}/trades?${historyFeed(sf)}&start=${start}&limit=10000&sort=desc`) +
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
  return { symbol, interval, feed: crypto ? "crypto" : feedName(sf), bars: out, fromTrades: true };
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

async function sessionHours(account: any, symbol: string, interval: string, sf: StockFeed = "iex") {
  const span = HOUR_SPANS[interval];
  const start = new Date(Date.now() - RANGES[interval].days * 86400000).toISOString();
  const halves = (await allPages(account,
    `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=30Min&start=${start}&limit=10000&${historyFeed(sf)}&adjustment=split&sort=desc`,
    (page) => page?.bars, 8)).reverse();
  const out = sessionCandles(halves, span);
  return { symbol, interval, feed: feedName(sf), bars: out, session: "regular" };
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

async function bars(account: any, symbol: string, interval: string, session = "", sf: StockFeed = "iex") {
  if (SECONDS[interval]) return secondBars(account, symbol, interval, sf);
  if (session === "regular" && HOUR_SPANS[interval] && !isCrypto(symbol)) return sessionHours(account, symbol, interval, sf);
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
    : `${DATA}/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${r.tf}&start=${start}&limit=10000&${historyFeed(sf)}&adjustment=split&sort=desc`,
  (page) => (crypto ? page?.bars?.[symbol] : page?.bars), 8);
  return { symbol, interval, feed: crypto ? "crypto" : feedName(sf), bars: list.map(candle).reverse() };
}

async function snapshot(account: any, symbols: string[], sf: StockFeed = "iex") {
  const stocks = symbols.filter((s) => SYMBOL.test(s)).slice(0, 50);
  const coins = symbols.filter((s) => CRYPTO.test(s)).slice(0, 50);
  if (!stocks.length && !coins.length) return { quotes: {} };
  const [stockSnaps, coinSnaps] = await Promise.all([
    stocks.length ? alpacaFetch(`${DATA}/stocks/snapshots?symbols=${stocks.join(",")}&feed=${latestFeed(sf)}`, account) : null,
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
  return { quotes, feed: feedName(sf) };
}

// The order book for a coin: every resting price on Alpaca's crypto venue,
// with its size. The stream keeps it live; this is the first picture, and the
// fallback when the stream is down. Shares have no book on Alpaca's feeds (see
// selftest), so for a share this answers with the best bid and ask only.
async function book(account: any, symbol: string, sf: StockFeed = "iex") {
  if (!isCrypto(symbol)) {
    const q = await alpacaFetch(`${DATA}/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=${latestFeed(sf)}`, account);
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
async function trades(account: any, symbol: string, sf: StockFeed = "iex") {
  const crypto = isCrypto(symbol);
  const start = new Date(Date.now() - (crypto ? 1 : 5) * 86400000).toISOString();
  const r = await alpacaFetch(crypto
    ? `${CRYPTO_DATA}/trades?symbols=${encodeURIComponent(symbol)}&start=${start}&limit=50&sort=desc`
    : `${DATA}/stocks/${encodeURIComponent(symbol)}/trades?${historyFeed(sf)}&start=${start}&limit=50&sort=desc`, account);
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

// A day's pre-market, 4:00 to 9:30 New York, for the symbols asked (the
// screen asks for the biggest moves among liquid shares). A past day's, or
// today's for the live screen (26 Oct, before the open: "Screener is not
// working", every screen on today's volume empty): the consolidated tape up
// to sixteen minutes ago, as far as an account without a paid data plan may
// read it. `through` is where it reaches; `complete` once that is 9:30.
async function screenPremarket(account: any, date: string, symbolsIn: string[]) {
  const today = date === nyDate();
  const problem = today ? null : pastDateProblem(date);
  if (problem) return { error: problem };
  const symbols = [...new Set(symbolsIn.map((x) => String(x).toUpperCase()))].filter((x) => SYMBOL.test(x)).slice(0, PM_CANDIDATES);
  const open = nyMoment(date, "09:30") - 1000;
  const until = today ? Math.min(open, Date.now() - 16 * 60000) : open;
  if (until <= nyMoment(date, "04:00")) return { date, pm: {}, feed: "sip", through: null, complete: false };
  const from = iso(nyMoment(date, "04:00"));
  const to = iso(until);
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
  return { date, pm, feed, through: to, complete: until === open };
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
    positions: positionsView(positions),
    recent: (Array.isArray(closed) ? closed : []).map(orderView),
    orders: workingView(orders)
  };
}

function positionsView(positions: any) {
  return (Array.isArray(positions) ? positions : [])
    .filter((p: any) => p.asset_class === "us_equity" || p.asset_class === "crypto")
    .map((p: any) => ({
      symbol: p.asset_class === "crypto" ? cryptoSymbol(p.symbol) : p.symbol, assetClass: p.asset_class,
      // The quantity exactly as the broker holds it, for selling all of it:
      // a coin after fees is rarely a round number (0.498749999 ETH).
      qty: num(p.qty), qtyText: String(p.qty_available ?? p.qty ?? ""), side: p.side, avgPrice: num(p.avg_entry_price), last: num(p.current_price),
      marketValue: num(p.market_value), unrealized: num(p.unrealized_pl), unrealizedPct: num(p.unrealized_plpc),
      today: num(p.unrealized_intraday_pl)
    }));
}

function workingView(orders: any) {
  return (Array.isArray(orders) ? orders : []).map((o: any) => ({
    id: o.id, symbol: o.asset_class === "crypto" ? cryptoSymbol(o.symbol) : o.symbol, assetClass: o.asset_class,
    side: o.side, qty: num(o.qty), notional: num(o.notional), filled: num(o.filled_qty), type: o.type,
    limit: num(o.limit_price), stop: num(o.stop_price), tif: o.time_in_force, status: o.status,
    orderClass: o.order_class || "simple", submittedAt: o.submitted_at,
    legs: (o.legs || []).map((l: any) => ({ id: l.id, side: l.side, type: l.type, limit: num(l.limit_price), stop: num(l.stop_price), status: l.status }))
  }));
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
  // "EODHD" among the extras: shares from EODHD's stream, as the owner's terminal has them.
  const eodhdKey = extra.includes("EODHD") ? Deno.env.get("EODHD_API_KEY") || null : null;
  relayDetail(client, auth, ["BTC/USD", "ETH/USD", "SPY", "AAPL", ...more], "BTC/USD", eodhdKey ? "eodhd" : "iex", eodhdKey);
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
    shareSource: eodhdKey ? "eodhd" : "iex",
    trades: got.filter((g) => g.m.type === "trade").slice(0, 40).map((g) => ({ symbol: g.m.symbol, price: g.m.price, size: g.m.size, takerSide: g.m.takerSide, session: g.m.session, at: g.m.at })),
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
      // Enough of each to tell who placed it and why it ended: its type, price,
      // duration, extended hours, the client id (TERM_ for the terminal's).
      closed: Array.isArray(closed) ? closed.slice(0, 25).map((o: any) => ({
        symbol: o.symbol, side: o.side, qty: o.qty, notional: o.notional, filled: o.filled_qty, avg: o.filled_avg_price, status: o.status,
        type: o.type, limit: o.limit_price, stop: o.stop_price, tif: o.time_in_force, ext: o.extended_hours, cls: o.order_class, client: String(o.client_order_id || "").slice(0, 12),
        submitted: o.submitted_at, canceled: o.canceled_at, expired: o.expired_at, at: o.filled_at || o.updated_at
      })) : closed,
      closedCount: Array.isArray(closed) ? closed.length : null,
      // Every order cancelled in the last three hours, whenever it was placed.
      cancelledLately: Array.isArray(closed) ? closed.filter((o: any) => o.canceled_at && Date.parse(o.canceled_at) > Date.now() - 3 * 3600000).map((o: any) => ({
        symbol: o.symbol, side: o.side, qty: o.qty, filled: o.filled_qty, type: o.type, limit: o.limit_price, stop: o.stop_price, tif: o.time_in_force, cls: o.order_class,
        client: String(o.client_order_id || "").slice(0, 14), submitted: o.submitted_at, canceled: o.canceled_at
      })) : null
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
  if (only === "eodhd") {
    // EODHD, a data vendor the owner holds a plan with (26 Oct: "Check EODHD
    // api i already have for real-time data and extended hours. See if it
    // works and how much it covers"): the plan, how far behind its latest
    // prices are, whether today's one-minute candles include the pre-market,
    // and how quickly its live trades and quotes arrive. The key is the
    // project's EODHD_API_KEY secret; it never leaves this function, and
    // nothing here returns it, nor the account's name or email.
    const key = Deno.env.get("EODHD_API_KEY");
    if (!key) return { error: "No EODHD_API_KEY secret on this project yet." };
    const secs = Math.min(30, Math.max(5, Number(seconds) || 15));
    const historyOnly = extra.includes("HISTORY");
    const extraSymbol = extra.find((x) => x !== "HISTORY" && /^[A-Z]{1,5}$/.test(x)) || "AAPL";
    // The weekday before today, New York.
    const lastSessionDay = () => {
      for (let back = 1; back < 8; back++) {
        const d = nyDate(Date.now() - back * 86400000);
        if (![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
      }
      return nyDate(Date.now() - 86400000);
    };
    const get = async (path: string) => {
      const t = Date.now();
      try {
        const r = await fetch(`https://eodhd.com/api/${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(key)}&fmt=json`);
        const text = await r.text();
        let body: any;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
        return { status: r.status, ms: Date.now() - t, body };
      } catch (e) { return { status: 0, ms: Date.now() - t, body: String(e) }; }
    };
    const now = Date.now() / 1000;
    const user = await get("user");
    const u = user.body && typeof user.body === "object" ? user.body : null;
    const plan = u ? { subscriptionType: u.subscriptionType, dailyRateLimit: u.dailyRateLimit, apiRequests: u.apiRequests, apiRequestsDate: u.apiRequestsDate, extraLimit: u.extraLimit } : { status: user.status, body: user.body };
    const rt = await get("real-time/AAPL.US?s=SPY.US,TSLA.US,NVDA.US");
    const quotes = (Array.isArray(rt.body) ? rt.body : rt.body && typeof rt.body === "object" ? [rt.body] : []).map((q: any) => ({
      code: q.code, price: q.close, prevClose: q.previousClose, changePct: q.change_p, volume: q.volume,
      at: Number(q.timestamp) ? new Date(q.timestamp * 1000).toISOString() : null, behindMin: Number(q.timestamp) ? Math.round((now - q.timestamp) / 60) : null
    }));
    const from = Math.floor(nyMoment(nyDate(), "04:00") / 1000);
    const intra = await get(`intraday/AAPL.US?interval=1m&from=${from}&to=${Math.floor(now)}`);
    const candles = Array.isArray(intra.body) ? intra.body : [];
    const intraday = {
      status: intra.status, n: candles.length, first: candles[0]?.datetime ?? null, last: candles.at(-1)?.datetime ?? null, lastClose: candles.at(-1)?.close ?? null,
      behindMin: candles.length ? Math.round((now - candles.at(-1).timestamp) / 60) : null, error: Array.isArray(intra.body) ? null : intra.body
    };
    const listenTo = (endpoint: string, symbols: string) => new Promise<any>((resolve) => {
      const rep: any = { endpoint, opened: false, messages: 0, first: null, said: [], errors: [], lag: [] as number[] };
      const finish = () => {
        const lag = [...rep.lag].sort((a: number, b: number) => a - b);
        resolve({ ...rep, lag: undefined, lagMs: lag.length ? { min: lag[0], median: lag[Math.floor(lag.length / 2)], max: lag.at(-1) } : null });
      };
      let sock: WebSocket;
      try { sock = new WebSocket(`wss://ws.eodhistoricaldata.com/ws/${endpoint}?api_token=${encodeURIComponent(key)}`); } catch (e) { rep.errors.push(String(e)); finish(); return; }
      const timer = setTimeout(() => { try { sock.close(); } catch { /* closed */ } finish(); }, secs * 1000);
      sock.onopen = () => { rep.opened = true; sock.send(JSON.stringify({ action: "subscribe", symbols })); };
      sock.onmessage = (e) => {
        let m: any;
        try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.status_code !== undefined || m.message) { rep.said.push({ status: m.status_code, message: m.message }); return; }
        rep.messages += 1;
        if (!rep.first) rep.first = m;
        const t = Number(m.t ?? m.ms);
        if (t > 1e12) rep.lag.push(Date.now() - t);
      };
      sock.onerror = () => rep.errors.push("socket error");
      sock.onclose = (e) => { clearTimeout(timer); rep.closed = { code: e.code, reason: e.reason }; finish(); };
    });
    // History EODHD could draw a chart's past from, as its stream draws the
    // present (26 Oct: "Where is the history for the already passed trades or
    // candles"): its tick data for the last 30 minutes, and its one-minute
    // candles for the last session. "history" alone runs just these.
    const ticksFrom = Math.floor(now) - 1800;
    const tk = await get(`ticks/?s=${extraSymbol}&from=${ticksFrom}&to=${Math.floor(now)}&limit=5000`);
    const tb: any = tk.body && typeof tk.body === "object" ? tk.body : null;
    const tts: number[] = Array.isArray(tb?.ts) ? tb.ts : [];
    const ticks = {
      status: tk.status, ms: tk.ms, n: tts.length,
      first: tts.length ? new Date(Math.min(...tts)).toISOString() : null, last: tts.length ? new Date(Math.max(...tts)).toISOString() : null,
      behindSec: tts.length ? Math.round(Date.now() / 1000 - Math.max(...tts) / 1000) : null,
      sample: tts.length ? Object.fromEntries(Object.keys(tb).map((k) => [k, Array.isArray(tb[k]) ? tb[k].slice(-3) : tb[k]])) : null,
      error: tts.length ? null : (typeof tk.body === "string" ? tk.body : JSON.stringify(tk.body).slice(0, 300))
    };
    const yFrom = Math.floor(nyMoment(lastSessionDay(), "04:00") / 1000);
    const yi = await get(`intraday/${extraSymbol}.US?interval=1m&from=${yFrom}&to=${yFrom + 16 * 3600}`);
    const yc = Array.isArray(yi.body) ? yi.body : [];
    const lastSession = { status: yi.status, n: yc.length, first: yc[0]?.datetime ?? null, last: yc.at(-1)?.datetime ?? null, error: Array.isArray(yi.body) ? null : yi.body };
    const recent = await get(`intraday/${extraSymbol}.US?interval=1m&from=${Math.floor(now) - 3 * 3600}&to=${Math.floor(now)}`);
    const rc = Array.isArray(recent.body) ? recent.body : [];
    const today = { status: recent.status, n: rc.length, last: rc.at(-1)?.datetime ?? null, behindMin: rc.length ? Math.round((now - rc.at(-1).timestamp) / 60) : null, error: Array.isArray(recent.body) ? null : recent.body };
    if (historyOnly) return { at: new Date().toISOString(), symbol: extraSymbol, plan, ticks, lastSession, today };
    const [trades, bidAsk] = await Promise.all([listenTo("us", "AAPL,SPY,TSLA,NVDA"), listenTo("us-quote", "AAPL,SPY,TSLA,NVDA")]);
    return { at: new Date().toISOString(), plan, realtime: { status: rt.status, ms: rt.ms, quotes, error: quotes.length ? null : rt.body }, intraday, ticks, lastSession, today, stream: { trades, quotes: bidAsk } };
  }
  if (only === "news") {
    // A share's news between two moments, as the news tab and the screen read it.
    const t0 = Date.now();
    const r: any = await newsFor(house, [extra[0] || "AAPL"], extra[1] || new Date(Date.now() - 3 * 86400000).toISOString(), extra[2] || "", "desc", 20);
    if (r.error) return r;
    return { ms: Date.now() - t0, n: r.news.length, truncated: r.truncated, first: r.news.slice(0, 6).map((n: any) => ({ at: n.at, source: n.source, headline: n.headline.slice(0, 120), symbols: n.symbols.slice(0, 6) })) };
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
  if (only === "liveLimit") {
    // What the live limit says of an order, without sending it: [SYMBOL, SIDE, QTY].
    const [sym, side, qty] = [extra[0] || "AAPL", extra[1] === "SELL" ? "sell" : "buy", Number(extra[2]) || 1];
    return { account: house.name, paper: !!house.is_paper, symbol: sym, side, qty, refused: await liveLimit(house, sym, side as "buy" | "sell", qty, null, null) };
  }
  if (only === "orderstream") {
    // Whether Alpaca's trading stream takes this account's sign-in, and what
    // it says in a few seconds (nothing is sent but the sign-in and "listen").
    const said: string[] = [];
    const seen: any[] = [];
    const feed = orderStream(!!house.is_paper, { token: house.oauth_access_token, key: house.api_key, secret: house.api_secret }, (m) => seen.push(m), said);
    feed.start();
    await new Promise((r) => setTimeout(r, Math.min(10, Math.max(2, Number(seconds) || 4)) * 1000));
    feed.close();
    return { account: house.name, paper: !!house.is_paper, signIn: house.oauth_access_token ? "oauth" : "key pair", said, updates: seen.slice(0, 5) };
  }
  if (only === "allocate") {
    // Each group account's share of an order, without sending it:
    // [SYMBOL, SIDE, QTY, groupId...], the account given leading.
    const [sym, side, qty, ...ids] = extra;
    const owner = { id: house.user_id, email: await emailOf(admin, house.user_id) };
    const { accounts: _held, ...plan } = await allocation(admin, owner, house, ids.map((x) => x.toLowerCase()),
      { symbol: sym || "AAPL", side: side === "SELL" ? "sell" : "buy", qty: Number(qty) || 1 });
    return plan;
  }
  if (only === "guard") {
    // The minute job's view without firing: which stops it guards and from what.
    return await guardStops(admin, true, accountId);
  }
  if (only === "fills") {
    // The Demo P/L's read for an account (accountId), since New York midnight
    // today or the moment given: how many fills, a few of them, and the closes.
    const r: any = await accountFills(house, extra[0] || iso(nyMoment(nyDate(), "00:00")));
    if (r.error) return r;
    return { start: r.start, fills: r.fills.length, first: r.fills.slice(0, 6), positions: r.positions, marks: r.marks, options: r.options, truncated: r.truncated };
  }
  if (only === "pmToday") {
    // Today's pre-market as the live screen reads it before the open: the
    // biggest moves since the last close among shares that traded $1M then,
    // timed, with the busiest of them.
    const t0 = Date.now();
    const u = await screenUniverse(admin, house);
    const at = (row: any[], c: string) => row[u.columns.indexOf(c)];
    const move = (row: any[]) => Math.abs(at(row, "price") / at(row, "close") - 1);
    const ranked = u.rows.filter((row) => at(row, "price") >= 1 && at(row, "close") > 0 && at(row, "close") * (at(row, "volume") || 0) >= 1e6).sort((a, b) => move(b) - move(a));
    const t1 = Date.now();
    const pm: any = await screenPremarket(house, nyDate(), ranked.slice(0, 100).map((row) => at(row, "symbol")));
    const busiest = Object.entries(pm.pm || {}).sort((a: any, b: any) => b[1].pmVolume - a[1].pmVolume).slice(0, 10)
      .map(([s, v]: any) => { const row = ranked.find((r) => at(r, "symbol") === s)!; return { s, close: at(row, "close"), price: at(row, "price"), change: Math.round((at(row, "price") / at(row, "close") - 1) * 1000) / 10, ...v }; });
    return { msUniverse: t1 - t0, msPremarket: Date.now() - t1, day: u.rows[0] ? at(u.rows[0], "day") : null, through: pm.through, complete: pm.complete, feed: pm.feed, read: Object.keys(pm.pm || {}).length, withVolume: Object.values(pm.pm || {}).filter((v: any) => v.pmVolume > 0).length, busiest };
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
    // Which stock feed to listen to: IEX (real time), the delayed consolidated
    // tape, or the real-time one a paid data plan opens ("stocks" with extra
    // DELAYED_SIP or SIP).
    only === "crypto" ? null : feedCheck(`wss://stream.data.alpaca.markets/v2/${["DELAYED_SIP", "SIP"].includes(extra[0] || "") ? extra[0].toLowerCase() : FEED}`, auth,
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

// The live accounts the terminal trades: the owner's own Alpaca accounts.
const LIVE_ORDER_MAX = 5000;
const canTrade = (user: any, account: any) => account.is_paper || (isOwnerEmail(user?.email) && account.provider !== "snaptrade");
const NOT_LIVE = "Orders from the terminal go to paper accounts only during this test. Choose a paper account.";

// What an order would buy or sell, in dollars: its own price, else the price
// the browser saw, else the last trade.
async function lastTradePrice(account: any, symbol: string) {
  if (isCrypto(symbol)) {
    const r = await alpacaFetch(`${CRYPTO_DATA}/latest/trades?symbols=${encodeURIComponent(symbol)}`, account).catch(() => null);
    return num(r?.trades?.[symbol]?.p);
  }
  const r = await alpacaFetch(`${DATA}/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=${FEED}`, account).catch(() => null);
  return num(r?.trade?.p);
}

// A live order that opens or adds to a position, over the limit, is refused.
async function liveLimit(account: any, symbol: string, side: "buy" | "sell", qty: number, notional: number | null, price: number | null) {
  if (account.is_paper) return null;
  // The whole order within the limit: no need to read what is held first.
  if ((notional ?? (price ? qty * price : Infinity)) <= LIVE_ORDER_MAX) return null;
  const pos = await positionOf(account, symbol).catch(() => null);
  const held = pos ? (pos.side === "short" ? -Math.abs(pos.qty) : Math.abs(pos.qty)) : 0;
  const px = price ?? (notional ? null : await lastTradePrice(account, symbol));
  const opening = notional ? (side === "sell" && held > 0 ? 0 : notional) : openingQty(side, qty, held) * (px || 0);
  if (!notional && !px && openingQty(side, qty, held) > 0) return "Could not price this order to check it against the live limit; try a limit order.";
  if (opening > LIVE_ORDER_MAX) {
    return `Live orders that open or add to a position are limited to $${LIVE_ORDER_MAX.toLocaleString("en-US")} each during this test; this one is about $${Math.round(opening).toLocaleString("en-US")}.`;
  }
  return null;
}

// A buy or sell key's own orders carry this label.
const KEY_ORDER = "TERM_K_";

async function placeOrder(admin: any, user: any, account: any, input: any) {
  if (!canTrade(user, account)) return { status: 403, body: { error: NOT_LIVE } };
  const crypto = isCrypto(cryptoSymbol(input?.symbol));
  const fromKey = input?.fromKey === true;
  const clientId = `${fromKey ? KEY_ORDER : "TERM_"}${Date.now()}`;
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
    built = cryptoOrderBody(input, clientId, asset, num(held?.qty) || 0);
  } else {
    built = stockOrderBody(input, clientId);
  }
  if (!built.ok) return { status: 400, body: { error: built.reason } };
  const body = built.body as any;
  const sym = body.symbol.includes("/") || crypto ? cryptoSymbol(body.symbol) : body.symbol;
  const over = await liveLimit(account, sym, body.side, num(body.qty) || 0, num(body.notional),
    num(body.limit_price) ?? num(body.stop_price) ?? num(input.reference));
  if (over) return { status: 400, body: { error: over } };
  // A sell key pressed again replaces this account's earlier sell of the
  // same symbol still waiting (28 Oct, ELPW: a sell at 3.57 not yet
  // filled held 78 of 85 shares, and each lower sell after it was refused;
  // the owner: "Replace it"). The earlier one is cancelled first, which frees
  // its shares, and the new one goes for its full size, never more than is
  // then held: part of the earlier one may have filled meanwhile.
  let replaced = 0;
  if (fromKey && body.side === "sell" && body.qty) {
    const waiting = (await openOrdersFor(account, sym)).filter(replaceable);
    if (waiting.length) {
      const gone = await cancelAndWait(account, sym, waiting.map((o: any) => o.id));
      if (!gone) return { status: 409, body: { error: `The earlier ${sym} sell is still being cancelled by the broker. Press again in a moment.` } };
      replaced = waiting.length;
      const now = await positionOf(account, sym).catch(() => null);
      const held = now && now.side === "long" ? Math.abs(now.qty) : 0;
      if (!(held > 0)) return { status: 422, body: { error: `Nothing left to sell: the earlier ${sym} sell filled before it could be replaced.` } };
      if (Number(body.qty) > held) body.qty = String(Number(held.toFixed(9)));
    }
  }
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
    return { status: 200, body: { orderId: order.id, status: order.status, replaced } };
  } catch (e) {
    const message = brokerRefusal(String((e as Error)?.message || e), body.symbol);
    inBackground(recordAttempt(admin, { ...attempt, error: message }));
    return { status: 422, body: { error: message } };
  }
}

// ---------- one order, several accounts ----------
//
// 27 Oct: "I need to select the account I want to work on ... and the order
// setup goes for all of them proportionately. Like a pro rata." The order is
// set up on the account on screen (the lead); the accounts picked beside it
// get their share of it (proRata.ts has the rules). Each account's order goes
// through the same checks as one sent on its own, the live limit included,
// and each answers for itself: one refused does not hold up the others.
const GROUP_MAX = 10;
// The group: account ids, or { id, mode, value } where an account has its own size.
const groupKey = (x: any) => String(x && typeof x === "object" ? x.id || "" : x || "");
const groupIds = (ids: unknown, lead: any) =>
  [...new Set((Array.isArray(ids) ? ids : []).map(groupKey))].filter((id) => id && id !== lead.id).slice(0, GROUP_MAX);
const groupRule = (ids: unknown, id: string) => {
  const x: any = (Array.isArray(ids) ? ids : []).find((g) => groupKey(g) === id);
  return x && typeof x === "object" && x.mode ? { mode: String(x.mode), value: num(x.value) } as any : null;
};

async function groupAccounts(admin: any, user: any, lead: any, ids: unknown) {
  return await Promise.all(groupIds(ids, lead).map(async (id) => ({
    id, account: await loadAccount(admin, id, user.id, { cacheMs: 30000, staleMs: 600000 }).catch(() => null)
  })));
}

// A field of the order as sent: null when left out or empty. (`num` reads
// null as 0, which made a hotkey too small on the account on screen, sent with
// no quantity, read as "0 shares" and refused there with "Enter how many
// shares." instead of skipped, 28 Oct.)
const given = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));

const groupRow = (id: string, account: any, extra: Record<string, unknown>) =>
  ({ accountId: id, name: account?.name || "an account", live: account ? !account.is_paper : null, ...extra });

// The account's size and what it holds of the symbol, for its share.
async function bookOf(account: any, symbol: string) {
  const [acct, pos] = await Promise.all([alpacaFetch(`${tradingBase(account)}/account`, account), positionOf(account, symbol)]);
  return {
    id: account.id, name: account.name, equity: num(acct?.equity), buyingPower: num(acct?.buying_power),
    held: pos ? (pos.side === "short" ? -Math.abs(pos.qty) : Math.abs(pos.qty)) : 0, qtyText: pos ? String(pos.qtyText).replace(/^-/, "") : null
  };
}

// Each account's share of an order, without sending anything (the ticket's
// review shows it), and what sending needs to place each.
async function allocation(admin: any, user: any, lead: any, ids: unknown, input: any) {
  const crypto = isCrypto(cryptoSymbol(input?.symbol));
  const symbol = crypto ? cryptoSymbol(input?.symbol) : String(input?.symbol || "").toUpperCase().trim();
  const side = input?.side === "sell" ? "sell" as const : "buy" as const;
  const group = await groupAccounts(admin, user, lead, ids);
  // The account on screen as the browser has it, where it says (so its own
  // order can go at once, before the others' shares are worked out); read
  // here otherwise.
  const screen = input?.leadBook && typeof input.leadBook === "object" ? input.leadBook : null;
  const known = screen && given(screen.held) !== null && (given(screen.equity) !== null || given(screen.buyingPower) !== null)
    ? { id: lead.id, name: lead.name, equity: given(screen.equity), buyingPower: given(screen.buyingPower), held: given(screen.held) || 0, qtyText: null }
    : null;
  const [leadBook, ...books] = await Promise.all([
    known ? Promise.resolve(known) : bookOf(lead, symbol),
    ...group.map((g) => (g.account && canTrade(user, g.account) ? bookOf(g.account, symbol).catch((e: Error) => ({ error: brokerRefusal(String(e?.message || e)) })) : Promise.resolve(null)))
  ]);
  const ready = (books.filter((b: any) => b && !b.error) as any[]).map((b) => ({ ...b, rule: groupRule(ids, b.id) }));
  // The order's own price, for a size set in dollars or percent.
  const price = given(input?.limitPrice) ?? given(input?.stopPrice) ?? given(input?.reference);
  const shares = allocate({ side, qty: given(input?.qty), notional: given(input?.notional) }, leadBook, ready,
    { basis: input?.basis === "buyingPower" ? "buyingPower" : "equity", crypto, symbol, price, pct: given(input?.pct) });
  const rows = group.map((g, i) => {
    const b: any = books[i];
    if (!g.account) return groupRow(g.id, null, { skip: "not an account the terminal can trade" });
    if (!canTrade(user, g.account)) return groupRow(g.id, g.account, { skip: "a live account the terminal does not trade" });
    if (b?.error) return groupRow(g.id, g.account, { skip: `could not be read: ${b.error}` });
    const sh = shares.find((x) => x.id === g.id)!;
    return groupRow(g.id, g.account, { qty: sh.all ? Number(b.qtyText) : sh.qty, qtyText: sh.all ? b.qtyText : null, notional: sh.notional, all: sh.all, basis: sh.basis, skip: sh.skip });
  });
  return { symbol, side, lead: { accountId: lead.id, name: lead.name, equity: leadBook.equity, buyingPower: leadBook.buyingPower, held: leadBook.held }, group: rows, accounts: group };
}

async function orderForGroup(admin: any, user: any, lead: any, ids: unknown, input: any) {
  // Every share is worked out from the books as they stand before anything is
  // sent: the lead's own sale must not change what the others' shares read.
  // With the lead's book from the browser, its order goes at once, alongside
  // the reading of the others'; without it, after.
  const leadOff = given(input?.qty) === null && given(input?.notional) === null;
  // Its own trouble stays its own: a throw here is its refusal, not the group's.
  const own = () => placeOrder(admin, user, lead, input).catch((e: Error) => ({ status: 422, body: { error: String(e?.message || e) } as any }));
  const early = input?.leadBook && !leadOff ? own() : null;
  let plan: Awaited<ReturnType<typeof allocation>>;
  try {
    plan = await allocation(admin, user, lead, ids, input);
  } catch (e) {
    if (!early) throw e;
    // This account's order went already: said, with why the others' did not.
    const r = await early;
    const why = `not sent: ${String((e as Error)?.message || e)}`;
    return { status: r.status, body: { ...r.body, group: groupIds(ids, lead).map((id) => ({ ...groupRow(id, null, { skip: why }), status: "skipped" })) } };
  }
  const send = (row: any) => {
    const account = plan.accounts.find((g) => g.id === row.accountId)?.account;
    if (row.skip || !account) return Promise.resolve({ ...row, status: "skipped" });
    return placeOrder(admin, user, account, { ...input, qty: row.qtyText ?? row.qty, notional: row.notional })
      .then((r) => ({ ...row, ...(r.body as any), ok: r.status === 200 }))
      .catch((e: Error) => ({ ...row, ok: false, error: String(e?.message || e) }));
  };
  // Too small on the account on screen alone (a hotkey's size there under one
  // share): nothing sent there, the others still take theirs.
  const [r, ...group] = await Promise.all([
    leadOff ? Promise.resolve({ status: 200, body: { skipped: String(input?.leadSkip || "Too small on this account.") } as any }) : early ?? own(),
    ...plan.group.map(send)
  ]);
  return { status: r.status, body: { ...r.body, group } };
}

// An action run on each account of the group as it is on the lead.
async function forGroup(admin: any, user: any, lead: any, ids: unknown, run: (account: any) => Promise<{ status: number; body: any }>) {
  if (!groupIds(ids, lead).length) return null;
  const group = await groupAccounts(admin, user, lead, ids);
  return await Promise.all(group.map(async (g) => {
    if (!g.account) return groupRow(g.id, null, { ok: false, skip: "not an account the terminal can trade" });
    const r = await run(g.account).catch((e: Error) => ({ status: 500, body: { error: String(e?.message || e) } }));
    // Nothing of it held is not a failure, just nothing to do there.
    const none = r.status === 400 && /^No .* position to /.test(String(r.body?.error || ""));
    return groupRow(g.id, g.account, { ...r.body, ok: r.status === 200, ...(none ? { skip: "holds none", error: undefined } : {}) });
  }));
}

// ---------- the account's own trades ----------
//
// The demo account's results, as the replay has its own (26 Oct: "You gave
// me some insights on the replay for the today's position and not on the
// Demo!"): its share and coin fills since a moment, what it holds now, and
// each symbol's last close before that moment, the price shares held from
// before start counting at. The round trips are built in the browser
// (lib/demoTrades.js), the same way as the replay's.
const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
// A fill names a coin with or without its slash; no share's symbol is six letters ending in USD.
const fillSymbol = (s: string) => (s.includes("/") || (s.length >= 6 && /(USD|USDT|USDC)$/.test(s)) ? cryptoSymbol(s) : s);
const FILL_PAGES = 10;

async function accountFills(account: any, startIso: string) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start) || start > Date.now()) return { error: "Pick when to start." };
  if (Date.now() - start > 92 * 86400000) return { error: "At most 92 days at a time." };
  const base = tradingBase(account);
  const raw: any[] = [];
  let token: string | null = null;
  let truncated = false;
  for (let page = 0; page < FILL_PAGES; page++) {
    const list = await alpacaFetch(`${base}/account/activities/FILL?after=${encodeURIComponent(iso(start))}&direction=asc&page_size=100` +
      (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
    const rows = Array.isArray(list) ? list : [];
    raw.push(...rows);
    token = rows.length === 100 ? rows.at(-1)?.id || null : null;
    if (!token) break;
    if (page === FILL_PAGES - 1) truncated = true;
  }
  const options = raw.filter((a) => OCC_SYMBOL.test(String(a.symbol || ""))).length;
  const fills = raw.filter((a) => a.symbol && !OCC_SYMBOL.test(String(a.symbol)) && num(a.qty) && num(a.price)).map((a) => ({
    symbol: fillSymbol(String(a.symbol)), side: a.side === "buy" ? "buy" : "sell", qty: Number(a.qty), price: Number(a.price),
    time: Math.floor(Date.parse(a.transaction_time) / 1000), orderId: a.order_id || null
  }));
  const held = await alpacaFetch(`${base}/positions`, account);
  const positions: Record<string, { qty: number; last: number | null; avg: number | null }> = {};
  for (const p of Array.isArray(held) ? held : []) {
    if (p.asset_class === "us_option" || OCC_SYMBOL.test(String(p.symbol))) continue;
    positions[ownSymbol(p)] = { qty: num(p.qty) || 0, last: num(p.current_price), avg: num(p.avg_entry_price) };
  }
  // The last close before the start, for every symbol in play.
  const symbols = [...new Set([...fills.map((f) => f.symbol), ...Object.keys(positions)])];
  const marks: Record<string, number> = {};
  const from = iso(start - 12 * 86400000);
  const until = iso(start);
  const readMarks = async (list: string[], crypto: boolean) => {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100).join(",");
      const url = (feed: string) => crypto
        ? `${CRYPTO_DATA}/bars?symbols=${encodeURIComponent(chunk)}&timeframe=1Day&start=${from}&end=${until}&limit=10000`
        : `${DATA}/stocks/bars?symbols=${chunk}&timeframe=1Day&start=${from}&end=${until}&limit=10000&feed=${feed}&adjustment=split`;
      const page = await alpacaFetch(url("sip"), account).catch(() => alpacaFetch(url(FEED), account)).catch(() => null);
      for (const [sym, bars] of Object.entries(page?.bars || {})) {
        const before = (bars as any[]).filter((b) => Date.parse(b.t) < start);
        if (before.length) marks[crypto ? cryptoSymbol(sym) : sym] = Number(before.at(-1).c);
      }
    }
  };
  await Promise.all([readMarks(symbols.filter((s) => !isCrypto(s)), false), readMarks(symbols.filter((s) => isCrypto(s)), true)]);
  return { start: iso(start), fills, positions, marks, options, truncated };
}

// ---------- stops outside regular hours: the minute job ----------
//
// While no terminal is open on an account, the terminal's stops on it are
// watched from here, every minute before 9:30 and after 16:00 New York
// (stopGuardRun.ts has the rules; the open terminal's relay watches the rest
// of the time, and the account is left to it while it does). The owner's
// accounts from EODHD's stream, listened to for most of the minute; anyone
// else's from the trades of their own Alpaca account's IEX feed, 8:00 to
// 17:00, the hours it has them.
async function emailOf(admin: any, userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
  return data?.user?.email || "";
}

async function guardStops(admin: any, dryRun = false, onlyAccount = "") {
  const t = Date.now();
  const eodhdKey = Deno.env.get("EODHD_API_KEY") || null;
  const report: any = { at: iso(t), eodhdHours: guardHours(t, "eodhd"), iexHours: guardHours(t, "iex"), accounts: 0, watchedByTerminal: 0, off: 0, guards: [], fired: [] };
  // Fired stops whose limit did not fill go back as stops, at any hour.
  if (!dryRun) report.handedBack = await handBackFired(admin);
  if (!dryRun && !report.eodhdHours && !report.iexHours) return { ...report, skipped: "regular hours or closed" };
  // The terminal's people: those with a setting stored.
  const { data: people } = await admin.from("terminal_prefs").select("user_id").limit(5000);
  const users = [...new Set((people || []).map((r: any) => r.user_id))];
  if (!users.length) return report;
  // Every account the terminal trades: paper, and the owner's own live Alpaca
  // ones (27 Oct: activating live meant everything, the stop guard included).
  let q = admin.from("trading_accounts").select("id, user_id, is_paper, provider").in("user_id", users);
  if (onlyAccount) q = q.eq("id", onlyAccount);
  const [{ data: accounts }, { data: seen }] = await Promise.all([
    q, admin.from("terminal_guard_seen").select("account_id").gt("seen_at", iso(t - 45000))
  ]);
  const watched = new Set((seen || []).map((r: any) => r.account_id));
  const viaEodhd: any[] = [];
  const viaIex: any[] = [];
  const emails = new Map<string, string>();
  const emailFor = async (id: string) => emails.get(id) ?? emails.set(id, await emailOf(admin, id)).get(id)!;
  // Administrators only, as the terminal is.
  const admins = new Map<string, boolean>();
  const adminFor = async (id: string) => admins.get(id) ??
    admins.set(id, (await isAdminUser({ id, email: await emailFor(id) } as any, admin).catch(() => ({ isAdmin: false }))).isAdmin).get(id)!;
  for (const a of accounts || []) {
    if (a.provider === "snaptrade") continue;
    if (!(await adminFor(a.user_id))) continue;
    if (!a.is_paper && !isOwnerEmail(await emailFor(a.user_id))) continue;
    if (watched.has(a.id)) { report.watchedByTerminal += 1; if (!dryRun) continue; }
    if (!(await extStopsOn(admin, a.user_id))) { report.off += 1; continue; }
    const account = await loadAccount(admin, a.id, a.user_id).catch(() => null);
    if (!account) continue;
    const guards = await stopsToWatch(account).catch(() => []);
    report.accounts += 1;
    if (!guards.length) continue;
    const owner = !!eodhdKey && isOwnerEmail(await emailFor(a.user_id));
    report.guards.push(...guards.map((g) => ({ account: a.id, live: !a.is_paper, symbol: g.symbol, side: g.side, qty: g.qty, stop: g.stop, target: g.target, pair: g.pair, source: owner ? "eodhd" : "iex", terminalOpen: watched.has(a.id) })));
    (owner ? viaEodhd : viaIex).push({ account, userId: a.user_id, guards });
  }
  if (dryRun) return report;
  if (viaIex.length && report.iexHours) for (const item of viaIex) report.fired.push(...await checkIex(admin, item));
  if (viaEodhd.length && report.eodhdHours && eodhdKey) report.fired.push(...await watchEodhd(admin, eodhdKey, viaEodhd, Math.max(5000, 55000 - (Date.now() - t))));
  if (report.fired.length || report.guards.length) console.log(`stop guard job: ${JSON.stringify({ guards: report.guards.length, fired: report.fired })}`);
  return report;
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

// ---------- news ----------
//
// "I want to add news tab per stock I am on or seeing whether Demo or Replay
// ... in the gap, I need to see if there was any piece of news" (25 Oct).
// The account's own Alpaca news (Benzinga's wire, back to 2015) for one
// symbol or up to a hundred, between two moments, newest or oldest first.
// Headlines, summaries and links only; the article itself opens at its
// source. A coin is asked for by its pair without the slash ("BTCUSD").

const NEWS = "https://data.alpaca.markets/v1beta1/news";
const NEWS_MAX = 500;
const newsCache = new Map<string, { at: number; value: any }>();

const shapeNews = (n: any) => ({
  id: n.id, headline: String(n.headline || ""), summary: String(n.summary || ""), source: String(n.source || ""), author: String(n.author || ""),
  url: String(n.url || ""), at: n.created_at || null, updated: n.updated_at || null,
  symbols: Array.isArray(n.symbols) ? n.symbols : [],
  image: (Array.isArray(n.images) ? n.images.find((i: any) => i?.size === "thumb") || n.images[0] : null)?.url || null
});

async function newsFor(account: any, symbolsIn: string[], startIn: string, endIn: string, sortIn: string, maxIn: number) {
  const symbols = [...new Set(symbolsIn.map((x) => String(x).toUpperCase().trim()))].filter((x) => TERMINAL_SYMBOL(x)).slice(0, 100);
  if (!symbols.length) return { error: "Which symbol?" };
  const end = Math.min(endIn ? Date.parse(endIn) : Date.now(), Date.now());
  const start = Date.parse(startIn);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(start < end)) return { news: [], truncated: false };
  if (start < Date.parse("2015-01-01T00:00:00Z")) return { error: "News goes back to 2015." };
  const sort = sortIn === "asc" ? "asc" : "desc";
  const max = Math.min(NEWS_MAX, Math.max(1, Math.floor(maxIn) || 50));
  const key = `${account.id}|${symbols.join(",")}|${start}|${end}|${sort}|${max}`;
  const hit = newsCache.get(key);
  // A window that ended a while ago does not change; a live one is read again after a minute.
  if (hit && Date.now() - hit.at < (end < Date.now() - 3600000 ? 6 * 3600000 : 60000)) return hit.value;
  const ask = symbols.map((x) => encodeURIComponent(x.replace("/", ""))).join(",");
  const news: any[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const page = await alpacaFetch(`${NEWS}?symbols=${ask}&start=${iso(start)}&end=${iso(end)}&limit=50&sort=${sort}&include_content=false` +
      (token ? `&page_token=${encodeURIComponent(token)}` : ""), account);
    for (const n of page?.news || []) news.push(shapeNews(n));
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && news.length < max && pages < 10);
  const value = { news: news.slice(0, max), truncated: !!token || news.length > max };
  newsCache.set(key, { at: Date.now(), value });
  if (newsCache.size > 200) newsCache.delete(newsCache.keys().next().value!);
  return value;
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
  // "both": a stop and a target at once, at the two prices given, from the
  // ticket's exits for a position (26 Oct, 521 RENT held: "the take profit or
  // any check boxes don't work").
  const kind = input.kind === "target" ? "target" : input.kind === "both" ? "both" : "stop";
  const [pos, open] = await Promise.all([positionOf(account, symbol), openOrdersFor(account, symbol)]);
  if (!pos) return { status: 400, body: { error: `No ${symbol} position to ${kind === "target" ? "take profit on" : "protect"}.` } };
  const closing = pos.side === "short" ? "buy" : "sell";
  const have = existingExits(open, closing);
  const from = input.from === "entry" ? "entry" as const : "last" as const;
  const measure = { mode: input.mode, value: Number(input.value), from };
  let stop = have.stop;
  let target = have.target;
  let note: string | null = null;
  if (kind !== "target") {
    const plan = stopPlan(pos, kind === "both" ? { mode: "price" as const, value: Number(input.stopPrice), from } : measure, crypto);
    if (!plan.ok) return { status: 400, body: { error: plan.reason } };
    stop = plan.stopPrice;
    note = plan.note;
  }
  if (kind !== "stop") {
    const plan = targetPlan(pos, kind === "both" ? { mode: "price" as const, value: Number(input.targetPrice), from } : measure);
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
  const closing = pos.side === "short" ? "buy" : "sell";
  // A market sale already on its way is left alone, and what it still has to
  // sell is not sold twice (positionTools.ts exitSplit).
  const split = exitSplit(open, closing);
  const free = Math.max(0, held - split.selling);
  if (free < 1e-9) {
    return { status: 409, body: { error: `All ${held} ${symbol} are already being sold at market; that order is still filling.` } };
  }
  const base = partial ? tradeSize(fills, pos.qty, (s) => cryptoSymbol(s) === symbol) : held;
  const wanted = partial
    ? partialQty(held, base, percent, { whole: !crypto && Number.isInteger(held), step: crypto ? asset?.minTradeIncrement : 1e-9, min: crypto ? asset?.minOrderSize : 0 })
    : { qty: held, all: true };
  const amount = split.selling > 0 ? { qty: Math.min(wanted.qty, free), all: false } : wanted;
  // Outside regular hours the limit is priced against the broker's own mark
  // and the screen's quote as well as IEX's (positionTools.ts exitPlan).
  const plan = exitPlan(pos, amount, session, {
    bid: num((quote as any).bp), ask: num((quote as any).ap), ref: pos.last, live: { bid: num(input?.bid), ask: num(input?.ask) }
  }, crypto);
  if (!plan.ok) return { status: 400, body: { error: plan.reason } };
  // Every other working order on the symbol holds shares the exit needs. A
  // partial exit hands the old stop's price back, for the browser to put the
  // stop back on what remains once the exit has filled; and whatever stop and
  // target the exit takes off go back on at once if the broker refuses it, so
  // a refused exit never leaves the position bare (27 Oct, AIOK).
  const working = existingExits(open, closing);
  const kept = partial && !amount.all ? working : { stop: null, target: null };
  if (!(await cancelAndWait(account, symbol, split.cancel.map((o: any) => o.id)))) {
    return { status: 409, body: { error: `${symbol}'s working orders are still being cancelled; press again in a moment.` } };
  }
  const refused = async (message: string) => ({
    status: 422, body: { error: `${message}${await putBack(admin, user, account, symbol, working)}`, cancelled: split.cancel.length }
  });
  let order: any;
  if (plan.how === "close") {
    const sym = encodeURIComponent(symbol.replace("/", ""));
    const how = plan.all ? "percentage=100" : `qty=${Number(plan.qty.toFixed(9))}`;
    try {
      order = await alpacaFetch(`${tradingBase(account)}/positions/${sym}?${how}`, account, { method: "DELETE" });
    } catch (e) {
      const message = brokerRefusal(String((e as Error)?.message || e), symbol);
      inBackground(recordAttempt(admin, { userId: user.id, accountId: account.id, intent: "close", ticker: symbol, error: message }));
      return await refused(message);
    }
    inBackground(recordAttempt(admin, { userId: user.id, accountId: account.id, intent: "close", ticker: symbol, legs: [{ symbol, side: closing, ratio: 1 }], qty: order?.qty ?? null, orderType: "market", brokerOrderId: order?.id, status: order?.status, quote: { percent, tradeSize: base } }));
  } else {
    const built = stockOrderBody({ symbol, side: plan.side, qty: plan.qty, type: "limit", limitPrice: plan.limitPrice, timeInForce: "day", extendedHours: true }, `TERM_${Date.now()}`);
    if (!built.ok) return await refused(built.reason);
    const sent = await sendBody(admin, user, account, "close", built.body);
    if (sent.error) return await refused(sent.error);
    order = sent.order;
  }
  if (order?.status === "rejected") {
    const what = plan.how === "limit" ? `${plan.side} ${plan.qty} ${symbol} at ${plan.limitPrice}` : `close ${symbol}`;
    return await refused(`Alpaca rejected the exit (${what}) without saying why.`);
  }
  return {
    status: 200,
    body: {
      orderId: order?.id, status: order?.status, how: plan.how, percent, side: closing, tradeSize: base, all: plan.how === "close" ? plan.all : false,
      limitPrice: plan.how === "limit" ? plan.limitPrice : null, qty: plan.how === "limit" ? plan.qty : num(order?.qty) ?? plan.qty,
      note: [plan.how === "limit" ? plan.note : null, split.selling > 0 ? `${split.selling} already being sold at market` : null].filter(Boolean).join("; ") || null,
      cancelled: split.cancel.length, restopPrice: kept.stop, retargetPrice: kept.target,
      // What the exit took off, for the browser to put back if the exit ends unfilled.
      heldStop: working.stop, heldTarget: working.target
    }
  };
}

// The stop and target an exit took off, put back on the whole position after
// the exit was refused. Returns the words to add to the refusal.
async function putBack(admin: any, user: any, account: any, symbol: string, held: { stop: number | null; target: number | null }) {
  const { stop, target } = held;
  if (!stop && !target) return "";
  const kind = stop && target ? "both" : stop ? "stop" : "target";
  const r = await protect(admin, user, account, { symbol, kind, mode: "price", value: stop ?? target, stopPrice: stop, targetPrice: target })
    .catch((e: Error) => ({ status: 500, body: { error: String(e?.message || e) } }));
  const names = [stop ? `stop ${stop}` : null, target ? `target ${target}` : null].filter(Boolean).join(" and ");
  return r.status === 200 ? ` Your ${names} ${stop && target ? "are" : "is"} back on.` : ` Your ${names} could not be put back (${(r.body as any)?.error}): set ${stop && target ? "them" : "it"} again now.`;
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
  const age = Date.now() - lab.at;
  const read = async () => { lab = { at: Date.now(), on: (await readSettings(admin)).terminalLab }; return lab.on; };
  if (age < 30000) return lab.on;
  // Known within the last ten minutes: answered at once, read again behind it.
  if (age < 600000) { read().catch(() => {}); return lab.on; }
  return await read();
}
const callers = new Map<string, { at: number; user: any; isAdmin: boolean }>();
// The caller, and whether they are an administrator: the terminal is an
// admin-only tool (27 Oct: "Make sure all the terminal and stocks thing an
// admin-only features. No one should see it"). Kept a minute with the token.
async function caller(req: Request, admin: any) {
  const token = req.headers.get("Authorization") || "";
  const check = async () => {
    const user = await requireUser(req);
    if (!user) { callers.delete(token); return null; }
    const { isAdmin } = await isAdminUser(user, admin);
    const seen = { at: Date.now(), user, isAdmin };
    if (callers.size > 500) callers.clear();
    callers.set(token, seen);
    return seen;
  };
  const hit = callers.get(token);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < 60000) return hit;
  // Checked within the last ten minutes and not yet run out: let through at
  // once and checked again behind it, so an order never waits on the sign-in check.
  if (hit && age < 600000 && expiresAt(token) > Date.now()) { check().catch(() => callers.delete(token)); return hit; }
  return await check();
}
// When the sign-in token says it runs out (0 when it cannot be read).
function expiresAt(token: string) {
  try {
    const part = (token.replace(/^Bearer\s+/i, "").split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
    const exp = Number(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const [on, body] = await Promise.all([labOn(admin), req.json().catch(() => ({}))]);
    if (!on) return jsonResponse({ error: "The trading terminal is not available here." }, 404);
    if (body?.action === "guardStops") {
      if (!(await redeemCronTicket(admin, body.ticket, "terminal_stop_guard"))) return jsonResponse({ error: "not authorised" }, 401);
      return jsonResponse(await guardStops(admin));
    }
    if (body?.action === "selftest") {
      if (!(await redeemCronTicket(admin, body.ticket, "terminal_selftest"))) return jsonResponse({ error: "not authorised" }, 401);
      const report = await selftest(admin, String(body.only || ""), Number(body.seconds) || 8, String(body.accountId || ""),
        (Array.isArray(body.coins) ? body.coins : []).map((c: unknown) => String(c).toUpperCase()));
      console.log(`terminal selftest: ${JSON.stringify(report)}`);
      return jsonResponse(report);
    }

    const who = await caller(req, admin);
    if (!who) return jsonResponse({ error: "Unauthorized" }, 401);
    // Anyone else is told nothing exists here, as when the lab is off.
    if (!who.isAdmin) return jsonResponse({ error: "The trading terminal is not available here." }, 404);
    const user = who.user;
    const { action, accountId } = body || {};
    if (action === "prefs") return jsonResponse(...(await prefs(admin, user.id, body)));
    // Which share tapes this person can stream: EODHD's real-time one only for
    // the owner, whose plan it is, while the project holds its key.
    // And whether this person's live accounts trade from the terminal (the owner's only).
    if (action === "feeds") return jsonResponse({ eodhd: isOwnerEmail(user.email) && !!Deno.env.get("EODHD_API_KEY"), liveTrading: isOwnerEmail(user.email) });
    if (!accountId) return jsonResponse({ error: "Choose an account." }, 400);
    // The account's row (credentials still encrypted) kept 30 seconds by this
    // instance: a burst of key presses reads the database once.
    const account = await loadAccount(admin, accountId, user.id, { cacheMs: 30000, staleMs: 600000 });

    const symbol = String(body.symbol || "").toUpperCase().trim();
    if (action === "bars") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await bars(account, symbol, String(body.interval || "5Min"), String(body.session || ""), stockFeedOf(body.stockFeed)));
    }
    if (action === "snapshot") {
      const list = (Array.isArray(body.symbols) ? body.symbols : [symbol]).map((s: string) => String(s).toUpperCase().trim());
      return jsonResponse(await snapshot(account, list, stockFeedOf(body.stockFeed)));
    }
    if (action === "search") return jsonResponse(await search(account, String(body.q || "")));
    if (action === "asset") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse({ asset: await assetFor(account, symbol) });
    }
    if (action === "account") return jsonResponse(await accountView(account));
    // The other accounts picked beside this one, as they stand: what each
    // holds and its working orders (28 Oct: sells refused or unfilled on two
    // of three accounts while their buys filled, unseen, "I keep stacking").
    if (action === "groupView") {
      const rows = await forGroup(admin, user, account, body.group, async (acct) => {
        if (!canTrade(user, acct)) return { status: 403, body: { error: NOT_LIVE } };
        const base = tradingBase(acct);
        const [positions, orders] = await Promise.all([
          alpacaFetch(`${base}/positions`, acct),
          alpacaFetch(`${base}/orders?status=open&nested=true&limit=200`, acct)
        ]);
        return { status: 200, body: { positions: positionsView(positions), orders: workingView(orders) } };
      });
      return jsonResponse({ group: rows || [] });
    }
    if (action === "trades") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await trades(account, symbol, stockFeedOf(body.stockFeed)));
    }
    if (action === "book") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      return jsonResponse(await book(account, symbol, stockFeedOf(body.stockFeed)));
    }
    if (action === "news") {
      const list = Array.isArray(body.symbols) ? body.symbols : [symbol];
      const r = await newsFor(account, list, String(body.start || ""), String(body.end || ""), String(body.sort || "desc"), Number(body.max) || 50);
      return jsonResponse(r, (r as any).error ? 400 : 200);
    }
    if (action === "guardFires") {
      const { data } = await admin.from("terminal_stop_fires").select("order_id, symbol, side, qty, kind, stop_price, target_price, trigger_price, via, status, note, created_at")
        .eq("user_id", user.id).gt("created_at", iso(Date.now() - 24 * 3600000)).order("created_at", { ascending: false }).limit(50);
      return jsonResponse({ fires: data || [] });
    }
    if (action === "fills") {
      const r = await accountFills(account, String(body.start || ""));
      return jsonResponse(r, (r as any).error ? 400 : 200);
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
    // One order, several accounts (body.group: the other accounts' ids).
    if (action === "allocate") {
      // The shares only: the loaded accounts (their keys) never leave the server.
      const { accounts: _held, ...plan } = await allocation(admin, user, account, body.group, body.order || {});
      return jsonResponse(plan);
    }
    if (action === "order") {
      if (groupIds(body.group, account).length) {
        const r = await orderForGroup(admin, user, account, body.group, body.order || {});
        return jsonResponse(r.body, r.status);
      }
      const r = await placeOrder(admin, user, account, body.order || {});
      return jsonResponse(r.body, r.status);
    }
    if (action === "replay") {
      if (!TERMINAL_SYMBOL(symbol)) return jsonResponse({ error: "Choose a symbol." }, 400);
      const r = await replayData(account, symbol, String(body.tf || "1Min"), String(body.from || ""), String(body.to || ""));
      return jsonResponse(r, (r as any).error ? 400 : 200);
    }
    if (action === "protect" || action === "exit" || action === "cancelOrders") {
      if (!canTrade(user, account)) return jsonResponse({ error: NOT_LIVE }, 403);
      // Each on its own account: an exit of its own trade, a stop on its own
      // position, its own working orders cancelled. The group's run alongside.
      const run = async (acct: any) => {
        if (!canTrade(user, acct)) return { status: 403, body: { error: NOT_LIVE } };
        if (action === "cancelOrders") return { status: 200, body: await cancelOrders(acct, symbol ? cryptoSymbol(symbol) : "") };
        return action === "protect" ? await protect(admin, user, acct, body) : await exitPosition(admin, user, acct, body);
      };
      const [r, group] = await Promise.all([run(account), forGroup(admin, user, account, body.group, run)]);
      return jsonResponse(group ? { ...r.body, group } : r.body, r.status);
    }
    return jsonResponse({ error: `Unknown action "${action}"` }, 400);
  } catch (error) {
    return jsonResponse({ error: brokerRefusal(String((error as Error)?.message || error)) }, 500);
  }
});
