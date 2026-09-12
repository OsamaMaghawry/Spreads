// Black-Scholes, on the client, so a position can be valued on a date that is
// not its expiry.
//
// WHY THIS EXISTS. `tickerBook.positionPLAt` prices every leg at intrinsic
// value, which is exactly right at expiry and useless before it. That is fine
// for a vertical, whose legs all expire together, and wrong for a calendar or
// a diagonal, whose whole point is that one leg outlives the other. Pricing
// both at intrinsic draws a moment that never arrives.
//
// The honest picture of a two-expiry position is its value ON THE NEAR EXPIRY
// DATE: the near leg settles at intrinsic, and the far leg is still alive and
// worth whatever the market would pay for its remaining time. That second half
// needs an option pricing model, and this is it.
//
// THE SAME MODEL THE SCANNER ALREADY USES. This is a direct port of
// `supabase/functions/_shared/optionScan.ts` — the same `erf` approximation,
// the same bisection for implied volatility, the same 0.25 fallback — because
// the delta printed on a chain row and the curve drawn under it must come from
// one model. `blackScholes.test.js` checks the two agree on fixed inputs, so a
// change to either that breaks the pair fails the suite.
//
// It is a MODEL, not a quote. Where the curve touches expiry it is arithmetic;
// everywhere else it is an estimate that assumes constant volatility, no
// dividends, and European exercise on contracts that are American. The screen
// says so once, where the curve is.

// Abramowitz-Stegun 7.1.26.
const erf = (x) => {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
};

const cdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

export const RISK_FREE = 0.04;

// Years from `from` to 16:00 ET (~20:00 UTC) on the expiry date. Never
// negative and never exactly zero, because the formula divides by sqrt(T).
export function tteYears(expiry, from = Date.now()) {
  if (!expiry) return 0;
  const at = new Date(`${expiry}T20:00:00Z`).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max((at - from) / (365.25 * 24 * 3600 * 1000), 0);
}

export function bsPrice(S, K, T, r, sigma, isCall) {
  // At or past expiry there is no time value left, only intrinsic. Returning
  // it here rather than letting the caller branch is what lets ONE function
  // price a whole multi-expiry position at any date.
  if (!(T > 0) || !(sigma > 0)) {
    return isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  if (!(S > 0) || !(K > 0)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return isCall
    ? S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2)
    : K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
}

// Bisection, and 0.25 when the price is outside anything the model can reach —
// the same fallback the scanner uses, so neither invents a wild volatility from
// a stale or crossed quote.
export function impliedVol(price, S, K, T, r, isCall) {
  if (!(T > 0) || !(S > 0) || !(K > 0) || !(price > 0)) return 0.25;
  let lo = 0.001;
  let hi = 5.0;
  const f = (sig) => bsPrice(S, K, T, r, sig, isCall) - price;
  if (f(lo) * f(hi) > 0) return 0.25;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
