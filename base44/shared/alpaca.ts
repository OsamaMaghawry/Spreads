// Shared Alpaca helpers: fetch with retry, OCC parsing, spread pairing, quotes.

export function tradingBase(account) {
  return account.is_paper
    ? "https://paper-api.alpaca.markets/v2"
    : "https://api.alpaca.markets/v2";
}

export function authHeaders(account) {
  return {
    "APCA-API-KEY-ID": account.api_key,
    "APCA-API-SECRET-KEY": account.api_secret,
    "Content-Type": "application/json"
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function alpacaFetch(url, account, options = {}, retries = 4) {
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

// Pair option legs into put credit spreads, call credit spreads and iron condors.
export function pairSpreads(positions, activities) {
  const fillDates = {};
  (activities || []).forEach((a) => {
    if (a.symbol && a.transaction_time && !fillDates[a.symbol]) {
      fillDates[a.symbol] = a.transaction_time.substring(0, 10);
    }
  });

  const legsBySymbol = {};
  (positions || []).forEach((p) => {
    if (p.asset_class !== "us_option" && p.symbol.length <= 10) return;
    const parsed = parseOCCSymbol(p.symbol);
    if (!parsed) return;
    const qty = parseInt(p.qty);
    if (!legsBySymbol[p.symbol]) {
      legsBySymbol[p.symbol] = {
        symbol: p.symbol,
        ticker: parsed.ticker,
        optionType: parsed.type,
        expiry: parsed.expiry,
        expiryFormatted: parsed.expiryFormatted,
        entryDate: fillDates[p.symbol] || new Date().toISOString().substring(0, 10),
        strike: parsed.strike,
        qty: qty,
        avgEntryPrice: Math.abs(parseFloat(p.avg_entry_price)),
        currentPrice: Math.abs(parseFloat(p.current_price || p.avg_entry_price))
      };
    } else {
      legsBySymbol[p.symbol].qty += qty;
    }
  });

  const grouped = {};
  Object.values(legsBySymbol).forEach((leg) => {
    (grouped[leg.ticker] = grouped[leg.ticker] || []).push(leg);
  });

  // Pair shorts with protective longs of the same option type.
  // Puts: long strike below short. Calls: long strike above short.
  const pairSide = (legs, optionType) => {
    const isCall = optionType === "C";
    const shorts = legs.filter((l) => l.optionType === optionType && l.qty < 0);
    const longs = legs.filter((l) => l.optionType === optionType && l.qty > 0);
    const out = [];
    shorts.forEach((s) => {
      let remaining = Math.abs(s.qty);
      longs.forEach((l) => {
        const strikeOk = isCall ? l.strike > s.strike : l.strike < s.strike;
        if (remaining > 0 && strikeOk && l.expiry === s.expiry && l.qty > 0) {
          const q = Math.min(remaining, l.qty);
          out.push({
            type: isCall ? "call_spread" : "put_spread",
            ticker: s.ticker,
            expiry: s.expiry,
            expiryFormatted: s.expiryFormatted,
            entryDate: s.entryDate,
            shortSymbol: s.symbol,
            longSymbol: l.symbol,
            shortStrike: s.strike,
            longStrike: l.strike,
            qty: q,
            shortEntryPrice: s.avgEntryPrice,
            longEntryPrice: l.avgEntryPrice,
            shortCurrentPrice: s.currentPrice,
            longCurrentPrice: l.currentPrice
          });
          remaining -= q;
          l.qty -= q;
        }
      });
    });
    return out;
  };

  const puts = [];
  const calls = [];
  Object.values(grouped).forEach((legs) => {
    puts.push(...pairSide(legs, "P"));
    calls.push(...pairSide(legs, "C"));
  });

  // Merge a put spread + call spread (same ticker & expiry) into an iron condor.
  // Supports unbalanced condors (e.g. 2 put spreads per 1 call spread): the ratio
  // is derived from the quantities via GCD, and qty becomes the number of condor
  // "units". Per-unit entry/current prices are ratio-weighted sums of both sides.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const condors = [];
  puts.forEach((p) => {
    calls.forEach((c) => {
      if (p.qty > 0 && c.qty > 0 && c.ticker === p.ticker && c.expiry === p.expiry) {
        const units = gcd(p.qty, c.qty);
        const putRatio = p.qty / units;
        const callRatio = c.qty / units;
        condors.push({
          type: "iron_condor",
          ticker: p.ticker,
          expiry: p.expiry,
          expiryFormatted: p.expiryFormatted,
          entryDate: p.entryDate < c.entryDate ? p.entryDate : c.entryDate,
          shortSymbol: p.shortSymbol,
          longSymbol: p.longSymbol,
          callShortSymbol: c.shortSymbol,
          callLongSymbol: c.longSymbol,
          shortStrike: p.shortStrike,
          longStrike: p.longStrike,
          callShortStrike: c.shortStrike,
          callLongStrike: c.longStrike,
          qty: units,
          putRatio,
          callRatio,
          shortEntryPrice: putRatio * p.shortEntryPrice + callRatio * c.shortEntryPrice,
          longEntryPrice: putRatio * p.longEntryPrice + callRatio * c.longEntryPrice,
          shortCurrentPrice: putRatio * p.shortCurrentPrice + callRatio * c.shortCurrentPrice,
          longCurrentPrice: putRatio * p.longCurrentPrice + callRatio * c.longCurrentPrice
        });
        p.qty = 0;
        c.qty = 0;
      }
    });
  });

  return [...condors, ...puts.filter((s) => s.qty > 0), ...calls.filter((s) => s.qty > 0)];
}

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
  if (allSyms.some((sym) => !quotes[sym])) return null;
  const sum = (legs, field) => legs.reduce((a, [sym, r]) => a + r * (quotes[sym][field] || 0), 0);
  const shortBid = sum(shortLegs, "bp"), shortAsk = sum(shortLegs, "ap");
  const longBid = sum(longLegs, "bp"), longAsk = sum(longLegs, "ap");
  return {
    shortBid, shortAsk, longBid, longAsk,
    askDebit: shortAsk - longBid,
    bidDebit: shortBid - longAsk,
    midDebit: (shortBid + shortAsk - longBid - longAsk) / 2
  };
}

export async function loadAccount(base44, accountId) {
  const account = await base44.asServiceRole.entities.TradingAccount.get(accountId);
  if (!account) throw new Error("Trading account not found");
  return account;
}