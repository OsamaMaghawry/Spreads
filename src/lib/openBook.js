// The shares an account still holds, and what they are worth now.
//
// THE DEFECT THIS EXISTS FOR. `computeStats` reads `trade_records` and nothing
// else. A share lot acquired by assignment and not yet sold has `realized_pl`
// null by construction, so it contributes zero to every figure on the Analysis
// screen -- and on a wheel account those lots are not an edge case, they are
// where the outcome lives.
//
// Measured on a real staging account: seven lots, 700 shares, $129,700 of cost,
// held up to seven weeks, against $1,737 of reported P/L. The account was up
// roughly $11,000. The product reported $1,737 and discarded the rest.
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
// reports "TSLA". Same rule the close planner uses.
const baseTicker = (t) => String(t || "").replace(/\d+$/, "").toUpperCase();

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
  for (const r of brokerRows || []) {
    if (!r || r.assetClass !== "equity") continue;
    const q = num(r.qty) || 0;
    if (q <= 0) continue;
    marks[baseTicker(r.ticker || r.symbol)] = {
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
      ticker: key, lots: 0, shares: 0, basis: 0, basisKnown: true,
      acquired: [], mark: null, marketValue: null, unrealized: null, marked: false
    };
    cur.lots += 1;
    cur.shares += qty;
    if (basis === null) cur.basisKnown = false;
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
    if (m && m.price !== null && m.price > 0 && t.basisKnown) {
      t.mark = m.price;
      t.marketValue = t.shares * m.price;
      t.unrealized = t.marketValue - t.basis;
      t.marked = true;
      // The broker holding a different quantity than the ledger is not a
      // rounding difference -- it means the two disagree about the position.
      // The mark is still shown; the total is not, because a total built on a
      // disagreement is a guess with a decimal point.
      t.qtyMatchesBroker = m.qty === t.shares;
      t.brokerQty = m.qty;
    } else {
      t.marked = false;
      t.qtyMatchesBroker = null;
      t.brokerQty = m ? m.qty : null;
    }
  }

  const tickers = [...byTicker.values()].sort((a, b) => (b.basis || 0) - (a.basis || 0));

  const totalBasis = tickers.reduce((a, t) => a + (t.basis || 0), 0);
  const markedBasis = tickers.reduce((a, t) => a + (t.marked ? t.basis : 0), 0);
  const unrealized = tickers.reduce((a, t) => a + (t.marked ? t.unrealized : 0), 0);
  const marketValue = tickers.reduce((a, t) => a + (t.marked ? t.marketValue : 0), 0);

  // COVERAGE IS IN BASIS DOLLARS, NOT LOT COUNT, and that is deliberate: "6 of
  // 7 lots marked" reads as almost complete while a $32,000 position hides
  // inside the one that is missing.
  const complete =
    tickers.length > 0 &&
    tickers.every((t) => t.marked && t.qtyMatchesBroker !== false);

  return {
    tickers,
    lots: open.length,
    shares: tickers.reduce((a, t) => a + t.shares, 0),
    basis: totalBasis,
    markedBasis,
    unmarkedBasis: totalBasis - markedBasis,
    marketValue: complete ? marketValue : null,
    // null, never 0, when it cannot be computed for the whole book. Zero is a
    // statement about a portfolio; "not priced" is not that statement.
    unrealized: complete ? unrealized : null,
    complete,
    // Named so the screen can say WHICH position it could not price.
    unmarked: tickers.filter((t) => !t.marked).map((t) => t.ticker),
    mismatched: tickers.filter((t) => t.qtyMatchesBroker === false).map((t) => t.ticker)
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
