// Turning a set of selected positions into orders that are safe to send.
//
// The owner's reason for wanting this, in his words: on a book like the TSLA
// one, "most of them rely on each other by financing each other. So, closing
// one thing may get refused as other position relying on it." That is exactly
// right, and it cuts both ways -- the refusal is the GOOD outcome. The bad one
// is the order that succeeds and leaves the rest of the book naked.
//
// TWO FACTS THE BROKER IMPOSES, neither of them ours:
//
//   1. A multi-leg order carries AT MOST FOUR legs. A six-leg selection cannot
//      be one order however much we would like it to be.
//   2. Shares are never a leg of a multi-leg options order. They are a
//      different endpoint with a different price convention.
//
// So a selection of any size becomes SEVERAL orders, and the moment there is
// more than one, they are not simultaneous. Between the first fill and the last
// the account holds something that was never on screen.
//
// THE RULE THAT MAKES THAT SAFE:
//
//   Buy-backs first. Sales last.
//
// Closing a SHORT (buying it back) can only reduce risk: the obligation goes
// away. Closing a LONG (selling it) can only increase it, because that long may
// be the cover for a short that is still open -- selling the 210 shares before
// buying back the calls written against them turns a covered call into a naked
// one, for as long as it takes the second order to fill.
//
// Ordered this way, every intermediate state is at least as safe as the state
// before it. That is the strongest property available once atomicity is off the
// table, and it is why the plan is a SEQUENCE rather than a batch: each order
// waits for the one before it to fill.

// Alpaca's cap. The server enforces it authoritatively in
// `_shared/mlegLimits.ts` -- this constant exists so the ticket can PLAN
// against it and tell the user what will happen before anything is sent, not so
// the client can be trusted about it.
export const MAX_MLEG_LEGS = 4;

const gcd2 = (a, b) => (b === 0 ? a : gcd2(b, a % b));
const gcdAll = (ns) => ns.reduce((g, n) => gcd2(g, Math.abs(n)), 0) || 1;

const isEquity = (l) => l.assetClass === "equity";
// Closing a short is a buy; closing a long is a sell. One rule, both asset
// classes, and the same rule that decides the ordering below.
const isBuyBack = (l) => l.side === "short";

export const closeAction = (l) =>
  isEquity(l)
    ? isBuyBack(l) ? "buy_to_close" : "sell_to_close"
    : isBuyBack(l) ? "buy_to_close" : "sell_to_close";

// The unit of a multi-leg order, and each leg's ratio within it.
//
// Alpaca wants a quantity and per-leg ratios whose greatest common divisor is
// 1, not a list of absolute quantities. Selecting one 352.50 call and two
// 362.50 calls is one unit of a 1:2; selecting two and four is TWO units of a
// 1:2, not one unit of a 2:4, which the broker rejects.
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

// The ordered list of orders to send for a selection, and what to warn about.
//
// Returns { orders, atomic, warnings }. `atomic` is true only when the whole
// selection goes as ONE order -- the only case with no intermediate state at
// all, and the case worth telling the user they are in.
export function closePlan(selected) {
  const legs = (selected || []).filter((l) => l && l.symbol && Math.abs(Number(l.qty) || 0) > 0);
  if (!legs.length) return { orders: [], atomic: false, warnings: [] };

  const warnings = [];

  // Shares leave the options group entirely. Not a preference -- an equity leg
  // in an mleg body is rejected, and its limit price means something different
  // (dollars per share, not a signed per-unit net).
  const equity = legs.filter(isEquity);
  const options = legs.filter((l) => !isEquity(l));

  // Buy-backs first, within each asset class. See the header.
  const buyBacks = options.filter(isBuyBack);
  const sales = options.filter((l) => !isBuyBack(l));

  const orders = [];
  // ATOMIC WHENEVER THE BROKER ALLOWS IT.
  //
  // If the whole option selection fits in one order, that is strictly the best
  // outcome available -- one fill, no intermediate state, and the legs priced
  // against each other as a net rather than separately. An earlier version of
  // this split by risk direction unconditionally, which turned an ordinary
  // two-leg vertical into two orders: worse in every respect, and it gave up
  // the net price that is the whole reason to close a spread as a spread.
  //
  // Direction only decides ORDERING once the cap has already forced a split.
  const groups =
    options.length <= MAX_MLEG_LEGS
      ? [options]
      : // Chunked WITHIN a risk direction rather than across it. Chunking a
        // mixed list by fours could put a short and the long that covers it in
        // different orders with the sale going first, which is the one
        // arrangement this module exists to prevent.
        [...chunk(buyBacks, MAX_MLEG_LEGS), ...chunk(sales, MAX_MLEG_LEGS)];
  for (const group of groups) {
    const unit = deriveUnit(group);
    if (unit) orders.push({ kind: "options", ...unit });
  }
  // Equity last among its own kind for the same reason: a share sale is what
  // removes cover. Each lot is its own order; there is no multi-leg equity.
  for (const l of [...equity.filter(isBuyBack), ...equity.filter((l) => !isBuyBack(l))]) {
    orders.push({ kind: "equity", qty: Math.abs(Number(l.qty)), legs: [{ ...l, ratio: 1, action: closeAction(l) }] });
  }

  const atomic = orders.length === 1;
  if (!atomic) {
    warnings.push(
      `This cannot go as one order — the broker takes at most ${MAX_MLEG_LEGS} option legs per order, and shares never share an order with contracts. It will be sent as ${orders.length} orders, one after another, each waiting for the one before it to fill.`
    );
    if (sales.length || equity.some((l) => !isBuyBack(l))) {
      warnings.push(
        "Buy-backs are sent first and sales last, so cover is never removed before the position it covers is closed. If a later order does not fill, you are left holding the covering legs — never a bare short."
      );
    }
  }
  return { orders, atomic, warnings };
}

// The wire shape closeSpread already understands, per order.
export const orderLegs = (order) =>
  order.legs.map((l) => ({
    symbol: l.symbol,
    ratio: l.ratio || 1,
    action: l.action,
    ...(l.assetClass ? { assetClass: l.assetClass } : {})
  }));
