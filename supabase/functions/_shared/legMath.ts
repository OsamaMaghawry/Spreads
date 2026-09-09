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
  // The underlying this leg is on. Checked, because a structure spanning two
  // names is not a structure: [AAPL 180P short, TSLA 340P long] came back as a
  // "Bull put spread 180/340" with a $300 max loss and a $337 break-even.
  underlying?: string | null;
  type: "C" | "P" | "S";
  qty: number;
  strike?: number | null;
  entryPrice?: number | null;
  // Required on an option. Everything here is valued at ONE expiry, so a book
  // carrying two of them is refused rather than flattened -- a reverse
  // calendar flattened that way reported $0 max loss on a position that is a
  // naked short call the day the near leg dies.
  expiry?: string | null;
  // Shares per contract. 100 unless the leg says otherwise; an adjusted
  // contract says nothing and is refused.
  multiplier?: number | null;
  adjusted?: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const itv = (n: number) => Math.max(n, 0);

// Shares per contract for one leg. Stock is one; an option is 100 unless it
// states another, and a leg that states a nonsense one never reaches here.
export const mult = (l: Leg) =>
  l.type === "S" ? 1 : Number.isFinite(Number(l.multiplier)) ? Number(l.multiplier) : CONTRACT;

const finite = (v: any) => Number.isFinite(Number(v));

// WHY a structure cannot be priced, or null when it can.
//
// This gate is the whole safety of the module. The arithmetic above it is
// exact; everything that ever went wrong here was an input this function let
// through and then valued confidently. It returns a REASON rather than a
// boolean so a screen can say which, and so "no break-even" and "cannot be
// priced" stop rendering as the same empty state.
export function priceability(legs: Leg[]): string | null {
  if (!Array.isArray(legs) || legs.length === 0) return "no legs";

  const opts = legs.filter((l) => l && l.type !== "S");
  for (const l of legs) {
    if (!l || typeof l !== "object") return "a leg is not a leg";
    // Explicit membership. An unrecognised type used to be valued as a put by
    // legPLAt and sloped as a call by slopeAbove, which is how a naked short
    // call came back with a $0 floor and `unbounded: null`.
    if (l.type !== "C" && l.type !== "P" && l.type !== "S") return `unknown leg type ${String(l.type)}`;
    if (!finite(l.qty)) return "a leg has no quantity";
    // Number(null) is 0, so `Number.isFinite(Number(l.entryPrice))` alone
    // would call a missing price free. A long call bought for nothing cannot
    // lose, which is what it reported.
    if (l.entryPrice === null || l.entryPrice === undefined || !finite(l.entryPrice)) {
      return "a leg has no entry price";
    }
    if (l.adjusted) return "an adjusted contract has no standard deliverable";
    if (l.multiplier !== null && l.multiplier !== undefined && !(Number(l.multiplier) > 0)) {
      return "a leg has an unusable contract multiplier";
    }
    if (l.type !== "S") {
      // Same trap as entryPrice: null passes Number.isFinite. A strike-0
      // contract then contributes intrinsic and no evaluation point, and
      // invented a $9,700 profit on a 5-wide spread.
      if (l.strike === null || l.strike === undefined || !(Number(l.strike) > 0)) {
        return "an option leg has no strike";
      }
      if (!l.expiry) return "an option leg has no expiry";
    }
  }

  const expiries = new Set(opts.map((l) => String(l.expiry)));
  if (expiries.size > 1) return "more than one expiry — value each separately";

  const names = new Set(legs.map((l) => l.underlying).filter((u) => u !== null && u !== undefined && u !== ""));
  if (names.size > 1) return "legs on more than one underlying";

  return null;
}

export const priceable = (legs: Leg[]) => priceability(legs) === null;

// What ONE leg is worth at expiry with the underlying at `price`, net of what
// it cost or took in. Signed: negative is a loss.
export function legPLAt(leg: Leg, price: number): number {
  const qty = Number(leg.qty) || 0;
  const entry = Math.abs(Number(leg.entryPrice) || 0);
  const strike = Number(leg.strike) || 0;
  // Written as an exhaustive switch rather than a call/else, because the else
  // is exactly what valued an unknown type as a put.
  const intrinsic =
    leg.type === "S" ? price : leg.type === "C" ? itv(price - strike) : leg.type === "P" ? itv(strike - price) : NaN;
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
    // Calls and stock only, named rather than defaulted. `if (type === "P")
    // return s` counted every unrecognised type as a call while legPLAt valued
    // it as a put, so the two disagreed and the disagreement read as "bounded".
    if (l.type !== "C" && l.type !== "S") return s;
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
  const why = priceability(legs);
  if (why) return { loss: null, at: null, unbounded: null, reason: why };
  // Above the highest strike the payoff is a ray. Falling means no bound.
  if (slopeAbove(legs) < 0) {
    return { loss: null, at: null, unbounded: "up" as const, reason: null as string | null };
  }
  let worst = Infinity;
  let at = 0;
  for (const k of kinks(legs)) {
    const pl = payoffAt(legs, k) as number;
    if (pl < worst) { worst = pl; at = k; }
  }
  // The downside is always bounded: at price 0 every call is worthless, every
  // put pays its strike and stock is worth nothing. There is nothing below.
  return { loss: worst >= 0 ? 0 : round2(-worst), at, unbounded: null, reason: null as string | null };
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
  // Gated like everything else. It used to answer -$300 for a structure whose
  // every other figure withheld, which is the file's own rule broken in the
  // one function that skipped the check.
  if (!priceable(legs)) return null;
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
    unpriceable: loss.reason !== null,
    // WHY, so a screen can say it. "[] break-evens" meant both "none" and
    // "could not be computed" until this existed.
    unpriceableReason: loss.reason,
    maxProfit: profit.profit,
    profitUnbounded: profit.unbounded,
    breakEvens: breakEvens(legs),
    netPremium: netPremium(legs),
    slopeAbove: priceable(legs) ? slopeAbove(legs) : null
  };
}
