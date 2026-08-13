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

export async function alpacaFetch(url, account, options = {}, retries = 2) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    let res;
    try {
      res = await fetch(url, { ...options, headers: { ...authHeaders(account), ...(options.headers || {}) } });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    lastErr = new Error(`Alpaca ${res.status}: ${text}`);
    if (res.status < 500) throw lastErr;
    await new Promise((r) => setTimeout(r, 600));
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

// Pair short puts with long puts (lower strike, same expiry) into put credit spreads.
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
    if (!parsed || parsed.type !== "P") return;
    const qty = parseInt(p.qty);
    if (!legsBySymbol[p.symbol]) {
      legsBySymbol[p.symbol] = {
        symbol: p.symbol,
        ticker: parsed.ticker,
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

  const spreads = [];
  Object.keys(grouped).forEach((ticker) => {
    const legs = grouped[ticker];
    const shorts = legs.filter((l) => l.qty < 0);
    const longs = legs.filter((l) => l.qty > 0);
    shorts.forEach((s) => {
      let remaining = Math.abs(s.qty);
      longs.forEach((l) => {
        if (remaining > 0 && l.strike < s.strike && l.expiry === s.expiry && l.qty > 0) {
          const q = Math.min(remaining, l.qty);
          spreads.push({
            ticker,
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
  });
  return spreads;
}

// Latest option quotes for both legs -> spread debit (cost to close).
export async function getSpreadQuote(account, shortSymbol, longSymbol) {
  const url = `https://data.alpaca.markets/v1beta1/options/quotes/latest?symbols=${shortSymbol},${longSymbol}`;
  const data = await alpacaFetch(url, account);
  const s = data && data.quotes ? data.quotes[shortSymbol] : null;
  const l = data && data.quotes ? data.quotes[longSymbol] : null;
  if (!s || !l) return null;
  const shortBid = s.bp || 0, shortAsk = s.ap || 0, longBid = l.bp || 0, longAsk = l.ap || 0;
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