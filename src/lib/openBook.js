// The shares an account still holds, and what they are worth now.
//
// THE DEFECT THIS EXISTS FOR. `computeStats` reads `trade_records` and nothing
// else. A share lot acquired by assignment and not yet sold has `realized_pl`
// null by construction, so it contributes zero to every figure on the Analysis
// screen -- and on a wheel account those lots are not an edge case, they are
// where the outcome lives.
//
// Measured on a staging PAPER account -- simulated money, and the framing
// matters because the next person to read this will take it for real: seven
// lots, 700 shares, $129,700 of cost, held up to seven weeks, against $1,737
// of reported P/L, on an account that went from $140k to about $151k. The
// product reported the $1,737 and discarded the rest. The same blind spot is
// on a LIVE account, where one unmarked TSLA lot carries $36,750 of basis.
//
// The first draft of the review called those lots "the losing branch of the
// strategy". That is true only at the instant of assignment and it was the
// wrong lesson: on that account the shares RECOVERED. So the product was not
// hiding risk, it was hiding performance -- which is worse, because the whole
// premise of the wheel is that assignment is not failure. You keep the premium
// AND you own the stock at a discount you chose in advance. Half the return is
// in the shares by design, and a screen that drops it is describing a different
// strategy from the one being run.
//
// WHERE THE MARK COMES FROM. Nowhere new. `syncAccounts` already returns
// `broker` -- `brokerView(positions)` -- carrying the broker's own
// `currentPrice`, `marketValue` and `unrealizedPL` per position, and the
// Analysis page already calls `syncAccounts` on load. This module joins what is
// already on the client. No new request, no second price source, no cron.

// `Number(null)` is 0 and `Number("")` is 0, not NaN. Left to the default, a
// lot with no acquisition price got a basis of ZERO and then marked cleanly --
// reporting its entire market value as unrealized gain. Caught by the test for
// exactly that case; the null check has to come before the coercion.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A corporate action can leave the ledger holding "TSLA1" while the broker
// reports "TSLA".
//
// The `|| root` fallback is not decoration: `occ.ts` has it and this file
// originally dropped it, so a numeric ticker keyed to the empty string and
// collided with every other numeric ticker.
const baseTicker = (t) => {
  const root = String(t || "").toUpperCase();
  return root.replace(/\d+$/, "") || root;
};

// Alpaca supports fractional shares, and `coverageGaps` in brokerView.ts
// already settled the tolerance question with a comment explaining why exact
// equality on a float quantity is the wrong test. Same number here.
const QTY_EPSILON = 0.0001;
const sameQty = (a, b) => Math.abs(a - b) <= QTY_EPSILON;

/**
 * Join stored open share lots to the broker's live positions.
 *
 * @param stockLots  rows from `tradeHistory`, any mix of open and disposed
 * @param brokerRows `account.broker` from `syncAccounts`, or []
 */
export function openBook(stockLots, brokerRows) {
  const open = (stockLots || []).filter((l) => l && !l.disposed_date && (num(l.qty) || 0) > 0);

  // The broker's equity rows, by ticker. Only LONG stock: a short share
  // position is not an assigned wheel lot and its mark belongs to a different
  // question.
  const marks = {};
  // Two broker symbols can strip to one base ticker -- "TSLA" and "TSLA1" in
  // the same payload. The first version let the last one win, and a $375 mark
  // silently replaced by a $10 adjusted-contract mark published -$31,000 as a
  // COMPLETE total. A collision is not a mark; it is a question.
  const collided = new Set();
  for (const r of brokerRows || []) {
    if (!r || r.assetClass !== "equity") continue;
    const q = num(r.qty) || 0;
    if (q <= 0) continue;
    const key = baseTicker(r.ticker || r.symbol);
    if (marks[key]) { collided.add(key); continue; }
    marks[key] = {
      price: num(r.currentPrice),
      qty: q,
      brokerUnrealized: num(r.unrealizedPL)
    };
  }

  const byTicker = new Map();
  for (const l of open) {
    const key = baseTicker(l.ticker);
    const qty = num(l.qty) || 0;
    const price = num(l.acquired_price);
    // A lot with no acquisition price cannot be given a basis, and inventing
    // one would put a fabricated number into a total. It counts as held and as
    // unmarked, and it is named.
    const basis = price === null ? null : qty * price;
    const cur = byTicker.get(key) || {
      ticker: key, lots: 0, shares: 0, basis: 0, basisKnown: true, unknownShares: 0,
      acquired: [], mark: null, marketValue: null, unrealized: null, marked: false
    };
    cur.lots += 1;
    cur.shares += qty;
    // A lot with no acquisition price used to add ZERO to the basis while
    // flagging basisKnown false -- so the book's cost silently understated
    // itself, and the "could not price" banner then reported a $0.00 gap
    // against a book that had one. Unknown cost is its own state with its own
    // share count, never a zero folded into a sum.
    if (basis === null) { cur.basisKnown = false; cur.unknownShares += qty; }
    else cur.basis += basis;
    if (l.acquired_date) cur.acquired.push(l.acquired_date);
    byTicker.set(key, cur);
  }

  for (const t of byTicker.values()) {
    const m = marks[t.ticker];
    t.acquired.sort();
    t.since = t.acquired[0] || null;
    // A mark is only usable when there is a price AND a basis to measure it
    // against. Half of either is not a number.
    // The collision test comes BEFORE the mark, not after it. Checked
    // afterwards it never fired: the first of the two colliding rows was still
    // sitting in `marks`, so the line marked cleanly and the reason was never
    // consulted. A guard evaluated after the thing it guards is not a guard.
    if (!collided.has(t.ticker) && m && m.price !== null && m.price > 0 && t.basisKnown) {
      t.mark = m.price;
      t.marketValue = t.shares * m.price;
      t.unrealized = t.marketValue - t.basis;
      t.marked = true;
      // The broker holding a different quantity than the ledger is not a
      // rounding difference -- it means the two disagree about the position.
      // The mark is still shown; the total is not, because a total built on a
      // disagreement is a guess with a decimal point.
      t.qtyMatchesBroker = sameQty(m.qty, t.shares);
      t.brokerQty = m.qty;
    } else {
      t.marked = false;
      t.qtyMatchesBroker = null;
      t.brokerQty = m ? m.qty : null;
    }
    // WHY a line could not be priced, so the screen stops guessing on its
    // behalf. The banner previously assumed "no price" and said so even when
    // the price was there and the cost was not.
    // ORDER MATTERS, and the first version had it wrong: `no-cost` was tested
    // before `no-position`, so a lot with neither a cost nor a broker row was
    // labelled "no cost" and the banner then stated as fact that a current
    // price existed. Establish what the BROKER has first, then what the ledger
    // has, so every branch is true of the condition that reaches it.
    const hasPrice = !!m && m.price !== null && m.price > 0;
    t.reason = t.marked
      ? null
      : collided.has(t.ticker) ? "collision"
      : !m ? "no-position"
      : !hasPrice ? "no-price"
      : "no-cost";
  }

  const tickers = [...byTicker.values()].sort((a, b) => (b.basis || 0) - (a.basis || 0));

  // Shares the BROKER holds that this ledger has no open lot for.
  //
  // Assignment-to-sync lag produces exactly this, and the first version was
  // silent about it: 500 shares of NVDA held at the broker appeared in neither
  // the panel nor the total, and `complete` stayed true -- so Whole view
  // printed a confident headline over a book it had not fully read. brokerView
  // already states the principle for its own coverage check: a symbol the
  // broker reports and we do not is the failure the view exists to catch.
  const held = new Set(tickers.map((t) => t.ticker));
  const stranded = Object.keys(marks).filter((k) => !held.has(k));

  const totalBasis = tickers.reduce((a, t) => a + (t.basis || 0), 0);
  const markedBasis = tickers.reduce((a, t) => a + (t.marked ? t.basis : 0), 0);
  const unrealized = tickers.reduce((a, t) => a + (t.marked ? t.unrealized : 0), 0);
  const marketValue = tickers.reduce((a, t) => a + (t.marked ? t.marketValue : 0), 0);
  const unknownCostShares = tickers.reduce((a, t) => a + (t.unknownShares || 0), 0);

  // COVERAGE IS IN BASIS DOLLARS, NOT LOT COUNT, and that is deliberate: "6 of
  // 7 lots marked" reads as almost complete while a $32,000 position hides
  // inside the one that is missing. Shares whose cost is unknown are counted
  // separately again, because they have no dollars to appear in either column.
  // `stranded` is DISCLOSED but does not withhold, and that is a reversal of
  // the first fix.
  //
  // `stock_lots` holds option-touched lots only -- the Analysis page states
  // that in its own footer -- so a broker position this ledger has no lot for
  // is very often ordinary stock the user bought outside the product, and is
  // outside what this page claims to cover by design. Withholding on it gave
  // every such user a permanent "-" in Whole view while the copy told them to
  // wait for a sync that would never resolve it. The other cause, an
  // assignment that has not synced yet, is real too and we cannot tell the two
  // apart from here -- so the screen names both and picks neither, the same
  // rule brand.md sets for qty_available.
  const complete =
    tickers.length > 0 &&
    tickers.every((t) => t.marked && t.qtyMatchesBroker !== false);

  return {
    tickers,
    lots: open.length,
    shares: tickers.reduce((a, t) => a + t.shares, 0),
    // The cost of the shares whose cost is KNOWN. `unknownCostShares` says how
    // many are missing from it, so the figure is never read as the whole book
    // when it is not.
    basis: totalBasis,
    unknownCostShares,
    markedBasis,
    unmarkedBasis: totalBasis - markedBasis,
    marketValue: complete ? marketValue : null,
    // null, never 0, when it cannot be computed for the whole book. Zero is a
    // statement about a portfolio; "not priced" is not that statement.
    unrealized: complete ? unrealized : null,
    complete,
    // Named so the screen can say WHICH position, and WHY.
    unmarked: tickers.filter((t) => !t.marked).map((t) => t.ticker),
    noPrice: tickers.filter((t) => t.reason === "no-price").map((t) => t.ticker),
    // The ledger says these shares are held and the broker's position list does
    // not contain them. That is a reconciliation failure -- the mirror of
    // `stranded` -- and it was being reported as "no current price", which
    // describes a data gap and buries the more serious of the two.
    noPosition: tickers.filter((t) => t.reason === "no-position").map((t) => t.ticker),
    noCost: tickers.filter((t) => t.reason === "no-cost").map((t) => t.ticker),
    collided: tickers.filter((t) => t.reason === "collision").map((t) => t.ticker),
    mismatched: tickers.filter((t) => t.qtyMatchesBroker === false).map((t) => t.ticker),
    stranded
  };
}

/**
 * The option legs on their own -- what "Premium only" reports.
 *
 * Deliberately NOT `realized_pl`, which already carries the share result of
 * every disposed lot. The two must be separable or the switch means nothing.
 */
export function premiumOnly(trades) {
  const rows = (trades || []).filter((t) => t && t.close_date);
  return rows.reduce(
    (a, t) => a + (num(t.premium_pl) || 0) + (num(t.early_close_pl) || 0),
    0
  );
}

/** The realized share result carried on the trade rows, as its own line. */
export function realizedShares(trades) {
  const rows = (trades || []).filter((t) => t && t.close_date);
  return rows.reduce((a, t) => a + (num(t.stock_pl) || 0), 0);
}
