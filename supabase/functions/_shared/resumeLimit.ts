// Which price a retry may resume from.
//
// A limit price is a property of a LEG SET, not of a symbol. This was written
// as "the highest limit on any order that touched any of these symbols", which
// is a different sentence with a different meaning, and on 8 Sep it resumed a
// cancelled single-leg buy-back of one short call at $9.89 PER CONTRACT as the
// NET limit of a two-leg structure quoted at −7.01 / −6.43. Sent, that order
// pays $989 to close a position the market would have paid $643 to close.
//
// Pulled out of spreadQuote and made pure so the rule can be tested. It was
// not, and neither the 219 tests nor a green deploy said anything about it.

// Same contracts, same count. Order is irrelevant; multiplicity is not.
export function sameLegs(a: string[], b: string[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
}

// The symbols one Alpaca order actually covers. A multi-leg order carries
// them in `legs`; a single-leg order is its own symbol.
export const orderSymbols = (o: any) =>
  Array.isArray(o?.legs) && o.legs.length ? o.legs.map((l: any) => l.symbol) : [o?.symbol];

// Orders newest first, as Alpaca returns them with direction=desc.
//
// The scan stops at the first FILLED order on this leg set: anything older
// than a fill belongs to a position that has since been closed and reopened,
// and its price says nothing about the one held now.
export function resumableLimit(orders: any[], symbols: string[]): number | null {
  if (!Array.isArray(orders)) return null;
  let best: number | null = null;
  for (const o of orders) {
    if (!sameLegs(orderSymbols(o), symbols)) continue;
    if (o.status === "filled") break;
    const price = parseFloat(o.limit_price);
    if (!isFinite(price)) continue;
    // Furthest along the walk, which is upward in this convention whether the
    // net is a debit or a credit.
    if (best === null || price > best) best = price;
  }
  return best;
}
