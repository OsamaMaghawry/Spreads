// Is this a market, or only half of one?
//
// A quote arrives as a bid and an ask. When one side is missing, Alpaca sends
// it as 0 rather than as absent, and `q.ap || 0` cannot tell those two apart --
// so a one-sided market became a real price of zero and was then averaged with
// the other side.
//
// What that looked like, on a live account, on the button:
//
//   SPY shares, bid $746.01, ask $0.00.
//   mid = (746.01 + 0) / 2 = $373.01
//
// The ticket showed "Market now (mid) $373.01", computed a P/L of -$5,210.35
// against it, seeded the limit price with it, and offered a button reading
// "Sell 13 shares at $373.01" -- into a bid of $746.01. Every one of those
// numbers came from the same missing offer. The ticket even printed "No live
// quote, so there is nothing to judge your price against" directly above the
// price it had judged.
//
// THE RULE, which is not new: syncAccounts has always required
// `ap > 0 && bp >= 0 && ap >= bp` before marking a leg from a quote. It was
// simply never applied in the two functions that price a CLOSE. This is that
// rule, in one place, so the two engines cannot drift again.
//
// A zero BID is a real market -- nobody wants a deep out-of-the-money contract,
// and it must still be closable, which is why the rule is not "both sides
// positive". A zero ASK is not a market: nobody is offering at any price.

export type Quote = { bp?: number | null; ap?: number | null } | null | undefined;

export function twoSided(q: Quote): boolean {
  if (!q) return false;
  const bid = Number(q.bp);
  const ask = Number(q.ap);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return false;
  // ask > 0: an offer of zero is an absent offer.
  // bid >= 0: an absent bid IS a price -- it means worthless, and a worthless
  //           contract is one a trader especially needs to be able to close.
  // ask >= bid: a crossed book is stale data, not an opportunity.
  return ask > 0 && bid >= 0 && ask >= bid;
}

// The midpoint, or null when there is no market to take the middle of.
export function midOf(q: Quote): number | null {
  if (!twoSided(q)) return null;
  return (Number(q!.bp) + Number(q!.ap)) / 2;
}

// WHY a set of legs cannot be priced, naming the leg, or null when it can.
// A sentence rather than a boolean so the ticket can say which contract has no
// market instead of going silently blank.
export function quotesRefusal(symbols: string[], quotes: Record<string, Quote>): string | null {
  for (const sym of symbols) {
    const q = quotes?.[sym];
    if (!q) return `No quote for ${sym}.`;
    if (!twoSided(q)) {
      const bid = Number(q.bp);
      const ask = Number(q.ap);
      if (Number.isFinite(bid) && Number.isFinite(ask) && ask < bid && ask > 0) {
        return `${sym} is quoted crossed — bid ${bid}, ask ${ask}. That is stale data, not a price.`;
      }
      return `${sym} has no offer right now — bid ${Number.isFinite(bid) ? bid : "none"}, no ask. The market for it may be closed.`;
    }
  }
  return null;
}
