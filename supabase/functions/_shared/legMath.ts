// What a set of legs is worth, and what it can lose — for ANY set of legs.
//
// This file exists because the app used to answer those questions from a list
// of structure names. Sixty-four decisions across nineteen files branched on
// `type === "call_spread"` or `type === "iron_condor"`, each with its own
// arithmetic, and a shape nobody had enumerated fell through all of them. On
// 8 Sep that cost a live account twice in one day: two legs of a hand-placed
// repair vanished from the dashboard in the morning, and in the evening the
// close ticket quoted and would have ORDERED a 1x2 as a 1x1, reported it
// filled, and left a naked short call behind.
//
// The fix is not another name in the list. It is to stop asking for the name.
//
// THE FACT THAT MAKES THIS EXACT, not approximate:
//
//   An option position's value at expiry is PIECEWISE LINEAR in the underlying
//   price, and its only kinks are at strikes.
//
// A linear piece attains its minimum at an endpoint, so the minimum of the
// whole payoff is attained at price 0, at one of the strikes, or nowhere —
// the last case being the ray above the highest strike, which runs to
// infinity and is unbounded exactly when its slope is negative. Evaluating
// {0, every strike} and checking one slope therefore gives the true maximum
// loss of any structure that can be built out of calls, puts and stock, with
// no sampling error and no shape to recognise.
//
// Everything here is at EXPIRY and intrinsic. That is what a maximum loss is;
// a mark-to-market figure is a different question answered elsewhere.

export const CONTRACT = 100;

// One leg, normalised. `qty` is SIGNED — negative is short — which is what
// removes every long/short branch below.
//
//   type "C" | "P"  an option; qty is contracts, multiplier 100
//   type "S"        stock;     qty is shares,    multiplier 1
//
// `entryPrice` is per share in every case, and always positive: the sign of
// the position lives in qty and nowhere else. A leg whose deliverable is not
// standard (an adjusted contract after a split or a merger) is marked and
// makes every figure below withhold rather than guess.
export type Leg = {
  symbol?: string;
  type: "C" | "P" | "S";
  qty: number;
  strike?: number | null;
  entryPrice?: number | null;
  expiry?: string | null;
  adjusted?: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const itv = (n: number) => Math.max(n, 0);
const mult = (l: Leg) => (l.type === "S" ? 1 : CONTRACT);

// Any leg we cannot price makes the whole structure unpriceable. There is no
// partial answer to "what can this lose".
export const priceable = (legs: Leg[]) =>
  Array.isArray(legs) &&
  legs.length > 0 &&
  legs.every((l) => l && !l.adjusted && Number.isFinite(l.qty) && (l.type === "S" || Number.isFinite(Number(l.strike))));

// What ONE leg is worth at expiry with the underlying at `price`, net of what
// it cost or took in. Signed: negative is a loss.
export function legPLAt(leg: Leg, price: number): number {
  const qty = Number(leg.qty) || 0;
  const entry = Math.abs(Number(leg.entryPrice) || 0);
  const strike = Number(leg.strike) || 0;
  const intrinsic =
    leg.type === "S" ? price : leg.type === "C" ? itv(price - strike) : itv(strike - price);
  // A long leg (qty > 0) paid `entry` and collects the intrinsic; a short leg
  // (qty < 0) took in `entry` and pays it out. One expression, both.
  return (intrinsic - entry) * qty * mult(leg);
}

export function payoffAt(legs: Leg[], price: number): number | null {
  if (!priceable(legs) || !(price >= 0)) return null;
  return round2(legs.reduce((sum, l) => sum + legPLAt(l, price), 0));
}

// The only prices where the payoff can bend: zero, and every strike. Sorted,
// de-duplicated, and always including 0 so the downside endpoint is evaluated.
export function kinks(legs: Leg[]): number[] {
  const set = new Set<number>([0]);
  for (const l of legs || []) {
    const k = Number(l?.strike);
    if (l?.type !== "S" && Number.isFinite(k) && k > 0) set.add(k);
  }
  return [...set].sort((a, b) => a - b);
}

// How the payoff changes per $1 of underlying ABOVE the highest strike, where
// every call is in the money and every put is worthless. This one number
// decides whether the loss has a bound at all.
export function slopeAbove(legs: Leg[]): number {
  return (legs || []).reduce((s, l) => {
    if (l.type === "P") return s;
    return s + (Number(l.qty) || 0) * mult(l);
  }, 0);
}

// Maximum loss, exactly.
//
//   { loss, at, unbounded }
//
// `loss` is a POSITIVE number of dollars, or null when there is no bound.
// `at` is the price where it occurs. `unbounded` says which direction ran
// away. A structure that cannot lose at any price returns loss 0.
export function maxLoss(legs: Leg[]) {
  if (!priceable(legs)) return { loss: null, at: null, unbounded: null, reason: "unpriceable" as const };
  // Above the highest strike the payoff is a ray. Falling means no bound.
  if (slopeAbove(legs) < 0) {
    return { loss: null, at: null, unbounded: "up" as const, reason: null };
  }
  let worst = Infinity;
  let at = 0;
  for (const k of kinks(legs)) {
    const pl = payoffAt(legs, k) as number;
    if (pl < worst) { worst = pl; at = k; }
  }
  // The downside is always bounded: at price 0 every call is worthless, every
  // put pays its strike and stock is worth nothing. There is nothing below.
  return { loss: worst >= 0 ? 0 : round2(-worst), at, unbounded: null, reason: null };
}

// Maximum profit, on the same terms and for the same reason.
export function maxProfit(legs: Leg[]) {
  if (!priceable(legs)) return { profit: null, at: null, unbounded: null };
  if (slopeAbove(legs) > 0) return { profit: null, at: null, unbounded: "up" as const };
  let best = -Infinity;
  let at = 0;
  for (const k of kinks(legs)) {
    const pl = payoffAt(legs, k) as number;
    if (pl > best) { best = pl; at = k; }
  }
  return { profit: best <= 0 ? 0 : round2(best), at, unbounded: null };
}

// Every price where the payoff crosses zero.
//
// Exact for the same reason the extremes are: between two adjacent kinks the
// payoff is a straight line, so a sign change there has one root and linear
// interpolation finds it precisely. Beyond the highest strike the final ray
// is followed to its own root when it has one.
export function breakEvens(legs: Leg[]): number[] {
  if (!priceable(legs)) return [];
  const ks = kinks(legs);
  const out: number[] = [];
  const push = (p: number) => {
    const r = round2(p);
    if (r >= 0 && !out.some((v) => Math.abs(v - r) < 0.005)) out.push(r);
  };

  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const b = ks[i];
    const pa = payoffAt(legs, a) as number;
    const pb = payoffAt(legs, b) as number;
    if (pa === 0) push(a);
    if (pb === 0) push(b);
    if ((pa < 0 && pb > 0) || (pa > 0 && pb < 0)) push(a + ((0 - pa) / (pb - pa)) * (b - a));
  }

  // The ray above the last kink.
  const last = ks[ks.length - 1];
  const pl = payoffAt(legs, last) as number;
  const slope = slopeAbove(legs);
  if (pl === 0) push(last);
  else if (slope !== 0) {
    const root = last + -pl / slope;
    if (root > last) push(root);
  }
  return out.sort((a, b) => a - b);
}

// The net premium: positive is a credit taken in, negative a debit paid. The
// payoff at price 0 is not this — puts pay there — so it is computed from the
// legs directly.
export function netPremium(legs: Leg[]): number | null {
  if (!Array.isArray(legs) || !legs.length) return null;
  return round2(
    legs.reduce((s, l) => {
      if (l.type === "S") return s; // stock is not premium
      return s - (Number(l.qty) || 0) * Math.abs(Number(l.entryPrice) || 0) * CONTRACT;
    }, 0)
  );
}

// Collateral-free summary of a structure, for the places that want all of it.
export function structureRisk(legs: Leg[]) {
  const loss = maxLoss(legs);
  const profit = maxProfit(legs);
  return {
    maxLoss: loss.loss,
    maxLossAt: loss.at,
    lossUnbounded: loss.unbounded,
    unpriceable: loss.reason === "unpriceable",
    maxProfit: profit.profit,
    profitUnbounded: profit.unbounded,
    breakEvens: breakEvens(legs),
    netPremium: netPremium(legs),
    slopeAbove: priceable(legs) ? slopeAbove(legs) : null
  };
}
