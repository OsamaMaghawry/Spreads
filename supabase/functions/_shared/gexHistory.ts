// Gamma exposure on a past day, from Databento's record of every US options
// exchange (OPRA), for backtesting (7-8 Nov 2026, the owner: "can we get the
// historical Gamma statistics? ... for backtesting ... what was going on at
// that time with Gamma and how the price performed after that"; then "let's
// go with just 1 month of TSLA").
//
// What a past day needs, read narrowly to keep the cost down (priced on
// staging, 8 Nov: SPY's full statistics $0.76 a day, these two $0.18):
//   - open interest: OPRA publishes it once, at 6:30 New York, before the
//     open (statistics, stat_type 9), one figure per contract;
//   - each contract's best bid and offer across the exchanges one minute
//     before the close (cbbo-1m), whose midpoint gives its implied volatility.
// The chain built here has the live Gamma page's shape (functions/terminal
// gexChain), so the same math (gex.js) reads a past day as it reads today.
// Pure, and tested (gexHistory.test.ts); the terminal function does the I/O.

import { RATE, YEAR_MS, closeOf, prepare, pick, byStrike, profile, flipOf, walls, byExpiry } from "./gex.js";

export const OPEN_INTEREST = 9; // Databento StatType
// Contracts counted, as on the live page: within 90 days and 20% of the price.
export const HISTORY_DAYS = 90;
export const HISTORY_SPAN = 0.2;

/** An OCC option symbol, "TSLA  261106C00500000": its root, expiry, side and strike. */
export function occParts(symbol: string) {
  const m = /^([A-Z0-9.]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(String(symbol || "").trim());
  if (!m) return null;
  return { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, call: m[5] === "C", strike: Number(m[6]) / 1000 };
}

// The standard normal distribution (Abramowitz and Stegun 26.2.17, error under 1e-7).
function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Black-Scholes price of a European option. */
export function bsPrice(spot: number, strike: number, years: number, iv: number, call: boolean, rate = RATE) {
  if (!(spot > 0 && strike > 0 && years > 0 && iv > 0)) return Math.max(0, call ? spot - strike : strike - spot);
  const sd = iv * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * years) / sd;
  const d2 = d1 - sd;
  const k = strike * Math.exp(-rate * years);
  return call ? spot * normCdf(d1) - k * normCdf(d2) : k * normCdf(-d2) - spot * normCdf(-d1);
}

/**
 * The volatility at which Black-Scholes gives `price`, by bisection between
 * 1% and 500%; 0 when no volatility in that range does (a price below what
 * the option is worth at once, or above any sensible value), and the chain
 * then fills it from its expiry's median, as the live page does.
 */
export function impliedVol(price: number, spot: number, strike: number, years: number, call: boolean, rate = RATE) {
  if (!(price > 0 && spot > 0 && strike > 0 && years > 0)) return 0;
  let lo = 0.01;
  let hi = 5;
  if (price <= bsPrice(spot, strike, years, lo, call, rate) || price >= bsPrice(spot, strike, years, hi, call, rate)) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice(spot, strike, years, mid, call, rate) > price) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Databento CSV, header first, as objects keyed by the header's names. */
export function csvObjects(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = cells[i] ?? ""; });
    return o;
  });
}

/** Open interest per OCC symbol from statistics rows (stat_type 9); a contract repeated keeps its largest figure. */
export function openInterestOf(rows: Record<string, string>[]) {
  const out = new Map<string, number>();
  let published: string | null = null;
  for (const r of rows) {
    if (Number(r.stat_type) !== OPEN_INTEREST || !r.symbol) continue;
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q < 0 || q >= 2147483647) continue;
    out.set(r.symbol, Math.max(out.get(r.symbol) || 0, q));
    const at = r.ts_event || r.ts_recv;
    if (at && (!published || at < published)) published = at;
  }
  return { oi: out, published };
}

/** Each contract's last best bid and offer from cbbo-1m rows. */
export function quotesOf(rows: Record<string, string>[]) {
  const out = new Map<string, { bid: number; ask: number }>();
  for (const r of rows) {
    if (!r.symbol) continue;
    const bid = Number(r.bid_px_00);
    const ask = Number(r.ask_px_00);
    out.set(r.symbol, { bid: Number.isFinite(bid) ? bid : 0, ask: Number.isFinite(ask) ? ask : 0 });
  }
  return out;
}

/**
 * A past day's chain, shaped as the live page's: contracts within 90 days and
 * 20% of `spot`, each with its open interest and the volatility its closing
 * midpoint implies at `at` (a minute before the close). Volume is not read
 * (0): the past day's volume would cost as much again.
 */
export function historyChain({ symbol, spot, at, oi, quotes, published = null }: {
  symbol: string; spot: number; at: number; oi: Map<string, number>; quotes: Map<string, { bid: number; ask: number }>; published?: string | null;
}) {
  const lo = spot * (1 - HISTORY_SPAN);
  const hi = spot * (1 + HISTORY_SPAN);
  const until = at + HISTORY_DAYS * 86400000;
  const listed: { strike: number; expiry: string; call: boolean; oi: number; iv: number }[] = [];
  let noQuote = 0;
  let noVol = 0;
  for (const [sym, open] of oi) {
    const p = occParts(sym);
    if (!p || p.root !== symbol || !(open > 0)) continue;
    const close = closeOf(p.expiry);
    if (close <= at || close > until || p.strike < lo || p.strike > hi) continue;
    const q = quotes.get(sym);
    let iv = 0;
    if (!q || !(q.ask > 0) || !(q.bid >= 0) || q.ask < q.bid) noQuote += 1;
    else iv = impliedVol((q.bid + q.ask) / 2, spot, p.strike, (close - at) / YEAR_MS, p.call);
    if (!iv) noVol += 1;
    listed.push({ strike: p.strike, expiry: p.expiry, call: p.call, oi: open, iv });
  }
  const expiries = [...new Set(listed.map((c) => c.expiry))].sort();
  const index = new Map(expiries.map((e, i) => [e, i]));
  const rows = listed.map((c) => [c.strike, index.get(c.expiry)!, c.call ? 1 : 0, c.oi, Number(c.iv.toFixed(4)), 0]);
  return {
    symbol, spot, at: new Date(at).toISOString(), days: HISTORY_DAYS, span: HISTORY_SPAN, oiPublished: published,
    expiries, rows, counts: { listed: listed.length, used: rows.length, noQuote, noVol }
  };
}

const r2 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/**
 * The figures a backtest reads for each expiry window the page offers
 * (nearest, 7, 30 days, all within 90): net gamma per 1% move, the flip, the
 * call and put walls; and gamma by expiry.
 */
export function historySummary(chain: ReturnType<typeof historyChain>) {
  const now = Date.parse(chain.at);
  const prepared = prepare(chain, now);
  const spot = chain.spot;
  const windows: Record<string, unknown> = {};
  for (const [name, days] of [["nearest", 0], ["week", 7], ["month", 30], ["all", null]] as const) {
    const contracts = pick(prepared, { days });
    if (!contracts.length) { windows[name] = null; continue; }
    const g = byStrike(contracts, spot, "gex");
    const w = walls(g.rows);
    const flip = flipOf(profile(contracts, spot), spot);
    windows[name] = {
      contracts: contracts.length, netGex: Math.round(g.totals.netGex), flip: r2(flip),
      callWall: w.call, putWall: w.put, top: w.top.map((t: any) => ({ strike: t.strike, net: Math.round(t.net) }))
    };
  }
  const expiries = byExpiry(prepared, pick(prepared), spot).map((e: any) => ({
    expiry: e.expiry, days: e.days, call: Math.round(e.call), put: Math.round(e.put), share: Math.round(e.share * 1000) / 1000
  }));
  return { windows, expiries, filled: prepared.filled, skipped: prepared.skipped };
}
