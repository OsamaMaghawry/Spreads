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
export const BLIND_STEP = 0.02;    // no usable quote: crawl, as a fallback

const round2 = (v) => Math.round(v * 100) / 100;

// The ceiling does the protective work now that the number of attempts is
// unbounded: it is the only thing stopping the walk, so it must hold. Because
// it is recomputed from a live quote every step, a market that moves away is
// followed rather than abandoned — but never chased past ask + ASK_BUFFER.
export function nextLimit(debit, quote) {
  const ask = quote && Number.isFinite(quote.askDebit) ? round2(quote.askDebit) : null;
  if (ask === null) return round2(debit + BLIND_STEP);
  const ceiling = round2(ask + ASK_BUFFER);
  if (debit >= ceiling) return round2(debit); // already as aggressive as we go
  return round2(Math.min(ceiling, debit + Math.max(MIN_STEP, (ceiling - debit) * WALK_FRACTION)));
}
