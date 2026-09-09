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

// A leg, for the purpose of judging its quote. Only the asset class matters,
// because the rule below is NOT the same for a contract and for a share.
export type QuotedLeg = { symbol: string; assetClass?: string };

// THE ZERO BID IS THE WHOLE SUBTLETY, and it goes the opposite way for the two
// asset classes:
//
//   An OPTION with bid 0 / ask 0.05 is a real market. Nobody wants a deep
//   out-of-the-money contract, and that is exactly the position a trader most
//   needs to be able to close -- refusing it would make worthless contracts
//   unclosable, which is the failure this whole area exists to prevent.
//
//   A STOCK with bid 0 / ask 746.05 is NOT a market. A listed equity has no
//   "worthless" reading: a $746 share with no bid is a missing side, exactly
//   as a $746 share with no ask was.
//
// The first version of this file applied the option rule to both, because it
// lifted the rule from syncAccounts -- which only ever sees option legs. That
// reproduced the original defect in mirror image: SPY {bp: 0, ap: 746.05}
// priced at a mid of $373.02 and armed a sell at $373.03 into a $746.05 offer,
// $4,849 on a 13-share lot. getLegsQuote separates equity from option legs two
// lines before it calls this, and then used to throw that distinction away.
const equityLeg = (l: QuotedLeg | string) => typeof l !== "string" && l?.assetClass === "equity";

export function twoSided(q: Quote, equity = false): boolean {
  if (!q) return false;
  // Checked BEFORE Number(), because Number(null) is 0 and Number(undefined) is
  // NaN -- so an explicitly null bid used to be admitted as a bid of zero and
  // priced as a real one.
  if (q.bp === null || q.bp === undefined || q.ap === null || q.ap === undefined) return false;
  const bid = Number(q.bp);
  const ask = Number(q.ap);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return false;
  // ask > 0: an offer of zero is an absent offer, for anything.
  if (!(ask > 0)) return false;
  // The asset-class split above.
  if (!(equity ? bid > 0 : bid >= 0)) return false;
  // ask >= bid: a crossed book is stale data, not an opportunity. A locked
  // market (bid === ask) is real and crossable, so it passes.
  return ask >= bid;
}

// The midpoint, or null when there is no market to take the middle of.
export function midOf(q: Quote, equity = false): number | null {
  if (!twoSided(q, equity)) return null;
  return (Number(q!.bp) + Number(q!.ap)) / 2;
}

// WHY a set of legs cannot be priced, naming the leg, or null when it can.
// A sentence rather than a boolean so the ticket can say which contract has no
// market instead of going silently blank.
//
// Takes legs rather than symbols so the asset class travels with them; a bare
// string is accepted and judged as an option, which is what every option-only
// caller means.
export function quotesRefusal(legs: (QuotedLeg | string)[], quotes: Record<string, Quote>): string | null {
  for (const l of legs || []) {
    const sym = typeof l === "string" ? l : l?.symbol;
    if (!sym) return "A leg is missing its symbol.";
    const equity = equityLeg(l);
    const q = quotes?.[sym];
    if (!q) return `No quote for ${sym}.`;
    if (twoSided(q, equity)) continue;

    const bid = Number(q.bp);
    const ask = Number(q.ap);
    const haveBid = q.bp !== null && q.bp !== undefined && Number.isFinite(bid);
    const haveAsk = q.ap !== null && q.ap !== undefined && Number.isFinite(ask);
    if (haveBid && haveAsk && ask > 0 && ask < bid) {
      return `${sym} is quoted crossed — bid ${bid}, ask ${ask}. That is stale data, not a price.`;
    }
    if (!haveAsk || !(ask > 0)) {
      return `${sym} has no offer right now — bid ${haveBid ? bid : "none"}, no ask. The market for it may be closed.`;
    }
    // Only reachable for an equity with no bid, since an option's zero bid is
    // allowed above.
    return `${sym} has no bid right now — ask ${ask}, no bid. The market for it may be closed.`;
  }
  return null;
}
