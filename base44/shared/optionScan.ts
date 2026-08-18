// Option chain scanning + strategy selection, ported from the Python strategy:
// Black-Scholes delta from the live mid, delta-targeted short strike, adjacent/width
// long wing, credit from short bid - long ask, ratio-aware iron condors.
import { tradingBase, alpacaFetch } from './alpaca.ts';

const erf = (x) => {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
};
const cdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

// Time to expiry in years, using 16:00 ET (~20:00 UTC) on the expiration date.
export function tteYears(expiry) {
  const expiryMs = new Date(`${expiry}T20:00:00Z`).getTime();
  return Math.max((expiryMs - Date.now()) / (365.25 * 24 * 3600 * 1000), 1e-8);
}

function bsPrice(S, K, T, r, sigma, isCall) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return isCall
    ? S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2)
    : K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
}

// Bisection solve for implied vol; falls back to 0.25 like the reference strategy.
export function impliedVol(price, S, K, T, r, isCall) {
  if (!(T > 0) || !(S > 0) || !(K > 0) || !(price > 0)) return 0.25;
  let lo = 0.001, hi = 5.0;
  const f = (sig) => bsPrice(S, K, T, r, sig, isCall) - price;
  if (f(lo) * f(hi) > 0) return 0.25;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function optionDelta(price, S, K, T, r, isCall) {
  if (T <= 0) return isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const iv = impliedVol(price, S, K, T, r, isCall);
  const d1 = (Math.log(S / K) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  return isCall ? cdf(d1) : -cdf(-d1);
}

export async function getSpot(account, ticker) {
  const snap = await alpacaFetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${ticker}`, account);
  const d = snap ? snap[ticker] : null;
  const q = d && d.latestQuote;
  if (q && q.bp > 0 && q.ap > 0) return (q.bp + q.ap) / 2;
  return (d && d.latestTrade && d.latestTrade.p) || (d && d.dailyBar && d.dailyBar.c) || 0;
}

// Nearest expiry within the requested DTE window.
export async function findExpiry(account, ticker, dte) {
  const today = new Date().toISOString().substring(0, 10);
  const max = new Date(Date.now() + dte * 86400000).toISOString().substring(0, 10);
  const url = `${tradingBase(account)}/options/contracts?underlying_symbols=${ticker}` +
    `&expiration_date_gte=${today}&expiration_date_lte=${max}&status=active&limit=1000`;
  const res = await alpacaFetch(url, account);
  const list = (res && res.option_contracts) || [];
  const dates = [...new Set(list.map((c) => c.expiration_date))].sort();
  return dates[0] || null;
}

// Priced option chain for one side, with delta computed from the mid.
export async function scanChain(account, ticker, expiry, type, spot) {
  const lo = (spot * 0.8).toFixed(2);
  const hi = (spot * 1.2).toFixed(2);
  const url = `${tradingBase(account)}/options/contracts?underlying_symbols=${ticker}` +
    `&expiration_date=${expiry}&type=${type}&status=active&limit=1000` +
    `&strike_price_gte=${lo}&strike_price_lte=${hi}`;
  const res = await alpacaFetch(url, account);
  const contracts = (res && res.option_contracts) || [];
  if (contracts.length === 0) return [];

  const quotes = {};
  for (let i = 0; i < contracts.length; i += 100) {
    const syms = contracts.slice(i, i + 100).map((c) => c.symbol).join(',');
    const data = await alpacaFetch(`https://data.alpaca.markets/v1beta1/options/quotes/latest?symbols=${syms}`, account);
    Object.assign(quotes, (data && data.quotes) || {});
  }

  const T = tteYears(expiry);
  const isCall = type === 'call';
  return contracts
    .map((c) => {
      const q = quotes[c.symbol];
      if (!q || !(q.bp > 0) || !(q.ap > 0)) return null;
      const mid = (q.bp + q.ap) / 2;
      const strike = parseFloat(c.strike_price);
      return {
        symbol: c.symbol,
        strike,
        bid: q.bp,
        ask: q.ap,
        mid,
        delta: optionDelta(mid, spot, strike, T, 0.04, isCall)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.strike - b.strike);
}

const nearestDelta = (opts, target) => opts.reduce((best, o) =>
  Math.abs(Math.abs(o.delta) - target) < Math.abs(Math.abs(best.delta) - target) ? o : best);

// Long wing: strike closest to the requested width away from the short, on the
// protective side. Falls back to the adjacent strike when the width isn't listed.
function pickWing(opts, shortStrike, width, isCall) {
  const side = opts.filter((o) => (isCall ? o.strike > shortStrike : o.strike < shortStrike));
  if (side.length === 0) return null;
  const target = isCall ? shortStrike + width : shortStrike - width;
  return side.reduce((best, o) => (Math.abs(o.strike - target) < Math.abs(best.strike - target) ? o : best));
}

// Builds the setup for the requested strategy. Returns { ok, reason } on rejection.
export async function findSetup(account, params) {
  const {
    ticker, strategy, dte = 2, targetDelta = 0.18, wingWidth = 1,
    minCredit = 0.2, maxCredit = 4, putRatio = 1, callRatio = 1
  } = params;

  const spot = await getSpot(account, ticker);
  if (!(spot > 0)) return { ok: false, reason: `No live price available for ${ticker}.` };

  const expiry = await findExpiry(account, ticker, dte);
  if (!expiry) return { ok: false, reason: `No expiry found for ${ticker} within ${dte} days.` };

  const needPuts = strategy === 'put_spread' || strategy === 'iron_condor';
  const needCalls = strategy === 'call_spread' || strategy === 'iron_condor';
  const puts = needPuts ? await scanChain(account, ticker, expiry, 'put', spot) : [];
  const calls = needCalls ? await scanChain(account, ticker, expiry, 'call', spot) : [];
  if (needPuts && puts.length === 0) return { ok: false, reason: `No priced put chain for ${ticker} ${expiry}.` };
  if (needCalls && calls.length === 0) return { ok: false, reason: `No priced call chain for ${ticker} ${expiry}.` };

  const base = { ticker, expiry, spot, strategy };

  if (strategy === 'iron_condor') {
    const shortPut = nearestDelta(puts, targetDelta);
    const shortCall = nearestDelta(calls, targetDelta);
    const longPut = pickWing(puts, shortPut.strike, wingWidth, false);
    const longCall = pickWing(calls, shortCall.strike, wingWidth, true);
    if (!longPut || !longCall) return { ok: false, reason: 'No protective wings available on both sides.' };
    const credit = (shortPut.bid - longPut.ask) * putRatio + (shortCall.bid - longCall.ask) * callRatio;
    const putWidth = (shortPut.strike - longPut.strike) * putRatio;
    const callWidth = (longCall.strike - shortCall.strike) * callRatio;
    const width = Math.max(putWidth, callWidth);
    const setup = {
      ...base, putRatio, callRatio, credit, width,
      maxRisk: (width - credit) * 100,
      breakEvenLow: shortPut.strike - credit / putRatio,
      breakEvenHigh: shortCall.strike + credit / callRatio,
      legs: [
        { role: 'short_put', ...shortPut, ratio: putRatio, side: 'sell' },
        { role: 'long_put', ...longPut, ratio: putRatio, side: 'buy' },
        { role: 'short_call', ...shortCall, ratio: callRatio, side: 'sell' },
        { role: 'long_call', ...longCall, ratio: callRatio, side: 'buy' }
      ]
    };
    return validate(setup, minCredit, maxCredit);
  }

  const isCall = strategy === 'call_spread';
  const chain = isCall ? calls : puts;
  const short = nearestDelta(chain, targetDelta);
  const long = pickWing(chain, short.strike, wingWidth, isCall);
  if (!long) return { ok: false, reason: 'No protective long strike available.' };
  const credit = short.bid - long.ask;
  const width = Math.abs(long.strike - short.strike);
  const setup = {
    ...base, putRatio: 1, callRatio: 1, credit, width,
    maxRisk: (width - credit) * 100,
    breakEvenLow: isCall ? null : short.strike - credit,
    breakEvenHigh: isCall ? short.strike + credit : null,
    legs: [
      { role: isCall ? 'short_call' : 'short_put', ...short, ratio: 1, side: 'sell' },
      { role: isCall ? 'long_call' : 'long_put', ...long, ratio: 1, side: 'buy' }
    ]
  };
  return validate(setup, minCredit, maxCredit);
}

function validate(setup, minCredit, maxCredit) {
  if (setup.credit < minCredit) {
    return { ok: false, reason: `Credit $${setup.credit.toFixed(2)} is below the $${minCredit} minimum.`, setup };
  }
  if (setup.credit > maxCredit) {
    return { ok: false, reason: `Credit $${setup.credit.toFixed(2)} is above the $${maxCredit} maximum.`, setup };
  }
  if (setup.maxRisk <= 0) {
    return { ok: false, reason: 'Credit exceeds the spread width — quote looks stale.', setup };
  }
  return { ok: true, setup };
}