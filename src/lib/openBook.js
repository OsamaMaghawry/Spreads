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

/**
 * Share results that reached NO trade row, so no statistic on this page counts
 * them.
 *
 * `tradeReconstruction.ts:1030` — `orphaned += lot.realized_pl` — is reached
 * when a disposed lot's owning option cannot be resolved: shares bought or sold
 * outside DeltaMint, an activity feed that starts mid-position, a chain the
 * pairing could not close. That money is real, it is in the account, and it is
 * in no `stock_pl`, so every figure built from trade rows is short by exactly
 * this amount.
 *
 * It was surfaced only in the admin rebuild preview. On Analysis it was the
 * difference between two numbers on the same screen with nothing to explain it
 * — the daily chart reads the lots directly and sees it, the headline reads the
 * trade rows and does not. Unbounded, not a rounding term.
 *
 * Computed as a DIFFERENCE rather than by re-deriving ownership, because
 * ownership lives in the reconstruction and a second implementation of it here
 * would be a second thing to keep right.
 */
export function orphanedShares(stockLots, trades) {
  const lotTotal = (stockLots || [])
    .filter((l) => l && l.disposed_date)
    .reduce((a, l) => a + (num(l.realized_pl) || 0), 0);
  return lotTotal - realizedShares(trades);
}

// `viewCurve` and `viewBreakdown` used to live here and are gone.
//
// `viewCurve` drew the cumulative closed-trade line plus one dashed step to
// today's mark -- the shape the owner called a pole. It is replaced by
// `dailySeries` in src/lib/equityCurve.js, which reads the stored daily series
// `equityHistory` writes: a real mark for every day, so the share appreciation
// arrives over the weeks it accrued instead of in one vertical line. The
// strategy-tab fallback that still needs a booked-money line is `bookedCurve`
// in the same module, and it draws no mark leg at all.
//
// `viewBreakdown` re-bucketed the month and ticker tables under Premium only,
// because `computeStats` summed `realized_pl` whichever view was selected.
// `computeStats` now takes the view itself and buckets correctly at the source,
// so a second pass over the same trades to correct the first one is no longer a
// thing that exists.

/**
 * The OPTION positions still open, and what they are worth now.
 *
 * THE DEFECT THIS EXISTS FOR. The owner, 11 Sep, on his own TSLA book: *"did
 * you add the Put position that is open now? You included only the long
 * position but I don't think the Long Put is in the analysis. Also, make sure
 * the analysis has the open positions too, not only the closed ones."*
 *
 * He is right, and it was not one position. `openBook` above reads `stock_lots`
 * and marks held SHARES; `computeStats` reads `trade_records` and every row
 * there has a `close_date` by construction. So an option position that is still
 * open appears in NEITHER, and on the live account that is five of them:
 *
 *   TSLA 365P   long 1    paid $435   worth $420    -$15   <- the one he asked about
 *   TSLA 352.5C long 1    paid $1,357 worth $1,785  +$428
 *   TSLA 375C   short 1   took $226   costs $299    -$73
 *   TSLA 362.5C short 2   took $1,738 costs $2,420  -$682
 *   NVDA 222.5P short 3   took $123   costs $171    -$48
 *
 * Net -$390 of live P/L that no figure on the Analysis page contained, on a
 * book whose headline called itself "the wheel as one strategy". The TSLA
 * structure is the whole point: 210 shares, a long put protecting them, and
 * short calls written against them. Counting the shares and dropping the legs
 * describes a position nobody holds.
 *
 * WHERE THE MARK COMES FROM. The same place the share marks come from, and it
 * was already arriving: `brokerView(positions)` in the `syncAccounts` payload
 * carries `costBasis`, `marketValue` and the broker's own `unrealizedPL` for
 * every position, option and equity alike. No new request and no new price
 * source.
 *
 * SIGNS. A short option has a NEGATIVE cost basis (a credit received) and a
 * negative market value (a liability). `marketValue - costBasis` is therefore
 * correct for both sides without a special case: the TSLA 375C above is
 * -299 - (-226) = -$73, a loss, which is what it is. Do not "fix" this with an
 * abs() -- that is the sign error that printed a loss as a gain once already.
 */
export function openOptions(brokerRows) {
  const rows = (brokerRows || []).filter(
    (r) => r && r.assetClass === "option" && (num(r.qty) || 0) !== 0
  );

  const positions = rows.map((r) => {
    const cost = num(r.costBasis);
    const value = num(r.marketValue);
    // OURS, from cost and value, with the broker's own figure kept beside it.
    // Where the two disagree that disagreement is worth seeing -- the same rule
    // brokerView states for its own passthrough.
    const unrealized = cost === null || value === null ? null : value - cost;
    return {
      symbol: r.symbol,
      ticker: r.ticker,
      underlying: r.underlying,
      optionType: r.optionType,
      strike: r.strike,
      expiry: r.expiry,
      adjusted: !!r.adjusted,
      qty: num(r.qty) || 0,
      side: r.side,
      costBasis: cost,
      marketValue: value,
      unrealized,
      brokerUnrealized: num(r.unrealizedPL),
      marked: unrealized !== null
    };
  });

  const unmarked = positions.filter((p) => !p.marked);
  // Null, never zero, when any leg cannot be valued -- the same discipline the
  // share book applies. A partial total over a book with an unpriced leg is a
  // guess with a decimal point.
  const complete = positions.length > 0 && unmarked.length === 0;

  return {
    positions,
    count: positions.length,
    contracts: positions.reduce((a, p) => a + Math.abs(p.qty), 0),
    unrealized: complete ? positions.reduce((a, p) => a + p.unrealized, 0) : null,
    // What was paid out and taken in, net, to put these on. Signed.
    costBasis: positions.reduce((a, p) => a + (p.costBasis || 0), 0),
    marketValue: complete ? positions.reduce((a, p) => a + p.marketValue, 0) : null,
    complete,
    unmarked: unmarked.map((p) => p.symbol)
  };
}

/**
 * The whole open book: shares and option legs together.
 *
 * One number for "what is the mark on everything still open", because the
 * headline needs one and computing it at the call site in two places is how
 * the two halves drift apart.
 *
 * Null when EITHER half is incomplete. A total that silently covered the shares
 * and quietly dropped an unpriced option leg would be the same defect this
 * whole panel exists to fix, one level up.
 */
export function openMark(shareBook, optionBook) {
  const shares = shareBook && shareBook.lots > 0 ? shareBook.unrealized : 0;
  const options = optionBook && optionBook.count > 0 ? optionBook.unrealized : 0;
  if (shares === null || options === null) return null;
  return shares + options;
}
