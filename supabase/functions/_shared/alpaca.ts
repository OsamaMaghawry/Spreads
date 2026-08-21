// Shared Alpaca helpers: fetch with retry, OCC parsing, spread pairing, quotes.

export function tradingBase(account) {
  return account.is_paper ? "https://paper-api.alpaca.markets/v2" : "https://api.alpaca.markets/v2";
}

export function authHeaders(account) {
  return {
    "APCA-API-KEY-ID": account.api_key,
    "APCA-API-SECRET-KEY": account.api_secret,
    "Content-Type": "application/json"
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function alpacaFetch(url, account, options: RequestInit = {}, retries = 4) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    let res;
    try {
      res = await fetch(url, { ...options, headers: { ...authHeaders(account), ...(options.headers || {}) } });
    } catch (e) {
      lastErr = e;
      await wait(600 * (i + 1));
      continue;
    }
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;

    // 429 = rate limit: back off (honoring Retry-After) and try again.
    if (res.status === 429) {
      lastErr = new Error("Alpaca rate limit — too many requests, please wait a moment.");
      const retryAfter = parseFloat(res.headers.get("retry-after") || "0");
      await wait(retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 1000 * Math.pow(2, i)));
      continue;
    }

    lastErr = new Error(`Alpaca ${res.status}: ${text}`);
    if (res.status < 500) throw lastErr;
    await wait(600 * (i + 1));
  }
  throw lastErr;
}

export function parseOCCSymbol(symbol) {
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const raw = match[2];
  return {
    ticker: match[1],
    expiry: raw,
    expiryFormatted: `20${raw.substring(0, 2)}-${raw.substring(2, 4)}-${raw.substring(4, 6)}`,
    type: match[3],
    strike: parseFloat(match[4]) / 1000
  };
}

// Spread pairing lives in spreadPairing.ts (provenance-based); re-exported here
// so existing consumers keep importing it from this module.
export { pairSpreads } from "./spreadPairing.ts";

// Latest option quotes for all legs -> combined debit (cost to close) per unit.
// Pass callShortSymbol/callLongSymbol too for iron condors; bids/asks are summed
// per side, weighted by putRatio/callRatio for unbalanced condors.
export async function getSpreadQuote(account, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio = 1, callRatio = 1) {
  const shortLegs = [[shortSymbol, putRatio || 1], [callShortSymbol, callRatio || 1]].filter(([s]) => s);
  const longLegs = [[longSymbol, putRatio || 1], [callLongSymbol, callRatio || 1]].filter(([s]) => s);
  const allSyms = [...shortLegs, ...longLegs].map(([s]) => s);
  const url = `https://data.alpaca.markets/v1beta1/options/quotes/latest?symbols=${allSyms.join(",")}`;
  const data = await alpacaFetch(url, account);
  const quotes = (data && data.quotes) || {};
  if (allSyms.some((sym) => !quotes[sym as string])) return null;
  const sum = (legs, field) => legs.reduce((a, [sym, r]) => a + (r as number) * (quotes[sym as string][field] || 0), 0);
  const shortBid = sum(shortLegs, "bp"), shortAsk = sum(shortLegs, "ap");
  const longBid = sum(longLegs, "bp"), longAsk = sum(longLegs, "ap");
  return {
    shortBid, shortAsk, longBid, longAsk,
    askDebit: shortAsk - longBid,
    bidDebit: shortBid - longAsk,
    midDebit: (shortBid + shortAsk - longBid - longAsk) / 2
  };
}

// Loads a trading account, enforcing that it belongs to the requesting user.
// The admin (service-role) client bypasses RLS, so this ownership check is
// what actually scopes access per-user (Base44's asServiceRole had no such
// check — every authenticated user could load any account).
export async function loadAccount(admin, accountId, userId) {
  const { data, error } = await admin
    .from("trading_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trading account not found");
  return data;
}

// Quote for an arbitrary set of closing legs.
// Each leg: { symbol, ratio, action: 'buy_to_close' | 'sell_to_close' }.
// Result is the net debit per unit (negative = net credit received).
export async function getLegsQuote(account, legs) {
  const syms = legs.map((l) => l.symbol);
  const url = `https://data.alpaca.markets/v1beta1/options/quotes/latest?symbols=${syms.join(",")}`;
  const data = await alpacaFetch(url, account);
  const quotes = (data && data.quotes) || {};
  if (syms.some((sym) => !quotes[sym])) return null;
  let askDebit = 0;
  let bidDebit = 0;
  legs.forEach((l) => {
    const q = quotes[l.symbol];
    const r = l.ratio || 1;
    if (l.action === "sell_to_close") {
      askDebit -= r * (q.bp || 0);
      bidDebit -= r * (q.ap || 0);
    } else {
      askDebit += r * (q.ap || 0);
      bidDebit += r * (q.bp || 0);
    }
  });
  return { askDebit, bidDebit, midDebit: (askDebit + bidDebit) / 2 };
}
