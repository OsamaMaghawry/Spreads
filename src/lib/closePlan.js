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
export const tierOf = (order) => {
  const acts = new Set(order.legs.map((l) => l.action));
  if (acts.size > 1) return 1;
  return acts.has("buy_to_close") ? 0 : 2;
};

// Within the SALES tier, sell the stock before the options.
//
// The tier vocabulary above models "a long covers a short" and has no
// representation for "a long put covers long stock" -- so a married put put both
// sales in tier 2, kept the per-book order (options before equity), and sold the
// PUT first, leaving 100 shares unhedged while the second order worked. Whether
// it ever filled was up to the market.
//
// Selling the stock first is strictly safer in every tier-2 pairing: the
// residual is a fully-paid long option, which carries no obligation and whose
// worst case is the premium already spent. Selling the option first leaves the
// stock, which has neither of those properties.
const sellStockFirst = (order) => (tierOf(order) === 2 && order.kind === "equity" ? 0 : 1);

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
  const orders = raw
    .map((o, i) => ({ o, i, t: tierOf(o), e: sellStockFirst(o) }))
    // Tier first, then stock-before-options inside the sales tier, then the
    // original index so the per-book grouping is otherwise untouched.
    .sort((a, b) => a.t - b.t || a.e - b.e || a.i - b.i)
    .map((x) => x.o);

  const atomic = orders.length === 1;
  if (!atomic) {
    const reasons = [];
    if (Object.keys(books).length > 1) reasons.push("legs on more than one underlying can never share an order");
    if (legs.some(isEquity)) reasons.push("shares never share an order with contracts");
    if (legs.some((l) => !isEquity(l) && isAdjusted(l))) reasons.push("an adjusted contract is priced on its own");
    if (Object.values(books).some((b) => b.filter((l) => !isEquity(l) && !isAdjusted(l)).length > MAX_MLEG_LEGS)) {
      reasons.push(`the broker takes at most ${MAX_MLEG_LEGS} option legs per order`);
    }
    // Leads with what WILL happen, not with what cannot. The first version
    // opened "This cannot go as one order", in an amber box with a warning
    // triangle -- and the owner read the whole panel as a refusal, then watched
    // it close everything anyway. It was never a warning; it is the plan.
    warnings.push(
      `All ${legs.length} of these will be closed. The broker cannot take them as a single order — ${reasons.join("; ") || "there are too many for one"} — so they go as ${orders.length} orders in the order listed below, each sent once the one before it has filled.`
    );
    const hasBuyBacks = orders.some((o) => tierOf(o) === 0);
    const hasSales = orders.some((o) => tierOf(o) === 2);
    if (hasBuyBacks && hasSales) {
      warnings.push(
        "The sequence is deliberate: everything that buys back a short goes first, everything that sells goes last. That way cover is never removed before the short it covers is closed, so a sequence that stops part-way leaves you holding the covering legs — never a bare short."
      );
    } else if (hasSales) {
      // Said instead of the sentence above, not alongside it. Printing "cover
      // is never removed first" over a plan containing no buy-backs at all is
      // vacuously true and reads as a guarantee the plan cannot make -- the
      // same defect as the ordering bug it was written to describe.
      warnings.push(
        "These orders all sell, shares before contracts. If the sequence stops part-way, what you are left holding is a fully-paid long contract rather than an open stock position — but until the last order fills, part of this position is still open."
      );
    }
    warnings.push(
      "If an order does not fill inside its ten minutes, the sequence stops there and the orders after it are never sent. The log below names the one it stopped on."
    );
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
//
// THREE THINGS THE FIRST VERSION GOT WRONG, all found by the bench:
//
//   1. It compared SYMBOL MEMBERSHIP, not quantity. Meanwhile the leg builder
//      had just started capping at `qtyAvailable`, so a short line that was
//      ticked but only partly free counted as fully handled. Executed: 210
//      shares + 3 short calls with 1 free, both ticked -> buys back 1, sells
//      210 shares, leaves TWO NAKED CALLS, and says nothing. Two fixes that
//      were each correct alone, blinding each other.
//   2. It ignored the RIGHT. Selling a long call warned about an open short
//      PUT, which a long call does not cover -- so on a busy book almost every
//      sale warned, and a warning that always fires is not read.
//   3. It was blind to ADJUSTED contracts, whose ticker is "TSLA1" and never
//      matched "TSLA".

// "TSLA1" and "TSLA2" are the same underlying as "TSLA" for the purpose of
// cover; they are different only for the purpose of an order. Ordinary US
// equity tickers do not end in digits, so the trailing strip is safe here --
// and this feeds a warning, never a gate.
const baseTicker = (t) => String(t || "").replace(/\d+$/, "");

// Does a long leg of this kind cover a short leg of that kind?
//
//   long stock  covers  short calls
//   long call   covers  short calls, short stock
//   long put    covers  short puts
//
// A long put does NOT cover a short call, and a long call does not cover a
// short put, which is the distinction the first version was missing.
const covers = (long, short) => {
  const lk = long.assetClass === "equity" ? "S" : long.optionType === "P" ? "P" : "C";
  const sk = short.assetClass === "equity" ? "S" : short.optionType === "P" ? "P" : "C";
  if (lk === "S") return sk === "C";
  if (lk === "C") return sk === "C" || sk === "S";
  return sk === "P";
};

export function coverLeftBehind(selected, allRows) {
  const sel = selected || [];
  // How much of each symbol this close actually retires. Quantity, because a
  // partly-free line is partly closed and the rest stays open.
  const selQty = {};
  for (const l of sel) selQty[l.symbol] = (selQty[l.symbol] || 0) + Math.abs(Number(l.qty) || 0);

  const out = [];
  for (const l of sel) {
    if (l.side !== "long") continue; // only selling can strip cover
    const base = baseTicker(l.ticker);
    const stranded = (allRows || [])
      .filter((r) => r && r.qty < 0 && baseTicker(r.ticker) === base && covers(l, r))
      .map((r) => ({ symbol: r.symbol, open: Math.abs(r.qty) - (selQty[r.symbol] || 0) }))
      .filter((r) => r.open > 0);
    if (!stranded.length) continue;
    const n = stranded.reduce((a, r) => a + r.open, 0);
    out.push({
      selling: l.symbol,
      ticker: l.ticker,
      leaves: stranded.map((r) => r.symbol),
      text: `Selling ${l.ticker} ${l.assetClass === "equity" ? "shares" : l.symbol} leaves ${n} short ${base} contract${n > 1 ? "s" : ""} open that this close does not cover${stranded.some((r) => (selQty[r.symbol] || 0) > 0) ? " — some of them are only partly closable right now" : ""}. Check what is behind them before you send this.`
    });
  }

  // A long put is protection for long stock, not cover for a short. Selling it
  // while the stock stays leaves the stock unhedged -- the married-put case,
  // which the ordering above now handles and which the user should still be
  // told about, because the ordering only helps if BOTH orders fill.
  for (const l of sel) {
    if (l.side !== "long" || l.assetClass === "equity" || l.optionType !== "P") continue;
    const base = baseTicker(l.ticker);
    const shares = (allRows || [])
      .filter((r) => r && r.assetClass === "equity" && r.qty > 0 && baseTicker(r.ticker) === base)
      .map((r) => ({ symbol: r.symbol, open: r.qty - (selQty[r.symbol] || 0) }))
      .filter((r) => r.open > 0);
    if (!shares.length) continue;
    const n = shares.reduce((a, r) => a + r.open, 0);
    out.push({
      selling: `${l.symbol}__protect`,
      ticker: l.ticker,
      leaves: shares.map((r) => r.symbol),
      text: `Selling this ${base} put leaves ${n} ${base} share${n > 1 ? "s" : ""} without the downside protection it was providing.`
    });
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
