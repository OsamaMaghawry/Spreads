// Rebuilding closed trades from a broker activity feed.
//
// Pure functions, no network and no Deno APIs, so this can be run against
// recorded fixtures. That matters more here than in most modules: the previous
// version of this logic was wrong in three ways that only showed up against
// real positions, and the fixtures in tradeReconstruction.test.ts are those
// exact positions.
//
// The three defects, all confirmed against live records:
//   1. Assignment and exercise were never fetched, so an assigned spread
//      produced no record at all.
//   2. Stock fills were discarded, so the shares delivered on assignment and
//      their later disposal never entered the system.
//   3. A short paired to the first protective long found rather than the
//      nearest one, which invented spreads that were never traded, orphaned
//      real shorts into "naked" losses, and dropped the leftover long's cost.

import { parseOCCSymbol } from "./occ.ts";

export const CONTRACT_SIZE = 100;

// Assignment and exercise both move shares at the option's strike. Which
// direction depends only on whether the leg was short and whether it was a
// call — the activity type is redundant (you are assigned on a short, you
// exercise a long) but is kept for the lot's provenance.
//
//   short call  -> shares are called away      -> sell at strike
//   short put   -> shares are put to you       -> buy at strike
//   long call   -> you exercise to buy         -> buy at strike
//   long put    -> you exercise to sell        -> sell at strike
function shareSide(isShort, isCall) {
  const buying = isShort ? !isCall : isCall;
  return buying ? "buy" : "sell";
}

const dayOf = (a) => (a.transaction_time || "").substring(0, 10) || a.date || "";

// A chain id ties an option to the shares its assignment produced. Derived
// from the symbol and the event date rather than randomly generated, so a
// re-sync reproduces the same value instead of orphaning the link each time.
const chainKeyFor = (symbol, date) => `${symbol}@${date}`;

// ---------------------------------------------------------------------------
// 1. Option lots
// ---------------------------------------------------------------------------

// Walks each option symbol's events in time order and produces closed lots.
// Also emits the share movements that assignment and exercise cause, which is
// the only place they can be derived from with certainty: the broker's own
// stock-side representation of a delivery varies, but "a short call assigned
// at 470 sold 100 shares at 470" is definitional.
export function reconstructOptionLots(activities, orderStrategy = {}) {
  const bySymbol = {};
  activities.forEach((a) => {
    if (!a.symbol || !parseOCCSymbol(a.symbol)) return;
    (bySymbol[a.symbol] = bySymbol[a.symbol] || []).push(a);
  });

  const closedLots = [];
  const shareMoves = [];

  Object.keys(bySymbol).forEach((symbol) => {
    const parsed = parseOCCSymbol(symbol);
    const events = bySymbol[symbol].slice().sort((x, y) => {
      const tx = x.transaction_time || (x.date ? `${x.date}T23:59:59Z` : "");
      const ty = y.transaction_time || (y.date ? `${y.date}T23:59:59Z` : "");
      return tx.localeCompare(ty);
    });

    let position = 0;
    let openLots = [];

    const push = (lot, closePrice, closeDate, closeReason, chainKey = null) =>
      closedLots.push({
        symbol,
        parsed,
        qty: lot.qty,
        openPrice: lot.price,
        closePrice,
        openDate: lot.date,
        closeDate,
        short: lot.short,
        closeReason,
        chainKey,
        strategy: lot.strategy
      });

    // Assignment and exercise can be partial in a way expiration cannot, so
    // they close a specific number of contracts FIFO. Expiration keeps its
    // original close-everything behaviour: it always takes the whole position,
    // and the existing records built that way are correct.
    const closeSome = (contracts, date, reason) => {
      let remaining = contracts;
      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0];
        const q = Math.min(lot.qty, remaining);
        const chainKey = chainKeyFor(symbol, date);
        push({ ...lot, qty: q }, 0, date, reason, chainKey);
        shareMoves.push({
          ticker: parsed.ticker,
          date,
          side: shareSide(lot.short, parsed.type === "C"),
          qty: q * CONTRACT_SIZE,
          price: parsed.strike,
          source: lot.short ? "assignment" : "exercise",
          chainKey
        });
        lot.qty -= q;
        remaining -= q;
        position += lot.short ? q : -q;
        if (lot.qty === 0) openLots.shift();
      }
    };

    events.forEach((a) => {
      const type = a.activity_type;

      if (type === "OPEXP") {
        openLots.forEach((lot) => push(lot, 0, a.date, "expired"));
        openLots = [];
        position = 0;
        return;
      }

      if (type === "OPASN" || type === "OPEXC") {
        const raw = Math.abs(parseFloat(a.qty));
        const contracts = Number.isFinite(raw) && raw > 0
          ? raw
          : openLots.reduce((n, l) => n + l.qty, 0);
        closeSome(contracts, a.date || dayOf(a), type === "OPASN" ? "assigned" : "exercised");
        return;
      }

      const qty = Math.abs(parseFloat(a.qty));
      const price = parseFloat(a.price);
      const date = dayOf(a);
      const delta = a.side === "buy" ? qty : -qty;
      const strategy = orderStrategy[a.order_id] || "unknown";

      if (position === 0 || delta > 0 === position > 0) {
        openLots.push({ qty, price, date, short: delta < 0, strategy });
        position += delta;
      } else {
        let remaining = qty;
        while (remaining > 0 && openLots.length > 0) {
          const lot = openLots[0];
          const q = Math.min(lot.qty, remaining);
          push({ ...lot, qty: q }, price, date, "closed");
          lot.qty -= q;
          remaining -= q;
          position += lot.short ? q : -q;
          if (lot.qty === 0) openLots.shift();
        }
        if (remaining > 0) {
          openLots.push({ qty: remaining, price, date, short: delta < 0, strategy });
          position += delta > 0 ? remaining : -remaining;
        }
      }
    });
  });

  return { closedLots, shareMoves };
}

// ---------------------------------------------------------------------------
// 2. Shares
// ---------------------------------------------------------------------------

// Stock fills the account actually placed. Anything that fails OCC parsing is
// a stock symbol — previously these were dropped on the floor, which is why a
// share sale after assignment never reached the ledger.
export function stockFillMoves(activities) {
  return activities
    .filter((a) => a.activity_type === "FILL" && a.symbol && !parseOCCSymbol(a.symbol))
    .map((a) => ({
      ticker: a.symbol,
      date: dayOf(a),
      side: a.side === "buy" ? "buy" : "sell",
      qty: Math.abs(parseFloat(a.qty)),
      price: parseFloat(a.price),
      source: "trade",
      chainKey: null
    }))
    .filter((m) => Number.isFinite(m.qty) && Number.isFinite(m.price) && m.qty > 0);
}

const moveIdentity = (m) => `${m.ticker}|${m.date}|${m.side}|${m.qty}|${m.price}`;

// Some brokers report an assignment delivery as a stock fill as well as an
// option activity. Counting both would double the position, so a fill that
// matches a delivery exactly — same ticker, day, direction, size and a price
// equal to the strike — is treated as the same event, and the option-derived
// one wins because it carries the chain link.
export function mergeShareMoves(optionDerived, fills) {
  const seen = new Set(optionDerived.map(moveIdentity));
  return optionDerived
    .concat(fills.filter((m) => !seen.has(moveIdentity(m))))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// FIFO lots per ticker. A 100-share lot sold in two 50-share sales becomes two
// rows, so each disposal carries its own basis.
//
// Two things are deliberately not smoothed over. Shares still held produce a
// row with null disposal fields and null realized_pl — unrealized results must
// never be booked. A sale with no matching acquisition (the purchase predates
// the activity window, or it was a short sale) produces a row with null
// acquisition instead of a fabricated basis.
export function buildStockLedger(moves) {
  const byTicker = {};
  moves.forEach((m) => (byTicker[m.ticker] = byTicker[m.ticker] || []).push(m));

  const lots = [];
  const keyCounts = new Map();
  const emit = (row) => {
    const base = [
      row.ticker,
      row.acquired_date || "?",
      row.acquired_price ?? "?",
      row.disposed_date || "open",
      row.disposed_price ?? "",
      row.qty
    ].join("|");
    const n = keyCounts.get(base) || 0;
    keyCounts.set(base, n + 1);
    lots.push({ ...row, lot_key: n === 0 ? base : `${base}#${n}` });
  };

  Object.keys(byTicker).forEach((ticker) => {
    // Acquisitions before disposals within the same day. An assignment and the
    // exercise that covers it settle together, and reading the sale first would
    // invent a short position and lose the basis. FIFO is unaffected: a lot
    // added today goes to the back of the queue, so an older holding is still
    // consumed first.
    const events = byTicker[ticker]
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1));
    let open = [];

    events.forEach((m) => {
      if (m.side === "buy") {
        open.push({ ...m });
        return;
      }
      let remaining = m.qty;
      while (remaining > 0 && open.length > 0) {
        const lot = open[0];
        const q = Math.min(lot.qty, remaining);
        emit({
          ticker,
          qty: q,
          chain_id: lot.chainKey || m.chainKey || null,
          acquired_date: lot.date,
          acquired_price: lot.price,
          acquired_source: lot.source,
          disposed_date: m.date,
          disposed_price: m.price,
          disposed_source: m.source,
          realized_pl: (m.price - lot.price) * q
        });
        lot.qty -= q;
        remaining -= q;
        if (lot.qty === 0) open.shift();
      }
      if (remaining > 0) {
        emit({
          ticker,
          qty: remaining,
          chain_id: m.chainKey || null,
          acquired_date: null,
          acquired_price: null,
          acquired_source: null,
          disposed_date: m.date,
          disposed_price: m.price,
          disposed_source: m.source,
          realized_pl: null
        });
      }
    });

    open.forEach((lot) =>
      emit({
        ticker,
        qty: lot.qty,
        chain_id: lot.chainKey || null,
        acquired_date: lot.date,
        acquired_price: lot.price,
        acquired_source: lot.source,
        disposed_date: null,
        disposed_price: null,
        disposed_source: null,
        realized_pl: null
      })
    );
  });

  // Share balance as of a date, which is what decides whether an orphaned
  // short call was a covered call or a broken spread leg.
  const sharesHeldAt = (ticker, date) =>
    (byTicker[ticker] || [])
      .filter((m) => !date || m.date <= date)
      .reduce((n, m) => n + (m.side === "buy" ? m.qty : -m.qty), 0);

  return { lots, sharesHeldAt };
}

// ---------------------------------------------------------------------------
// 3. Trades
// ---------------------------------------------------------------------------

const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000) || 0;
};

// Legs of one spread close together, but assignment on the short and exercise
// on the long can be stamped a day apart. Both legs already share a ticker,
// type and expiry by the time this is asked, so allowing that skew when
// neither leg was closed on the market cannot pair unrelated positions.
const closesTogether = (s, l) =>
  s.closeDate === l.closeDate || (s.closeReason !== "closed" && l.closeReason !== "closed");

// The nearest protective long, not the first one found. With shorts at 362.50
// and 367.50 and longs at 365 and 370, taking the first match gave the 362.50
// short a 7.50-wide spread that was never traded, orphaned the 367.50 short,
// and dropped the 365 long's cost entirely.
function nearestLong(short, longs) {
  const eligible = longs.filter(
    (l) =>
      l.left > 0 &&
      l.parsed.ticker === short.parsed.ticker &&
      l.parsed.expiry === short.parsed.expiry &&
      l.parsed.type === short.parsed.type &&
      (short.parsed.type === "C"
        ? l.parsed.strike > short.parsed.strike
        : l.parsed.strike < short.parsed.strike) &&
      closesTogether(short, l)
  );
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => {
    const byStrike =
      Math.abs(a.parsed.strike - short.parsed.strike) - Math.abs(b.parsed.strike - short.parsed.strike);
    if (byStrike !== 0) return byStrike;
    return daysBetween(a.openDate, short.openDate) - daysBetween(b.openDate, short.openDate);
  })[0];
}

// A record's close reason when two legs end differently. Assignment is the
// economically meaningful event, so it wins over a long leg's exercise; a leg
// actually bought back on the market makes the whole thing a close.
function combineReasons(shortReason, longReason) {
  if (shortReason === "closed" || longReason === "closed") return "closed";
  if (shortReason === "assigned" || longReason === "assigned") return "assigned";
  if (shortReason === "exercised" || longReason === "exercised") return "exercised";
  return "expired";
}

// Orphan-means-wheel is right often enough that dozens of cash-secured puts
// classify correctly, so the fallback stays — it just needs the one signal it
// was missing.
//
//   orphaned short put  -> a genuine cash-secured put
//   orphaned short call -> a broken pair, unless the shares to cover it were
//                          actually held, which makes it a covered call
//
// An explicit strategy prefix on the order always wins over shape.
function classifyOrphanShort(lot, sharesHeldAt) {
  if (lot.strategy === "wheel") return { strategy: "wheel", unpaired: false };
  if (lot.strategy === "spreads") return { strategy: "spreads", unpaired: true };
  if (lot.parsed.type === "P") return { strategy: "wheel", unpaired: false };
  const held = sharesHeldAt(lot.parsed.ticker, lot.openDate);
  return held >= lot.qty * CONTRACT_SIZE
    ? { strategy: "wheel", unpaired: false }
    : { strategy: "spreads", unpaired: true };
}

export function buildTrades(closedLots, sharesHeldAt, accountId) {
  const trades = [];
  // Where a pair's two legs each produced shares, both sets belong to one
  // chain, so the long leg's chain id is rewritten to the short's.
  const chainRemap = new Map();

  const shortLeg = (l, strategy, unpaired) => ({
    account_id: accountId,
    strategy,
    unpaired,
    chain_id: l.chainKey || null,
    ticker: l.parsed.ticker,
    expiry: l.parsed.expiryFormatted,
    short_symbol: l.symbol,
    long_symbol: "",
    short_strike: l.parsed.strike,
    long_strike: 0,
    qty: l.qty,
    open_date: l.openDate,
    close_date: l.closeDate,
    short_entry: l.openPrice,
    long_entry: 0,
    short_exit: l.closePrice,
    long_exit: 0,
    close_reason: l.closeReason
  });

  // A long with no short to protect is evidence of a defect, and its cost is
  // real money. Writing it into the long fields with an empty short leg makes
  // the generic P/L formula produce exactly (exit - entry) * qty * 100, so the
  // cost lands in the totals instead of disappearing.
  const longLeg = (l) => ({
    account_id: accountId,
    strategy: l.strategy === "unknown" ? "spreads" : l.strategy,
    unpaired: true,
    chain_id: l.chainKey || null,
    ticker: l.parsed.ticker,
    expiry: l.parsed.expiryFormatted,
    short_symbol: "",
    long_symbol: l.symbol,
    short_strike: 0,
    long_strike: l.parsed.strike,
    qty: l.qty,
    open_date: l.openDate,
    close_date: l.closeDate,
    short_entry: 0,
    long_entry: l.openPrice,
    short_exit: 0,
    long_exit: l.closePrice,
    close_reason: l.closeReason
  });

  ["spreads", "wheel", "unknown"].forEach((strategy) => {
    const lots = closedLots.filter((l) => l.strategy === strategy);
    const shorts = lots.filter((l) => l.short).map((l) => ({ ...l, left: l.qty }));
    const longs = lots.filter((l) => !l.short).map((l) => ({ ...l, left: l.qty }));
    const pairSpreads = strategy !== "wheel";

    if (pairSpreads) {
      shorts.forEach((s) => {
        while (s.left > 0) {
          const l = nearestLong(s, longs);
          if (!l) break;
          const q = Math.min(s.left, l.left);
          const chainId = s.chainKey || l.chainKey || null;
          if (s.chainKey && l.chainKey && l.chainKey !== s.chainKey) {
            chainRemap.set(l.chainKey, s.chainKey);
          }
          trades.push({
            account_id: accountId,
            strategy: strategy === "unknown" ? "spreads" : strategy,
            unpaired: false,
            chain_id: chainId,
            ticker: s.parsed.ticker,
            expiry: s.parsed.expiryFormatted,
            short_symbol: s.symbol,
            long_symbol: l.symbol,
            short_strike: s.parsed.strike,
            long_strike: l.parsed.strike,
            qty: q,
            open_date: s.openDate < l.openDate ? s.openDate : l.openDate,
            close_date: s.closeDate,
            short_entry: s.openPrice,
            long_entry: l.openPrice,
            short_exit: s.closePrice,
            long_exit: l.closePrice,
            close_reason: combineReasons(s.closeReason, l.closeReason)
          });
          s.left -= q;
          l.left -= q;
        }
      });
    }

    shorts
      .filter((s) => s.left > 0)
      .forEach((s) => {
        const lot = { ...s, qty: s.left };
        const { strategy: resolved, unpaired } = classifyOrphanShort(lot, sharesHeldAt);
        trades.push(shortLeg(lot, resolved, unpaired));
      });

    longs.filter((l) => l.left > 0).forEach((l) => trades.push(longLeg({ ...l, qty: l.left })));
  });

  return { trades, chainRemap };
}

// ---------------------------------------------------------------------------
// 4. Merge and price
// ---------------------------------------------------------------------------

// Several fills of the same spread on the same day are one trade, averaged by
// size.
//
// The close reason is part of the key, not something merged away. Three
// contracts where one is assigned and two expire are two different outcomes on
// the same day — one delivered shares and one did not — and folding them into
// a single row loses the count that the share ledger has to agree with.
export function mergeAndPrice(trades) {
  const merged = {};
  trades.forEach((t) => {
    const key = `${t.strategy}|${t.short_symbol}|${t.long_symbol}|${t.close_date}|${t.close_reason}`;
    const m = merged[key];
    if (!m) {
      merged[key] = { ...t, trade_key: key };
      return;
    }
    const tot = m.qty + t.qty;
    ["short_entry", "long_entry", "short_exit", "long_exit"].forEach((f) => {
      m[f] = (m[f] * m.qty + t[f] * t.qty) / tot;
    });
    m.qty = tot;
    m.open_date = m.open_date < t.open_date ? m.open_date : t.open_date;
  });

  return Object.values(merged).map((t) => {
    const netCredit = t.short_entry - t.long_entry;
    const closeDebit = t.short_exit - t.long_exit;
    return {
      ...t,
      net_credit: netCredit,
      close_debit: closeDebit,
      realized_pl: (netCredit - closeDebit) * t.qty * CONTRACT_SIZE
    };
  });
}

// ---------------------------------------------------------------------------
// Everything, in the one order the steps can run in: option lots produce the
// share movements, the share ledger answers whether an orphaned call was
// covered, and only then can the trades be classified.
// ---------------------------------------------------------------------------

export function reconstruct(activities, orderStrategy, accountId) {
  const { closedLots, shareMoves } = reconstructOptionLots(activities, orderStrategy);
  const moves = mergeShareMoves(shareMoves, stockFillMoves(activities));
  const { lots, sharesHeldAt } = buildStockLedger(moves);
  const { trades, chainRemap } = buildTrades(closedLots, sharesHeldAt, accountId);

  const stockLots = lots.map((l) => ({
    ...l,
    account_id: accountId,
    chain_id: (l.chain_id && chainRemap.get(l.chain_id)) || l.chain_id
  }));

  return { records: mergeAndPrice(trades), stockLots };
}
