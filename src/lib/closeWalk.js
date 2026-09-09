// How a closing limit order walks toward a price that will actually trade.
//
// The walk starts at the mid, but a spread trades near the ask, and the gap
// between them is whatever the market's width happens to be. A fixed step
// therefore cannot work: it closes a tight market and never closes a wide one.
//
// The old rule was $0.02 every 30s, ten times — a total range of $0.20. A user
// trying to close an AMD spread quoted far wider than that watched ten reprices
// achieve nothing, then five more minutes of silence once the steps ran out.
// The mid on screen looked right the whole time, because the mid IS what was on
// screen; the executable price was never within reach.
//
// Taking a share of the REMAINING distance makes the step a property of the
// market instead of a constant, and converges in a handful of steps at any width.

export const WALK_FRACTION = 0.34; // share of the remaining gap closed per step
export const MIN_STEP = 0.01;      // always move a cent, or a tight market stalls
export const ASK_BUFFER = 0.05;    // never offer more than the ask plus this

const round2 = (v) => Math.round(v * 100) / 100;

// The ceiling does the protective work now that the number of attempts is
// unbounded: it is the only thing stopping the walk, so it must hold. Because
// it is recomputed from a live quote every step, a market that moves away is
// followed rather than abandoned — but never chased past ask + ASK_BUFFER.
export function walkCeiling(quote) {
  const ask = quote && Number.isFinite(quote.askDebit) ? round2(quote.askDebit) : null;
  return ask === null ? null : round2(ask + ASK_BUFFER);
}

export function nextLimit(debit, quote) {
  const ceiling = walkCeiling(quote);
  // No ceiling, no step. This used to blind-step upward by a fixed $0.02, so a
  // quote that vanished mid-walk turned the ceiling off and let the walk keep
  // conceding -- twenty steps in ten minutes, unbounded, while the ticket went
  // on promising "never bids above the ask + $0.05". Holding is the honest
  // move: the market came back or it did not, and either way the price should
  // not climb on its own with nothing to measure it against.
  if (ceiling === null) return round2(debit);
  if (debit >= ceiling) return round2(debit); // already as aggressive as we go
  return round2(Math.min(ceiling, debit + Math.max(MIN_STEP, (ceiling - debit) * WALK_FRACTION)));
}

// Where a walk is allowed to BEGIN.
//
// The ceiling above was doing all the protective work and none of it, because
// nothing checked the starting price against it. A resumed limit of $9.89 on a
// structure quoted at −7.01/−6.43 sat above the ceiling from the first step, so
// nextLimit returned it unchanged, the log said "at the ask ceiling — holding
// here", and the ticket went on promising "never bids above the ask + $0.05"
// while displaying a start that breached it by $16.27. An order sent at that
// price pays $989 to close a position the market would have PAID $643 to close.
//
// So the start is clamped the same way every subsequent step is. A resumed
// price may carry the walk forward; it may never carry it past the ceiling.
export function walkStart(base, resumed, quote) {
  const ceiling = walkCeiling(quote);
  const from = [base, resumed].filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!from.length) return null;
  // Furthest along the walk, which is upward: a debit already tried at 3.00
  // resumes at 3.00 rather than restarting at the mid. On a credit-to-close
  // structure every figure is negative and "upward" still means "giving up
  // more", so the same max is right in both directions.
  // NO CEILING, NO WALK.
  //
  // `ceiling === null ? round2(start) : ...` handed back the resumed price
  // unclamped in exactly the case the clamp exists for. Once the quote gate
  // began refusing a one-sided market, `quote` arrives null far more often, and
  // a resumed $6.40 came straight back out while the ticket printed "never bids
  // above the ask + $0.05" -- the same incident this function was written to
  // end, restored by a different route.
  //
  // A walk is a promise to concede toward a market. With no market there is
  // nothing to concede toward and nothing to stop at, so the answer is that
  // this cannot be walked: set a price by hand instead.
  if (ceiling === null) return null;
  const start = Math.max(...from);
  return round2(Math.min(start, ceiling));
}
