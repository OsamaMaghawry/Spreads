// Option chain scanning + strategy selection, ported from the Python strategy:
// Black-Scholes delta from the live mid, delta-targeted short strike, adjacent/width
// long wing, credit from short bid - long ask, ratio-aware iron condors.
import { tradingBase, alpacaFetch, getOptionQuotes } from "./alpaca.ts";
import { getSpot, MAX_SOURCE_DIVERGENCE_PCT } from "./marketPrice.ts";

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

// The spot price used to be resolved here, preferring the midpoint of the
// latest bid/ask. That midpoint is an arithmetic artifact when the quote is
// stale or wide — nobody traded there — and it once produced a JPM scan built
// on $363.54 while the stock was at $354.33, which sold a short put that was
// already in the money. It now comes from _shared/marketPrice.ts, which the
// dashboard uses too, so the two can no longer disagree.
//
// The spot is what picks strikes, so an untrusted one is a refusal here rather
// than something to proceed on.
function spotOrReason(spot, ticker) {
  if (!(spot.price > 0)) return `No live price available for ${ticker}.`;
  if (!spot.trusted) return `Unreliable price for ${ticker}: ${spot.reason}`;
  return null;
}

// All expiries inside the requested DTE window, soonest first.
export async function findExpiries(account, ticker, dteMin, dteMax) {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().substring(0, 10);
  const url = `${tradingBase(account)}/options/contracts?underlying_symbols=${ticker}` +
    `&expiration_date_gte=${day(Math.max(dteMin, 0))}&expiration_date_lte=${day(dteMax)}&status=active&limit=1000`;
  const res = await alpacaFetch(url, account);
  const list = (res && res.option_contracts) || [];
  return [...new Set(list.map((c: any) => c.expiration_date))].sort();
}

// Nearest expiry within the requested DTE window.
export async function findExpiry(account, ticker, dte) {
  const dates = await findExpiries(account, ticker, 0, dte);
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

  const quotes = await getOptionQuotes(account, contracts.map((c: any) => c.symbol));

  const T = tteYears(expiry);
  const isCall = type === "call";
  return contracts
    .map((c: any) => {
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
    .sort((a: any, b: any) => a.strike - b.strike);
}

const nearestDelta = (opts, target) => opts.reduce((best, o) =>
  Math.abs(Math.abs(o.delta) - target) < Math.abs(Math.abs(best.delta) - target) ? o : best);

// Long wing: the strike exactly `width` away from the short, on the protective
// side.
//
// This used to fall back to whatever strike was nearest when the requested
// width wasn't listed, which silently produced a different spread than asked
// for: request $1 wings on a chain that only lists $2.50 strikes and you got a
// $2.50 spread, with ~2.5x the max risk. The requested width is a risk control,
// so a width that isn't available is a rejection, not something to approximate.
//
// The tolerance only absorbs floating-point drift in the strike arithmetic, not
// a genuinely different strike.
const WIDTH_EPSILON = 0.001;

function pickWing(opts, shortStrike, width, isCall) {
  const target = isCall ? shortStrike + width : shortStrike - width;
  return opts.find((o) => Math.abs(o.strike - target) < WIDTH_EPSILON) || null;
}

// Builds the setup for the requested strategy. Returns { ok, reason } on rejection.
export async function findSetup(account, params) {
  const {
    ticker, strategy, dte = 2, targetDelta = 0.18, wingWidth = 1,
    minCredit = 0.2, maxCredit = 4, putRatio = 1, callRatio = 1,
    sharesByTicker = {}, basisByTicker = {},
    // Whether the options market is trading right now. Decided by the caller,
    // which knows the clock; this module stays pure and testable.
    marketOpen = true
  } = params;

  const spot = await getSpot(account, ticker);
  const bad = spotOrReason(spot, ticker);
  if (bad) return { ok: false, reason: bad };

  const expiry = await findExpiry(account, ticker, dte);
  if (!expiry) return { ok: false, reason: `No expiry found for ${ticker} within ${dte} days.` };

  const needPuts = strategy === "put_spread" || strategy === "iron_condor" || strategy === "cash_secured_put";
  const needCalls = strategy === "call_spread" || strategy === "iron_condor" || strategy === "covered_call";
  const puts = needPuts ? await scanChain(account, ticker, expiry, "put", spot.price) : [];
  const calls = needCalls ? await scanChain(account, ticker, expiry, "call", spot.price) : [];
  if (needPuts && puts.length === 0) return { ok: false, reason: `No priced put chain for ${ticker} ${expiry}.` };
  if (needCalls && calls.length === 0) return { ok: false, reason: `No priced call chain for ${ticker} ${expiry}.` };

  const built = isSingleStrategy(strategy)
    ? buildSingle({ ticker, expiry, spot, strategy, puts, calls, targetDelta, basis: basisByTicker[ticker] || null, shares: sharesByTicker[ticker] || 0, marketOpen })
    : buildSetup({ ticker, expiry, spot, strategy, puts, calls, targetDelta, wingWidth, putRatio, callRatio, marketOpen });
  if (!built.ok) return built;
  return validate(built.setup, minCredit, maxCredit);
}

// A credit spread is sold out of the money. A short leg already through spot is
// not a position that expires worthless — it is one that starts at a loss, and
// it is precisely what a wrong spot price produces: the JPM 355 put looked
// $8.50 clear of the stock and was in fact in the money.
function itmShortReason(shortLeg, spot, isCall) {
  const through = isCall ? shortLeg.strike <= spot : shortLeg.strike >= spot;
  if (!through) return null;
  return `Short ${isCall ? "call" : "put"} $${shortLeg.strike} is already through the spot price ` +
    `$${spot.toFixed(2)} — that is not an out-of-the-money credit spread.`;
}

// Put-call parity is the only witness to the spot price that does not come from
// the stock feed: at a common strike, C − P = S − K·e^(−rT). Costs nothing when
// both chains are already in hand, which is the iron-condor case, and it is the
// check that catches a stock feed lying about itself — the options market had
// the JPM price right the whole time.
//
// Median rather than mean so one bad quote in the chain cannot move it.
export function impliedSpotFromParity(puts, calls, expiry, r = 0.04) {
  if (!puts?.length || !calls?.length) return null;
  const byStrike = new Map(puts.map((p: any) => [p.strike, p]));
  const T = tteYears(expiry);
  const est: number[] = [];
  calls.forEach((c: any) => {
    const p: any = byStrike.get(c.strike);
    if (p) est.push(c.mid - p.mid + c.strike * Math.exp(-r * T));
  });
  if (est.length === 0) return null;
  est.sort((a, b) => a - b);
  return est[Math.floor(est.length / 2)];
}

// Pure setup construction from already-priced chains, so a sweep can reuse one fetch.
export function buildSetup({ ticker, expiry, spot, strategy, puts, calls, targetDelta, wingWidth, putRatio = 1, callRatio = 1, allowItmShort = false, marketOpen = true }: any) {
  // Accepts either a bare number or the { price, source, asOf } result from
  // marketPrice.getSpot, so callers and tests need not unwrap it.
  const px = typeof spot === "number" ? spot : spot?.price;
  const base = {
    ticker, expiry, strategy, targetDelta, wingWidth,
    spot: px,
    spotSource: typeof spot === "number" ? null : spot?.source ?? null,
    spotAsOf: typeof spot === "number" ? null : spot?.asOf ?? null
  };

  const implied = impliedSpotFromParity(puts, calls, expiry);
  if (implied !== null && px > 0 && Math.abs(implied - px) / px > MAX_SOURCE_DIVERGENCE_PCT) {
    return {
      ok: false,
      reason: marketOpen
        ? `Chain implies $${implied.toFixed(2)}, stock says $${px.toFixed(2)} — sources disagree.`
        // Outside 09:30–16:00 ET there is no options session, so the chain is
        // still quoted at yesterday's close while the stock has moved since.
        // Saying the sources "disagree" reads as a data fault; they are simply
        // describing different moments.
        : `Options closed until 09:30 ET — chain is at yesterday's close.`
    };
  }

  if (strategy === "iron_condor") {
    const shortPut: any = nearestDelta(puts, targetDelta);
    const shortCall: any = nearestDelta(calls, targetDelta);
    if (!allowItmShort) {
      const bad = itmShortReason(shortPut, px, false) || itmShortReason(shortCall, px, true);
      if (bad) return { ok: false, reason: bad };
    }
    const longPut: any = pickWing(puts, shortPut.strike, wingWidth, false);
    const longCall: any = pickWing(calls, shortCall.strike, wingWidth, true);
    if (!longPut || !longCall) {
      return { ok: false, reason: `No listed strike $${wingWidth} from both short legs — this chain can't make a $${wingWidth} wing.` };
    }
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
        { role: "short_put", ...shortPut, ratio: putRatio, side: "sell" },
        { role: "long_put", ...longPut, ratio: putRatio, side: "buy" },
        { role: "short_call", ...shortCall, ratio: callRatio, side: "sell" },
        { role: "long_call", ...longCall, ratio: callRatio, side: "buy" }
      ]
    };
    return { ok: true, setup };
  }

  const isCall = strategy === "call_spread";
  const chain = isCall ? calls : puts;
  const short: any = nearestDelta(chain, targetDelta);
  if (!allowItmShort) {
    const bad = itmShortReason(short, px, isCall);
    if (bad) return { ok: false, reason: bad };
  }
  const long: any = pickWing(chain, short.strike, wingWidth, isCall);
  if (!long) {
    return { ok: false, reason: `No listed strike $${wingWidth} from the short leg — this chain can't make a $${wingWidth} wing.` };
  }
  const credit = short.bid - long.ask;
  const width = Math.abs(long.strike - short.strike);
  const setup = {
    ...base, putRatio: 1, callRatio: 1, credit, width,
    maxRisk: (width - credit) * 100,
    breakEvenLow: isCall ? null : short.strike - credit,
    breakEvenHigh: isCall ? short.strike + credit : null,
    legs: [
      { role: isCall ? "short_call" : "short_put", ...short, ratio: 1, side: "sell" },
      { role: isCall ? "long_call" : "long_put", ...long, ratio: 1, side: "buy" }
    ]
  };
  return { ok: true, setup };
}

// ---------- single-leg setups: the wheel's two halves ----------
//
// A cash-secured put and a covered call are one short leg each. Their risk
// is not (width - credit): a put risks the strike less the credit with the
// stock at zero, and a call over held shares risks the shares' basis less the
// credit -- the same per-position definitions positionKinds.ts uses on the
// dashboard, so a candidate and the position it becomes read the same.
//
// returnOnRisk is credit / maxRisk for these too, so the ranking, the sort
// keys and the RoR column keep one meaning across every strategy.
export const SINGLE_STRATEGIES = ["cash_secured_put", "covered_call"];
export const isSingleStrategy = (s) => SINGLE_STRATEGIES.includes(s);

export function buildSingle({ ticker, expiry, spot, strategy, puts, calls, targetDelta, allowItmShort = false, basis = null, shares = 0, marketOpen = true }: any) {
  const px = typeof spot === "number" ? spot : spot?.price;
  const base = {
    ticker, expiry, strategy, targetDelta, wingWidth: null,
    spot: px,
    spotSource: typeof spot === "number" ? null : spot?.source ?? null,
    spotAsOf: typeof spot === "number" ? null : spot?.asOf ?? null
  };
  const implied = impliedSpotFromParity(puts, calls, expiry);
  if (implied !== null && px > 0 && Math.abs(implied - px) / px > MAX_SOURCE_DIVERGENCE_PCT) {
    return {
      ok: false,
      reason: marketOpen
        ? `Chain implies $${implied.toFixed(2)}, stock says $${px.toFixed(2)} — sources disagree.`
        // Outside 09:30–16:00 ET there is no options session, so the chain is
        // still quoted at yesterday's close while the stock has moved since.
        // Saying the sources "disagree" reads as a data fault; they are simply
        // describing different moments.
        : `Options closed until 09:30 ET — chain is at yesterday's close.`
    };
  }

  if (strategy === "cash_secured_put") {
    if (!puts?.length) return { ok: false, reason: "No priced put chain." };
    const short: any = nearestDelta(puts, targetDelta);
    if (!allowItmShort) {
      const bad = itmShortReason(short, px, false);
      if (bad) return { ok: false, reason: bad };
    }
    const credit = short.bid;
    const collateral = short.strike * 100;
    const maxRisk = (short.strike - credit) * 100;
    return {
      ok: true,
      setup: {
        ...base, putRatio: 1, callRatio: 1, credit, width: null,
        collateral, maxRisk,
        breakEvenLow: short.strike - credit,
        breakEvenHigh: null,
        returnOnCollateral: credit / short.strike,
        otmPct: px > 0 ? (px - short.strike) / px : null,
        legs: [{ role: "short_put", ...short, ratio: 1, side: "sell" }]
      }
    };
  }

  if (strategy === "covered_call") {
    if (!calls?.length) return { ok: false, reason: "No priced call chain." };
    const held = Number(shares) || 0;
    if (held < 100) return { ok: false, reason: `Holds ${held} shares of ${ticker} — a covered call needs 100 per contract.` };
    // The shares' basis, never the spot: what the position risks is what was
    // paid for it, and a call written on that basis is what the wheel measures.
    const b = basis && Number(basis.basis) > 0 ? Number(basis.basis) : null;
    if (b === null) return { ok: false, reason: `No cost basis on record for ${ticker} shares — sync the account first.` };
    const short: any = nearestDelta(calls, targetDelta);
    if (!allowItmShort) {
      const bad = itmShortReason(short, px, true);
      if (bad) return { ok: false, reason: bad };
    }
    const credit = short.bid;
    const maxRisk = (b - credit) * 100;
    return {
      ok: true,
      setup: {
        ...base, putRatio: 1, callRatio: 1, credit, width: null,
        collateral: b * 100, maxRisk,
        breakEvenLow: b - credit,
        breakEvenHigh: null,
        returnOnCollateral: credit / b,
        otmPct: px > 0 ? (short.strike - px) / px : null,
        basis: b, basisSource: basis.source || "broker", brokerBasis: basis.brokerBasis ?? null,
        ifCalled: (short.strike - b + credit) * 100,
        sharesHeld: held, maxContracts: Math.floor(held / 100),
        legs: [{ role: "short_call", ...short, ratio: 1, side: "sell" }]
      }
    };
  }

  return { ok: false, reason: `Unsupported single-leg strategy ${strategy}.` };
}

// Granularity of the sweep inside each requested range. This is an engine
// detail, not a trading parameter: the caller says "deltas 0.12 to 0.22" and
// this decides how finely to sample that range.
//
// Both are deliberately fine. Sampling costs no extra broker calls — the option
// chains are fetched once per expiry and every combination is built from them
// in memory — so the only reason to sample coarsely would be to hide setups.
// The width figure matters especially: strikes are commonly listed $2.50 apart,
// and a $1 sweep step over a $1–$3 range would only ever try $1, $2 and $3,
// never $2.50, so those chains could produce nothing at all now that the
// requested width is enforced exactly.
const DELTA_SWEEP_STEP = 0.01;
const WIDTH_SWEEP_STEP = 0.5;

const steps = (min, max, step) => {
  const out = [];
  const s = step > 0 ? step : Math.max(max - min, 1e-9);
  for (let v = min; v <= max + 1e-9; v += s) out.push(Math.round(v * 10000) / 10000);
  return out.length ? out : [min];
};

// Sweeps tickers × expiries × deltas × widths and ranks every valid setup by
// return on risk (credit / max risk), the way the automated strategy picks entries.
export async function scanCandidates(account, params) {
  const {
    tickers = [], strategy, dteMin = 0, dteMax = 3,
    deltaMin = 0.12, deltaMax = 0.22, deltaStep = DELTA_SWEEP_STEP,
    widthMin = 1, widthMax = 3, widthStep = WIDTH_SWEEP_STEP,
    minCredit = 0, maxCredit = 1000, putRatio = 1, callRatio = 1, maxRisk = null,
    // For the wheel's halves: shares held and their basis per ticker, looked
    // up by the caller from the account. Absent for spreads.
    sharesByTicker = {}, basisByTicker = {},
    // Whether the options market is trading right now. Decided by the caller,
    // which knows the clock; this module stays pure and testable.
    marketOpen = true
  } = params;

  const single = isSingleStrategy(strategy);
  const deltas = steps(deltaMin, deltaMax, deltaStep);
  // A single leg has no wing: one pass, not a width sweep.
  const widths = single ? [0] : steps(widthMin, widthMax, widthStep);
  const needPuts = strategy === "put_spread" || strategy === "iron_condor" || strategy === "cash_secured_put";
  const needCalls = strategy === "call_spread" || strategy === "iron_condor" || strategy === "covered_call";

  const candidates = [];
  const skipped = [];

  for (const raw of tickers) {
    const ticker = String(raw).trim().toUpperCase();
    if (!ticker) continue;
    try {
      const spot = await getSpot(account, ticker);
      const bad = spotOrReason(spot, ticker);
      if (bad) { skipped.push({ ticker, reason: bad }); continue; }
      const expiries = await findExpiries(account, ticker, dteMin, dteMax);
      if (expiries.length === 0) { skipped.push({ ticker, reason: `No expiry between ${dteMin} and ${dteMax} days.` }); continue; }

      // Why every combination for this ticker was rejected, so a ticker that
      // yields nothing explains itself instead of just vanishing from the
      // results. Distinct reasons only — one per cause, not one per attempt.
      const reasons = new Set<string>();
      const foundBefore = candidates.length;

      for (const expiry of expiries) {
        const puts = needPuts ? await scanChain(account, ticker, expiry, "put", spot.price) : [];
        const calls = needCalls ? await scanChain(account, ticker, expiry, "call", spot.price) : [];
        if ((needPuts && puts.length === 0) || (needCalls && calls.length === 0)) {
          reasons.add(`No priced chain for ${expiry}.`);
          continue;
        }
        const seen = new Set();
        for (const targetDelta of deltas) {
          for (const wingWidth of widths) {
            const built = single
              ? buildSingle({ ticker, expiry, spot, strategy, puts, calls, targetDelta,
                  basis: basisByTicker[ticker] || null, shares: sharesByTicker[ticker] || 0, marketOpen })
              : buildSetup({ ticker, expiry, spot, strategy, puts, calls, targetDelta, wingWidth, putRatio, callRatio, marketOpen });
            if (!built.ok) { reasons.add(built.reason); continue; }
            const s = built.setup;
            const key = s.legs.map((l) => l.symbol).join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            const checked = validate(s, minCredit, maxCredit);
            if (!checked.ok) { reasons.add(checked.reason); continue; }
            // What the chain actually offered, against what was asked for.
            const offBand = outsideBand(s, deltaMin, deltaMax);
            if (offBand) { reasons.add(offBand); continue; }
            // For a single leg the cap is on collateral -- the cash a put ties
            // up, the shares' cost a call sits on -- which is what the screen
            // labels it. For a spread it stays the maximum loss.
            const capped = single ? s.collateral : s.maxRisk;
            if (maxRisk && capped > maxRisk) {
              reasons.add(single
                ? `Collateral $${capped.toFixed(0)} exceeds the $${maxRisk} limit.`
                : `Max risk $${capped.toFixed(0)} exceeds the $${maxRisk} limit.`);
              continue;
            }
            candidates.push({ ...s, returnOnRisk: (s.credit * 100) / s.maxRisk });
          }
        }
      }

      if (candidates.length === foundBefore && reasons.size > 0) {
        skipped.push({ ticker, reason: [...reasons].join(" ") });
      }
    } catch (e) {
      skipped.push({ ticker, reason: e.message });
    }
  }

  candidates.sort((a: any, b: any) => b.returnOnRisk - a.returnOnRisk);
  return { ok: candidates.length > 0, candidates: candidates.slice(0, 25), skipped };
}

// The short leg's delta against the band the user asked for.
//
// deltaMin/deltaMax used to seed the sweep's targets and nothing more:
// nearestDelta returns the closest contract on the chain however far off it
// is, so a scan for 0.12-0.22 could hand back a 0.24 short put. The filter is
// labelled "Short delta MIN / MAX" and a trader reads that as a bound on the
// position's risk, not as a hint -- so it is enforced here.
//
// The tolerance is half of what the screens display: a contract that READS as
// 0.22 is never refused for a digit nobody can see.
const DELTA_BAND_TOLERANCE = 0.005;

export function outsideBand(setup, deltaMin, deltaMax) {
  const shorts = (setup.legs || []).filter((l: any) => l.side === "sell");
  for (const l of shorts) {
    // Number(null) is 0, which is finite and would fail the band -- so a leg
    // whose delta never arrived is left alone rather than refused as a
    // zero-delta short.
    if (l.delta === null || l.delta === undefined || l.delta === "") continue;
    const d = Math.abs(Number(l.delta));
    if (!Number.isFinite(d)) continue;
    if (d < deltaMin - DELTA_BAND_TOLERANCE || d > deltaMax + DELTA_BAND_TOLERANCE) {
      const kind = String(l.role || "").endsWith("_call") ? "call" : "put";
      return `Nearest short ${kind} to your ${deltaMin}-${deltaMax} delta band is ${d.toFixed(2)} — no strike in the band on this chain.`;
    }
  }
  return null;
}

function validate(setup, minCredit, maxCredit) {
  if (setup.credit < minCredit) {
    return { ok: false, reason: `Credit $${setup.credit.toFixed(2)} is below the $${minCredit} minimum.`, setup };
  }
  if (setup.credit > maxCredit) {
    return { ok: false, reason: `Credit $${setup.credit.toFixed(2)} is above the $${maxCredit} maximum.`, setup };
  }
  if (setup.maxRisk <= 0) {
    return { ok: false, reason: setup.width === null ? "Credit exceeds the strike — quote looks stale." : "Credit exceeds the spread width — quote looks stale.", setup };
  }
  return { ok: true, setup };
}
