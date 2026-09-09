// How many whole strategy units of a multi-leg order have actually filled.
//
// The walk counts fills against the number of UNITS it asked for, and asks the
// broker "how much filled?". Nobody has ever established what unit Alpaca
// answers in for an mleg parent: a 2-leg 1:1 order for 10 units that fills 3
// could come back as `filled_qty: 3` (units) or `6` (contracts). Alpaca's
// public documentation does not say, and no captured order in this repo or its
// ledgers has ever shown a partially filled mleg.
//
// Guessing costs real money in one direction. `useMultiClose` treats
// `closedTotal + thisOrder >= unit` as "complete", so reading 6 as 6 units
// against a 10-unit order finishes the walk with 4 units still open -- and on
// a buy-back that is a short obligation the user has been told is gone, right
// before the sequence sells its cover.
//
// So stop asking the parent. A LEG's `filled_qty` is unambiguously contracts:
// `spreadPairing` already mins it against a broker position quantity, and that
// has been right in production for weeks. Whole units are therefore derivable,
// and the parent's unit stops mattering.
//
// MIN, not sum and not max. A leg that fills while its partner does not is not
// a closed unit -- it is one open leg and one closed one. Counting it as a unit
// is precisely how a walk stops watching a position that is still live.

type Leg = { ratio_qty?: unknown; filled_qty?: unknown };

export function filledUnits(order: any): number {
  const legs: Leg[] = Array.isArray(order?.legs) ? order.legs : [];
  if (!legs.length) return Number(order?.filled_qty) || 0;
  let least = Infinity;
  for (const l of legs) {
    const ratio = Number(l?.ratio_qty);
    // A leg whose ratio we cannot read makes the whole derivation unsound, and
    // an unsound unit count is the thing this module exists to prevent. Fall
    // back to the parent rather than inventing a denominator.
    if (!Number.isFinite(ratio) || ratio <= 0) return Number(order?.filled_qty) || 0;
    const filled = Number(l?.filled_qty) || 0;
    least = Math.min(least, Math.floor(filled / ratio));
  }
  return Number.isFinite(least) ? Math.max(0, least) : 0;
}
