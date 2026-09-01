// How an opening limit order walks toward a credit that will actually trade.
//
// The mirror of closeWalk.js, and the sign is the whole difference. Closing,
// you pay a debit and a HIGHER number crosses, so the walk climbs toward the
// ask. Opening, you are paid a credit and a LOWER number crosses, so the walk
// concedes toward the bid. Same proportional step, because a fixed one closes a
// tight market and never closes a wide one.
//
// Two things make this walk more conservative than the close's, and both are
// asymmetries in what failure costs:
//
//   - An open that never fills costs nothing. You simply do not get the
//     position. A close that never fills leaves the trader holding risk they
//     asked to be rid of -- which is why the close walk chases past the ask and
//     this one does not chase past the trader's floor.
//   - Conceding credit RAISES max risk: max risk is (width - credit) x 100. The
//     trader approved a trade at a stated credit and a stated worst case, and
//     the walk must not quietly hand them a worse one. So the floor is theirs to
//     set and see, not a constant buried here.

export const WALK_FRACTION = 0.34; // share of the remaining gap conceded per step
export const MIN_STEP = 0.01;      // always move a cent, or a tight market stalls
export const BID_BUFFER = 0.02;    // may go a hair under the bid to get taken
export const BLIND_STEP = 0.02;    // no usable quote: crawl, as a fallback

const round2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The lowest credit this walk may accept.
//
// Two bounds, and the BINDING one is whichever is higher. The trader's floor is
// absolute -- never concede below it whatever the market does. Bid minus the
// buffer is the point past which conceding buys nothing, because an order there
// should already be taken. Withhold rather than default: with neither bound
// known there is no floor to walk to and the caller must not invent one.
export function creditFloor(quote, minCredit) {
  const bid = num(quote?.bid);
  const floor = num(minCredit);
  const marketable = bid === null ? null : round2(bid - BID_BUFFER);
  if (floor === null) return marketable;
  if (marketable === null) return round2(floor);
  return round2(Math.max(floor, marketable));
}

// The next credit to ask for. Returns the current one unchanged when there is
// nowhere left to go -- the caller reads "no change" as "hold here", exactly as
// the close walk does at its ceiling.
export function nextCredit(credit, quote, minCredit) {
  const current = num(credit);
  if (current === null) return null;
  const floor = creditFloor(quote, minCredit);
  // No quote and no floor: concede a cent at a time rather than stand still,
  // but never below a floor the trader did set.
  if (floor === null) return round2(Math.max(0.01, current - BLIND_STEP));
  if (current <= floor) return round2(current);
  return round2(Math.max(floor, current - Math.max(MIN_STEP, (current - floor) * WALK_FRACTION)));
}

// What the trader is told before they start it. Kept here so the sentence and
// the arithmetic cannot drift apart.
export function walkBounds(startCredit, quote, minCredit) {
  const floor = creditFloor(quote, minCredit);
  const start = num(startCredit);
  return {
    start,
    floor,
    // A start already at or below the floor will not walk at all, and saying so
    // up front is better than a log line thirty seconds later.
    willWalk: start !== null && floor !== null && start > floor
  };
}
