// What Alpaca will actually accept in one multi-leg order.
//
// The close ticket builds a `mleg` order from whatever legs a position holds,
// and until now it built it from two or four because nothing it could group
// had more. Leg-first grouping produces five- and six-leg books on its first
// day -- a broken-wing butterfly, a ladder, a repair rolled twice -- and every
// one of them would have been handed to the broker whole and refused.
//
// A refusal is visible rather than silent, so nothing would have been lost
// except the one thing the owner actually asked for: that nothing in the
// account is unclosable. A position you cannot close from the button is
// unclosable to the person looking at the button. So the ticket asks first,
// gets a sentence it can show, and sends the user to the leg picker instead of
// to the broker's error message.
//
// FOUR RULES, all of them Alpaca's and none of them ours:
//
//   1. At most four legs in one mleg order.
//   2. Options only. Shares are a different endpoint with a different price
//      convention -- dollars per share, not a signed per-unit net.
//   3. Leg ratios are positive integers whose greatest common divisor is 1.
//      A 2:4 is rejected; the same order as 1:2 with twice the quantity is
//      accepted and fills identically.
//   4. A contract appears at most once. Two legs on one symbol is the caller
//      having failed to net them, and the broker says so unhelpfully.

export const MAX_MLEG_LEGS = 4;

type CloseLeg = {
  symbol?: string;
  ratio?: number;
  assetClass?: string;
  action?: string;
};

const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
export const gcdAll = (ns: number[]) => ns.reduce((g, n) => gcd2(g, Math.abs(n)), 0) || 1;

// WHY this set of legs cannot go as one order, in a sentence a trader can act
// on, or null when it can. A reason rather than a boolean for the same reason
// legMath returns one: "cannot" and "cannot, because" are different screens.
export function mlegRefusal(legs: CloseLeg[]): string | null {
  const ls = Array.isArray(legs) ? legs : [];
  if (ls.length === 0) return "There are no legs to close.";
  // One leg is a plain order, not an mleg, and every rule below is about the
  // multi-leg form -- so a single share lot or a single contract is fine here
  // and is routed away from mleg by the caller.
  if (ls.length === 1) return null;

  if (ls.length > MAX_MLEG_LEGS) {
    return `This position has ${ls.length} legs and the broker accepts at most ${MAX_MLEG_LEGS} in one order. Close it in parts — pick the legs to close, then repeat for the rest.`;
  }
  if (ls.some((l) => l?.assetClass === "equity")) {
    return "Shares and contracts cannot go in one order. Close the shares on their own, then the contracts.";
  }

  const symbols = ls.map((l) => l?.symbol).filter(Boolean);
  if (symbols.length !== ls.length) return "A leg is missing its contract symbol.";
  if (new Set(symbols).size !== symbols.length) {
    return "The same contract appears twice in this position. Close its legs one at a time.";
  }

  const ratios = ls.map((l) => Number(l?.ratio ?? 1));
  if (ratios.some((r) => !Number.isFinite(r) || r <= 0 || !Number.isInteger(r))) {
    return "A leg has a quantity ratio the broker cannot accept — it must be a whole number above zero.";
  }
  return null;
}

export const mlegOk = (legs: CloseLeg[]) => mlegRefusal(legs) === null;

// Reduce the leg ratios, and scale the quantity AND THE PRICE to match.
//
// Rule 3 rejects 2:4, and the fix is arithmetic rather than a refusal: dividing
// every ratio by their common factor and multiplying the order quantity by the
// same factor sends the identical set of contracts in a form the broker takes.
// Two units of a 2:4 and four units of a 1:2 are the same eight and four
// contracts.
//
// THE PRICE MUST COME WITH THEM. An mleg limit price is per UNIT of the
// structure, so halving the unit and doubling the quantity while leaving the
// price alone doubles what the order is worth: 2 units at $1.05 is $210, and
// 4 units at $1.05 is $420. That is a silent doubling of a real payment, which
// is why the price is an argument here rather than something the caller
// remembers to divide.
//
// Rounding goes DOWN in both directions, which is the same rule for a debit
// and a credit because of the sign convention: a positive limit is the most
// the trader will pay, so a lower number never overpays; a negative limit is
// the credit demanded, and a lower (more negative) number never accepts less.
// The cost of rounding this way is a fill missed by a cent, which the walk's
// next step recovers. The cost of rounding the other way is money.
export function normalizeMleg<T extends CloseLeg>(
  qty: number,
  legs: T[],
  limitPrice: number | null = null
): { qty: number; legs: T[]; limitPrice: number | null } {
  const ls = Array.isArray(legs) ? legs : [];
  const n = Number(qty) || 0;
  const keep = { qty: n, legs: ls, limitPrice };
  if (ls.length < 2 || n <= 0) return keep;
  const ratios = ls.map((l) => Number(l?.ratio ?? 1));
  if (ratios.some((r) => !Number.isFinite(r) || r <= 0 || !Number.isInteger(r))) return keep;
  const g = gcdAll(ratios);
  if (g <= 1) return keep;
  const priced = limitPrice !== null && limitPrice !== undefined && Number.isFinite(Number(limitPrice));
  return {
    qty: n * g,
    legs: ls.map((l, i) => ({ ...l, ratio: ratios[i] / g })),
    limitPrice: priced ? Math.floor((Number(limitPrice) / g) * 100) / 100 : limitPrice
  };
}
