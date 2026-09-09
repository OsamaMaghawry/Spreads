// Turning a set of selected positions into orders that are safe to send.
//
// The owner's reason for wanting this: on a book like the TSLA one the legs
// finance each other, so closing one alone can be refused because another
// position depends on it. That is right, and it cuts both ways -- the refusal
// is the GOOD outcome. The bad one is the order that succeeds and leaves the
// rest of the book naked.
//
// FOUR FACTS THE BROKER IMPOSES, none of them ours:
//
//   1. A multi-leg order carries AT MOST FOUR legs.
//   2. Every leg of one must be on the SAME UNDERLYING.
//   3. Shares are never a leg of a multi-leg options order.
//   4. Leg ratios must be whole numbers whose greatest common divisor is 1.
//
// So a selection of any size becomes SEVERAL orders, and the moment there is
// more than one they are not simultaneous. Between the first fill and the last
// the account holds something that was on no screen.
//
// THE RULE THAT MAKES THAT SAFE:
//
//   Every order that only reduces risk goes before every order that increases
//   it, ACROSS asset classes.
//
// Closing a short (buying it back) removes an obligation. Closing a long
// (selling it) can only increase risk, because that long may be the cover for a
// short still open -- selling 210 shares before buying back the calls written
// against them turns a covered call into a naked one for as long as the second
// order takes to fill.
//
// The first version of this file got that wrong in a way its own tests missed:
// it pushed all OPTION orders and then all EQUITY orders, so a selection of
// "short 100 shares + long 1 call" sold the call -- the only cap on the short's
// upside -- first, while printing a warning that said the opposite. Ordering is
// by risk direction now, and asset class decides only which order a leg can
// share, never when it is sent.
//
// A mixed order (a vertical: one buy-back and one sale) is SELF-CONTAINED: it
// fills as one unit or not at all, so it carries no intermediate state and sits
// safely between the two. That is why atomicity is preferred wherever the
// broker allows it, and why direction only sorts ACROSS orders, never within
// one.

export const MAX_MLEG_LEGS = 4;

const gcd2 = (a, b) => (b === 0 ? a : gcd2(b, a % b));
const gcdAll = (ns) => ns.reduce((g, n) => gcd2(g, Math.abs(n)), 0) || 1;

const isEquity = (l) => l.assetClass === "equity";
const isBuyBack = (l) => l.side === "short";

export const closeAction = (l) => (isBuyBack(l) ? "buy_to_close" : "sell_to_close");

// Which book a leg belongs to. Legs on different underlyings can never share an
// order, so a missing ticker is its OWN group rather than a shared "unknown"
// bucket -- guessing them together is how a SPY put and a TSLA call ended up
// netted into one price that was a price of nothing.
const bookOf = (l, i) => l.ticker || `__unknown_${l.symbol || i}`;

// An adjusted contract never shares an order.
//
// A corporate action changed what it delivers, so its OCC strike no longer
// describes the deliverable and its price is not comparable with a normal
// contract's. openPosition refuses to OPEN one for this reason. Closing must
// stay possible -- that is the whole point of the Broker tab -- but netting one
// into a per-unit price beside ordinary legs prices a unit that does not exist.
const isAdjusted = (l) => !!l.adjusted;

export function deriveUnit(legs) {
  const qtys = (legs || []).map((l) => Math.abs(Number(l.qty) || 0));
  if (!qtys.length || qtys.some((q) => !(q > 0))) return null;
  const g = gcdAll(qtys);
  return {
    qty: g,
    legs: legs.map((l, i) => ({ ...l, ratio: qtys[i] / g, action: closeAction(l) }))
  };
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// 0 = only reduces risk, 1 = self-contained (fills whole or not at all),
// 2 = only increases risk. The sort key, and the whole safety property.
const tierOf = (order) => {
  const acts = new Set(order.legs.map((l) => l.action));
  if (acts.size > 1) return 1;
  return acts.has("buy_to_close") ? 0 : 2;
};

export function closePlan(selected) {
  const legs = (selected || []).filter((l) => l && l.symbol && Math.abs(Number(l.qty) || 0) > 0);
  if (!legs.length) return { orders: [], atomic: false, warnings: [] };

  const warnings = [];
  const books = {};
  legs.forEach((l, i) => {
    const k = bookOf(l, i);
    (books[k] = books[k] || []).push(l);
  });

  const raw = [];
  for (const key of Object.keys(books).sort()) {
    const book = books[key];
    // Adjusted contracts and shares each go alone; neither can be netted.
    const adjusted = book.filter((l) => !isEquity(l) && isAdjusted(l));
    const equity = book.filter(isEquity);
    const options = book.filter((l) => !isEquity(l) && !isAdjusted(l));

    if (options.length) {
      const groups =
        options.length <= MAX_MLEG_LEGS
          ? [options]
          : // Only once the cap forces a split does direction decide the
            // grouping, so a short and the long covering it never land in
            // different orders with the sale going first.
            [...chunk(options.filter(isBuyBack), MAX_MLEG_LEGS), ...chunk(options.filter((l) => !isBuyBack(l)), MAX_MLEG_LEGS)];
      for (const g of groups) {
        const unit = deriveUnit(g);
        if (unit) raw.push({ kind: "options", ticker: key, ...unit });
      }
    }
    for (const l of [...adjusted, ...equity]) {
      const unit = deriveUnit([l]);
      if (unit) {
        raw.push({
          kind: isEquity(l) ? "equity" : "options",
          ticker: key,
          alone: true,
          adjusted: isAdjusted(l),
          ...unit
        });
      }
    }
  }

  // THE ORDERING. Stable within a tier, so the per-book grouping above is
  // preserved and only the risk direction moves anything.
  const orders = raw.map((o, i) => ({ o, i, t: tierOf(o) })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.o);

  const atomic = orders.length === 1;
  if (!atomic) {
    const reasons = [];
    if (Object.keys(books).length > 1) reasons.push("legs on more than one underlying can never share an order");
    if (legs.some(isEquity)) reasons.push("shares never share an order with contracts");
    if (legs.some((l) => !isEquity(l) && isAdjusted(l))) reasons.push("an adjusted contract is priced on its own");
    if (Object.values(books).some((b) => b.filter((l) => !isEquity(l) && !isAdjusted(l)).length > MAX_MLEG_LEGS)) {
      reasons.push(`the broker takes at most ${MAX_MLEG_LEGS} option legs per order`);
    }
    warnings.push(
      `This cannot go as one order — ${reasons.join("; ") || "it needs more than one"}. It will be sent as ${orders.length} orders, one after another, each waiting for the one before it to fill.`
    );
    if (orders.some((o) => tierOf(o) === 2)) {
      warnings.push(
        "Everything that only buys back a short is sent before anything that sells, so cover is never removed before the position it covers is closed. If a later order does not fill, you are left holding the covering legs — never a bare short."
      );
    }
  }
  return { orders, atomic, warnings };
}

// What the SELECTION leaves behind.
//
// closePlan reasons only about the legs handed to it, which is the right scope
// for building orders and the wrong one for judging safety: ticking a single
// long call turns a defined-risk spread into a naked short, and nothing in the
// plan can see that because the short was never selected. This looks at the
// whole account.
//
// It is a warning, not a veto. Selling cover may be exactly what the owner
// intends -- that is his stock and his call to make. What he is owed is the
// consequence, stated before he confirms.
export function coverLeftBehind(selected, allRows) {
  const picked = new Set((selected || []).map((l) => l.symbol));
  const out = [];
  const byTicker = {};
  for (const r of allRows || []) {
    const t = r?.ticker;
    if (!t) continue;
    (byTicker[t] = byTicker[t] || []).push(r);
  }
  for (const l of selected || []) {
    // Only SELLING can strip cover; buying a short back never does.
    if (l.side !== "long") continue;
    const rest = (byTicker[l.ticker] || []).filter((r) => !picked.has(r.symbol) && r.qty < 0);
    if (rest.length) {
      out.push({
        selling: l.symbol,
        ticker: l.ticker,
        leaves: rest.map((r) => r.symbol),
        text: `Selling ${l.ticker} ${l.assetClass === "equity" ? "shares" : l.symbol} leaves ${rest.length} short ${l.ticker} position${rest.length > 1 ? "s" : ""} that you have not selected. Check what is covering them before you send this.`
      });
    }
  }
  return out;
}

export const orderLegs = (order) =>
  order.legs.map((l) => ({
    symbol: l.symbol,
    ratio: l.ratio || 1,
    action: l.action,
    ...(l.assetClass ? { assetClass: l.assetClass } : {})
  }));
