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

// Broad-based index options are cash-settled: exercise and assignment pay a
// difference in cash and no shares ever change hands.
//
// The reconstruction assumed every option delivers stock, so an assigned SPX
// spread produced a 100-share "SPX" lot with the strike as its cost -- a
// securities position that does not exist, carrying a basis that never
// existed. While the ledger dropped it as a null-basis lot the damage was
// invisible; once settlement day-skew was handled the legs paired, the
// fabricated lot resolved to a real number, and it began flowing into
// stock_pl, the record total, the equity curve and the exported report.
//
// These are also Section 1256 contracts -- 60/40 treatment and a year-end
// mark to market -- so they are not merely shareless, they are a different
// tax regime. Recording them as equity assignments is wrong twice over.
//
// Alpaca added SPX, SPXW, VIX, VIXW, DJX and XSP to the trading API in July
// 2026, paper-only at first, and this product syncs paper accounts.
export const CASH_SETTLED_ROOTS = new Set([
  "SPX", "SPXW", "XSP", "NDX", "NDXP", "RUT", "RUTW", "VIX", "VIXW", "DJX", "MRUT", "NANOS"
]);

export const isCashSettled = (ticker: string) =>
  CASH_SETTLED_ROOTS.has(String(ticker || "").toUpperCase());

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

// The money on a cash-settlement activity, read defensively.
//
// Alpaca's OPCSH payload could not be confirmed: docs.alpaca.markets is
// unreachable from this environment, so the field carrying the amount is read
// from the candidates its sibling non-trade activities use, in order of how
// specific they are. Returning null when none parses is the point -- a
// settlement whose amount we cannot read must be reported as unknown, never
// inferred as zero, because zero is a number a reader would believe.
export function cashAmountOf(a) {
  // parseFloat("-1,000.00") is -1, silently. Thousands separators are stripped
  // before parsing rather than trusted to a function that stops at the comma.
  const num = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const cleaned = v.replace(/[$\s,]/g, "");
    if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  for (const field of ["net_amount", "amount", "cash_amount", "settlement_amount"]) {
    const v = num(a?.[field]);
    if (v !== null) return v;
  }
  // A per-contract amount, which needs the quantity to become a total.
  //
  // `price` is deliberately NOT a candidate. Every OPEXP, OPASN and OPEXC
  // fixture in this repo carries price "0", which would make an unreadable
  // settlement report a confident $0 -- and if OPCSH instead carries the
  // settlement index level there, a 5185 settle would read as $518,500.
  // per_share_amount is the only per-unit field specific enough to trust.
  const per = num(a?.per_share_amount);
  const qty = Math.abs(num(a?.qty) ?? NaN);
  if (per !== null && Number.isFinite(qty) && qty > 0) return per * qty * CONTRACT_SIZE;
  return null;
}

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
  const cashSettlements = [];
  // Share legs this code will not invent a figure for.
  const unreconstructable = [];

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
        // NOTE: a guard here suppressing the share move for cash-settled
        // contracts was reverted, because it removed the settlement rather
        // than the phantom.
        //
        // closeSome closes the option lot at price 0 deliberately: for an
        // equity option the economics arrive afterwards, through the share
        // round-trip. For an index spread that round-trip -- buy 100 at the
        // short strike, sell 100 at the long -- nets exactly the width, which
        // IS the cash settlement. The figure was right by the wrong mechanism.
        // Suppressing the move left the premium alone on the record, so an
        // SPXW 5200/5190 spread settling at maximum loss reported +$400
        // instead of -$600: $1,000 per contract, in the user's favour, on the
        // worst outcome, with every flag reading clean.
        //
        // So the move stays until the settlement is booked properly.
        // isCashSettled below is still the right classification and is what a
        // real fix will key on. This state is cosmetically wrong -- it records
        // a share position that never existed, in an instrument under a
        // different tax regime -- and financially right, which is the safer of
        // the two.
        // An adjusted contract's deliverable is unknown, so there is no share
        // move to derive.
        //
        // Both previous attempts asserted something instead of nothing. Keyed
        // by the plain underlying, a fabricated "100 shares at the strike"
        // consumed the account's real lots FIFO. Keyed by the adjusted root it
        // stopped doing that and started something worse: the assignment
        // booked under AAPL1, the broker's real sale arrived under AAPL, the
        // two books never met, and a position that lost $700 reported +$300 --
        // premium only, permanently, with a share lot that could never be
        // disposed and a `provisional` flag that could never clear.
        //
        // So nothing is derived. The premium is real and stays; the share leg
        // is recorded as unreconstructable and raised to operators, which is
        // what "we do not know" looks like when the alternative is a number
        // that is wrong in the user's favour.
        if (parsed.adjusted) {
          unreconstructable.push({
            symbol,
            ticker: parsed.ticker,
            date,
            qty: q,
            reason: "adjusted contract — deliverable unknown"
          });
          lot.qty -= q;
          remaining -= q;
          position += lot.short ? q : -q;
          if (lot.qty === 0) openLots.shift();
          continue;
        }

        shareMoves.push({
          ticker: parsed.ticker,
          date,
          side: shareSide(lot.short, parsed.type === "C"),
          qty: q * CONTRACT_SIZE,
          price: parsed.strike,
          source: lot.short ? "assignment" : "exercise",
          chainKey,
          // Which contract moved these shares. Attribution needs to know that
          // and cannot recover it later: the chain id is rewritten when a
          // pair's two legs are merged into one chain, which is precisely the
          // case that needs telling apart.
          option: symbol
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

      // A cash settlement is RECORDED here and closes nothing.
      //
      // It was briefly wired into closeSome, and that was wrong in a way worth
      // writing down. closeSome books a share round-trip at the strikes, which
      // is a maximum-loss outcome -- correct only because OPASN and OPEXC mean
      // the broker has already asserted the option finished in the money.
      // OPCSH asserts nothing about moneyness: an index option cash-settles
      // whether it finished in or out. Pointing a moneyness-agnostic event at
      // a mechanism whose correctness depends on moneyness produced, on an
      // index settling BETWEEN the strikes -- an ordinary outcome -- a +$400
      // record on a true -$100, with every flag reading clean. Out of the
      // money in both legs it would report -$600 on a +$400 maximum win.
      //
      // The position still closes through its own OPEXP, OPASN or OPEXC,
      // which are verified. What arrives here is the broker's stated cash
      // amount, kept for reconciliation only.
      //
      // Nothing consumes it on the write path. tradeHistory requests OPCSH in
      // its own request, so what arrives here reaches the audit comparison and
      // nothing else -- which is the whole point while the field names and the
      // sign convention are unconfirmed by any documentation reachable from
      // here. A settlement sign read backwards is a two-way error, so it is
      // shown to a person rather than added to anything.
      if (type === "OPCSH") {
        cashSettlements.push({
          symbol,
          ticker: parsed.ticker,
          date: a.date || dayOf(a),
          qty: Math.abs(parseFloat(a.qty)) || 0,
          amount: cashAmountOf(a),
          raw: a
        });
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

      // Only a fill opens or closes a lot. Everything above returns, and this
      // used to take whatever was left -- so any activity type added to the
      // request later, or invented by the broker, would be read as a trade at
      // parseFloat(undefined) and open a lot of NaN contracts that poisons
      // every figure derived from it. An unrecognised event is not a trade.
      if (type !== "FILL") return;

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

  return { closedLots, shareMoves, cashSettlements, unreconstructable };
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
      chainKey: null,
      // A trade on the market was moved by nobody's contract.
      option: null
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

// True when an option put these shares into the account or took them out. It is
// the boundary of what this product reports on.
//
// An account's ordinary investing runs through the same activity feed: on the
// live account that is 1,995 lots across 310 tickers and $19,660 of results
// that no spread or wheel produced. Every one of them used to land on the trade
// history page. Worse, the feed is finite, so purchases old enough to fall off
// the end left their sales unmatched — which is what put "still held" on shares
// that were sold years ago.
//
// The whole history is still walked, because the basis of a called-away lot may
// be a purchase made long before any option existed. Only lots an option
// touched are reported.
const fromOption = (lot) =>
  lot.acquired_source === "assignment" ||
  lot.acquired_source === "exercise" ||
  lot.disposed_source === "assignment" ||
  lot.disposed_source === "exercise";

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

    // Settlement can straddle midnight. On a call spread the short's
    // assignment SELLS the shares and the long's exercise BUYS them, and the
    // broker may stamp the two a day apart -- the same skew `closesTogether`
    // already allows when pairing the legs. Ordering strictly by date then put
    // the sale first with nothing open to draw on: it emitted a null-basis lot
    // that attribution skips, the next day's purchase became an open lot that
    // `fromOption` discards, and a -$212 loss was reported as a +$38 gain with
    // orphanedStockPL still reading zero. Nothing flagged it.
    //
    // So an option-settled buy is pulled ahead of an option-settled sell it is
    // covering, when the two are within a day and no lot is open to satisfy
    // the sale. Trades on the market are untouched: only assignment and
    // exercise settle as one event across two stamps.
    const optionSettled = (m) => m.source === "assignment" || m.source === "exercise";
    for (let i = 0; i < events.length; i++) {
      const sell = events[i];
      if (sell.side !== "sell" || !optionSettled(sell)) continue;
      const boughtBefore = events
        .slice(0, i)
        .reduce((n, m) => n + (m.side === "buy" ? m.qty : -m.qty), 0);
      if (boughtBefore >= sell.qty) continue;
      const j = events.findIndex(
        (m, k) =>
          k > i &&
          m.side === "buy" &&
          optionSettled(m) &&
          Math.abs(Date.parse(m.date) - Date.parse(sell.date)) <= 86400000
      );
      if (j > -1) events.splice(i, 0, events.splice(j, 1)[0]);
    }

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
          // Both sides, separately. A wheel cycle acquires through an assigned
          // put and disposes through an assigned call, and one field cannot say
          // that — which is exactly the sentence the attribution needs.
          acquired_chain_id: lot.chainKey || null,
          disposed_chain_id: m.chainKey || null,
          chain_id: lot.chainKey || m.chainKey || null,
          acquired_date: lot.date,
          acquired_price: lot.price,
          acquired_source: lot.source,
          acquired_option: lot.option || null,
          disposed_date: m.date,
          disposed_price: m.price,
          disposed_source: m.source,
          disposed_option: m.option || null,
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
          acquired_chain_id: null,
          disposed_chain_id: m.chainKey || null,
          chain_id: m.chainKey || null,
          acquired_date: null,
          acquired_price: null,
          acquired_source: null,
          acquired_option: null,
          disposed_date: m.date,
          disposed_price: m.price,
          disposed_source: m.source,
          disposed_option: m.option || null,
          realized_pl: null
        });
      }
    });

    open.forEach((lot) =>
      emit({
        ticker,
        qty: lot.qty,
        acquired_chain_id: lot.chainKey || null,
        disposed_chain_id: null,
        chain_id: lot.chainKey || null,
        acquired_date: lot.date,
        acquired_price: lot.price,
        acquired_source: lot.source,
        acquired_option: lot.option || null,
        disposed_date: null,
        disposed_price: null,
        disposed_source: null,
        disposed_option: null,
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

  return { lots: lots.filter(fromOption), allLots: lots, sharesHeldAt };
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
// A put and a call used to come back as the same answer, "wheel". They are the
// two halves of a cycle — one takes delivery, the other gives it away — so
// merging them hid the only distinction worth having when reading a cycle back.
//
// An explicit strategy prefix on the order still wins over shape, but a prefix
// only says "wheel": which half it is, is the option's own business.
const wheelHalf = (lot) => (lot.parsed.type === "P" ? "cash_secured_put" : "covered_call");

function classifyOrphanShort(lot, sharesHeldAt) {
  if (lot.strategy === "wheel") return { strategy: wheelHalf(lot), unpaired: false };
  if (lot.strategy === "spreads") return { strategy: "spreads", unpaired: true };
  if (lot.parsed.type === "P") return { strategy: "cash_secured_put", unpaired: false };
  const held = sharesHeldAt(lot.parsed.ticker, lot.openDate);
  return held >= lot.qty * CONTRACT_SIZE
    ? { strategy: "covered_call", unpaired: false }
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

  // Pair first, classify after.
  //
  // Pairing used to run *inside* each strategy bucket, so two legs of one
  // spread could only find each other if both had resolved to the same
  // strategy. They often do not: `orderStrategy` is filled from a 12-page
  // order sweep that is shallower than the activity feed, and legs opened by
  // separate orders resolve independently -- so one leg said "spreads" while
  // its partner, past the cap, said "unknown", and they were held in different
  // buckets where no amount of matching could bring them together. The
  // reported result was a naked short at +$500 instead of a 5-wide spread at
  // +$200, marked `unpaired: false` -- the flag that exists to catch exactly
  // this saying nothing was wrong.
  //
  // "spreads" and "unknown" are therefore one pool: an unknown leg is a leg
  // whose order we could not read, not a leg that belongs to nothing. "wheel"
  // stays apart because it is an explicit instruction from the order prefix
  // that these are single-leg positions, and pairing them would invent
  // spreads the trader never put on.
  [["spreads", "unknown"], ["wheel"]].forEach((bucket) => {
    const strategy = bucket[0];
    const lots = closedLots.filter((l) => bucket.includes(l.strategy));
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
// Negating zero gives -0, which survives arithmetic, storage and formatting
// all the way to a card reading "-$0.00" on a position that cost nothing to
// close. It is only ever an artefact of the sign flip, so it is removed here
// rather than papered over in a formatter.
const noNegZero = (n) => (n === 0 ? 0 : n);

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
    const scale = t.qty * CONTRACT_SIZE;
    return {
      ...t,
      net_credit: netCredit,
      close_debit: closeDebit,
      // The three parts a position's result is made of, kept apart rather than
      // fused into one number. Premium is what was taken at open and is real
      // the moment it is collected; the close is what giving the position back
      // cost, and is zero on anything that expired or was assigned; shares are
      // added later by attributeStockPL, once the ledger exists.
      premium_pl: noNegZero(netCredit * scale),
      early_close_pl: noNegZero(-closeDebit * scale),
      stock_pl: 0,
      realized_pl: noNegZero((netCredit - closeDebit) * scale)
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Share results, credited to the option responsible for them
// ---------------------------------------------------------------------------

// Which option owns a lot's profit: the one that *disposed* of the shares.
//
// A wheel cycle runs put -> shares -> call -> shares gone. Crediting the put,
// which acquired them, would mean a position closed in March has its result
// rewritten in July when the shares finally leave — a log whose past keeps
// moving is not a log. Crediting the disposal also books the gain on the day it
// was realised, which is the day the brokerage statement books it, so the two
// reconcile line by line.
//
// Shares sold on the open market carry no disposal chain, so they fall back to
// the option that delivered them: a put assigned and later sold is the put's
// result.
//
// Every lot reaching here has an option on at least one side — that is what
// buildStockLedger now returns — so a lot with no owner means the option that
// produced it was not reconstructed, which is a defect worth seeing rather than
// a number to display. It is returned for the caller to notice.
export function attributeStockPL(records, stockLots) {
  // A chain id is `symbol@date`, so every record built from one short symbol
  // assigned on one day shares it. Keyed by `set`, the last record written won
  // and took *all* the shares: two put spreads on the same short strike came
  // out $500 wrong in opposite directions, one loss reported as a profit, and
  // one spread showing a loss larger than its own defined maximum. The account
  // total stayed right, so nothing reconciled it away.
  //
  // The owners of a chain are therefore a list, and a lot is split across them
  // in proportion to contracts — which is what the assignment did: one event
  // delivering shares to every contract that was assigned.
  const byChain = new Map();
  records.forEach((r) => {
    if (!r.chain_id) return;
    const owners = byChain.get(r.chain_id) || [];
    owners.push(r);
    byChain.set(r.chain_id, owners);
  });

  let orphaned = 0;

  // Which of a chain's owners a particular lot belongs to.
  //
  // Splitting by contract count is right for what a single assignment did --
  // one event delivering shares to every assigned contract -- and wrong for
  // the leg that is spread-specific: two put spreads sharing a short strike,
  // 150/145 and 150/140, each exercise their OWN long. The lots come out at
  // -$500 and -$1,000; splitting evenly reported -$750 each, so the 150/145
  // spread showed a loss larger than its own $350 maximum.
  //
  // Matching the lot's price against a strike looked like it identified the
  // owner and did not. Two ways it was wrong, both reproduced:
  //
  //   A market sale carries a traded price, and limit prices sit on round
  //   numbers exactly where strikes do. Shares sold at 145 after both longs
  //   expired handed the entire -$1,000 to the 150/145 spread -- -$850 against
  //   a $350 maximum -- and turned the 150/140 spread's -$300 into +$200. Both
  //   rows were right before that matching existed.
  //
  //   On a call spread the directions mirror: the short's assignment SELLS at
  //   the short strike and the long's exercise BUYS at the long. Neither test
  //   could ever match, so no call spread was identified at all and the
  //   defect this was written to fix was untouched on half the book.
  //
  // The contract that moved the shares is recorded on the lot, so identity
  // does not have to be inferred from a number that other things can equal.
  // The long leg is what distinguishes two records sharing a short, and it is
  // on the acquisition side for calls and the disposal side for puts -- so
  // either side identifies an owner, and a market sale (no contract) matches
  // nothing. Proportional splitting stays for a genuine tie: a shared
  // assignment disposed of on the market is exactly that.
  const ownerOf = (owners, lot) => {
    const moved = [lot.acquired_option, lot.disposed_option].filter(Boolean);
    if (moved.length === 0) return null;
    const byLong = owners.filter((o) => o.long_symbol && moved.includes(o.long_symbol));
    if (byLong.length === 1) return byLong[0];
    const byShort = owners.filter((o) => o.short_symbol && moved.includes(o.short_symbol));
    if (byShort.length === 1) return byShort[0];
    return null;
  };

  // How many shares each record is still owed.
  //
  // Identifying one lot and splitting the next was worse than splitting both.
  // Two spreads on a shared short, one long exercised and one expired, the
  // remaining 100 shares sold on the market: the exercised long's lot was
  // identified and went whole to its own record -- correctly -- and then the
  // market sale, which nothing identifies, was split down the middle across
  // both. The record that had already taken its 100 shares took another 50,
  // reporting -$750 against a maximum of -$400, while the record that
  // actually held the sold shares understated by $350.
  //
  // A record owns qty x 100 shares and no more. Identified lots are assigned
  // first and spend that allowance; what is left over is split across what
  // remains, so the second lot lands where the shares actually were. This is
  // the arithmetic the earlier versions were reaching for by other means.
  const owed = new Map();
  const capacityOf = (o) => (owed.has(o) ? owed.get(o) : (o.qty || 0) * CONTRACT_SIZE);
  const spend = (o, qty) => owed.set(o, Math.max(0, capacityOf(o) - qty));

  const credit = (owners, amount, lot) => {
    const qty = Number(lot.qty) || 0;
    if (owners.length === 1) {
      owners[0].stock_pl += amount;
      spend(owners[0], qty);
      return;
    }
    const identified = ownerOf(owners, lot);
    if (identified) {
      identified.stock_pl += amount;
      spend(identified, qty);
      return;
    }
    // Split across the records that can still be owed shares, in proportion
    // to what each is owed. Falls back to contract count only when every
    // allowance is spent, which means the ledger and the records disagree
    // about how many shares existed -- worth splitting evenly rather than
    // dropping.
    const withRoom = owners.filter((o) => capacityOf(o) > 0);
    const pool = withRoom.length ? withRoom : owners;
    const weightOf = (o) => (withRoom.length ? capacityOf(o) : o.qty || 0);
    const total = pool.reduce((a, o) => a + weightOf(o), 0);
    let assigned = 0;
    pool.forEach((o, i) => {
      const cut =
        i === pool.length - 1
          ? amount - assigned // the remainder, so the parts still sum exactly
          : total > 0
            ? (amount * weightOf(o)) / total
            : amount / pool.length;
      o.stock_pl += cut;
      assigned += cut;
      spend(o, total > 0 ? (qty * weightOf(o)) / total : qty / pool.length);
    });
  };

  // Lots that name their contract are assigned before lots that do not: an
  // allowance can only be spent correctly if the certain claims go first.
  const ownersOf = (lot) =>
    (lot.disposed_chain_id && byChain.get(lot.disposed_chain_id)) ||
    (lot.acquired_chain_id && byChain.get(lot.acquired_chain_id)) ||
    null;

  const identifiedFirst = stockLots
    .slice()
    .sort((a, b) => {
      const known = (l) => (l.acquired_option || l.disposed_option ? 0 : 1);
      return known(a) - known(b);
    });

  identifiedFirst.forEach((lot) => {
    const owners = ownersOf(lot);
    // A lot still held has no result to credit, but it has still consumed the
    // shares its record was owed -- otherwise a later lot would be allocated
    // as though those shares were free.
    if (lot.realized_pl === null || lot.realized_pl === undefined) {
      if (owners && owners.length === 1) spend(owners[0], Number(lot.qty) || 0);
      else if (owners && owners.length) {
        const identified = ownerOf(owners, lot);
        if (identified) spend(identified, Number(lot.qty) || 0);
      }
      return;
    }
    if (owners && owners.length) credit(owners, lot.realized_pl, lot);
    else orphaned += lot.realized_pl;
  });

  // An assignment whose shares are still held is not a finished trade.
  //
  // The option closed, so the row was written as complete -- premium kept, a
  // full winner, dated to the assignment. Months later the shares sell, the
  // share result lands on that same row under that same date, and a January
  // win becomes a January loss in April. Every figure computed from close
  // dates moves with it: the equity curve, win rate, profit factor, streaks,
  // the monthly breakdown, and any date filter that contained it. Nothing on
  // screen said a closed row could change.
  //
  // It still cannot be dated forward -- the premium genuinely was realised
  // when the option closed -- so the honest answer is to say the row is not
  // final yet, and let the reader see which ones are.
  const undisposedChains = new Set();
  stockLots.forEach((lot) => {
    if (lot.disposed_date) return;
    if (lot.acquired_chain_id) undisposedChains.add(lot.acquired_chain_id);
  });

  records.forEach((r) => {
    r.stock_pl = noNegZero(r.stock_pl);
    r.realized_pl = noNegZero(r.premium_pl + r.early_close_pl + r.stock_pl);
    r.provisional = !!(r.chain_id && undisposedChains.has(r.chain_id));
  });

  // The invariant every attribution defect so far has broken.
  //
  // A credit spread cannot lose more than its width less the credit taken, and
  // a reader is entitled to that without checking. Three separate versions of
  // this function reported a loss past that line -- by keying on `set`, by
  // splitting proportionally, by matching a price against a strike -- and each
  // time the account total stayed right, so nothing reconciled it away and
  // nothing flagged it. Arithmetic that cannot happen is worth refusing to
  // publish, not worth displaying with a caveat.
  const breaches = [];
  records.forEach((r) => {
    if (!r.short_symbol || !r.long_symbol) return; // only a defined-risk pair has a maximum
    const width = Math.abs((r.short_strike || 0) - (r.long_strike || 0));
    if (!(width > 0)) return;
    const maxLoss = width * CONTRACT_SIZE * (r.qty || 1) - r.premium_pl;
    if (r.realized_pl < -maxLoss - 0.01) {
      breaches.push({
        short_symbol: r.short_symbol,
        long_symbol: r.long_symbol,
        close_date: r.close_date,
        realized_pl: r.realized_pl,
        max_loss: -maxLoss
      });
    }
  });

  return { orphaned, breaches };
}

// ---------------------------------------------------------------------------
// Everything, in the one order the steps can run in: option lots produce the
// share movements, the share ledger answers whether an orphaned call was
// covered, and only then can the trades be classified.
// ---------------------------------------------------------------------------

export function reconstruct(activities, orderStrategy, accountId) {
  const { closedLots, shareMoves, cashSettlements, unreconstructable } =
    reconstructOptionLots(activities, orderStrategy);
  const moves = mergeShareMoves(shareMoves, stockFillMoves(activities));
  const { lots, sharesHeldAt } = buildStockLedger(moves);
  const { trades, chainRemap } = buildTrades(closedLots, sharesHeldAt, accountId);

  const remap = (chain) => (chain && chainRemap.get(chain)) || chain || null;
  const attributable = lots.map((l) => ({
    ...l,
    account_id: accountId,
    acquired_chain_id: remap(l.acquired_chain_id),
    disposed_chain_id: remap(l.disposed_chain_id),
    chain_id: remap(l.chain_id)
  }));

  const all = mergeAndPrice(trades);

  // A position closed by assignment or exercise on an adjusted contract has a
  // share leg this code refuses to invent, so what is left of it is premium
  // only -- and premium only, on a position that was assigned, is the
  // flattering half of the answer. +$300 on a trade that lost $700 is not
  // improved by being labelled. It is withheld from the figures entirely and
  // reported as a position that could not be reconstructed.
  //
  // An adjusted contract that expired worthless or was bought back has no
  // deliverable question, so its premium is exactly right and its record
  // stays.
  const unreconstructedSymbols = new Set(unreconstructable.map((u) => u.symbol));
  const withheld = all.filter(
    (r) =>
      unreconstructedSymbols.has(r.short_symbol) || unreconstructedSymbols.has(r.long_symbol)
  );
  const records = all.filter((r) => !withheld.includes(r));
  const { orphaned: orphanedStockPL, breaches } = attributeStockPL(records, attributable);

  // The contract that moved each lot is what attribution runs on, and it is
  // not a column on stock_lots -- every field here is written to that table
  // verbatim, so an extra one would fail the insert. It is derivable from the
  // chain ids anyway, up until the point where a merged pair rewrites them,
  // which is why it travels this far and no further.
  const stockLots = attributable.map(({ acquired_option, disposed_option, ...rest }) => rest);
  const settlementChecks = reconcileCashSettlements(records, cashSettlements);

  return {
    records,
    stockLots,
    orphanedStockPL,
    cashSettlements,
    settlementChecks,
    breaches,
    // What was left out, and why. Every entry is a real position: the option
    // fills happened, the premium was real, and the shares it settled into
    // cannot be derived from the symbol.
    unreconstructable: unreconstructable.map((u) => {
      const record = withheld.find(
        (r) => r.short_symbol === u.symbol || r.long_symbol === u.symbol
      );
      return { ...u, premium_pl: record ? record.premium_pl : null };
    })
  };
}

// What the broker said a cash settlement paid, against what the position says
// it must have paid.
//
// Two independent reasons not to take either number on faith. Alpaca's paper
// index settlement has a reported defect crediting out-of-the-money shorts
// instead of expiring them worthless -- an error of thousands on a single
// account. And this code derives its own figure from a share round-trip that
// never happened, which is right for a spread and unproven for anything else.
// When two doubtful numbers agree, the answer is probably right; when they
// disagree, that is worth a person's attention rather than a silent choice
// between them.
//
// Returns one row per settlement, never throws, and decides nothing.
export function reconcileCashSettlements(records, cashSettlements) {
  if (!cashSettlements || cashSettlements.length === 0) return [];

  // Settlements are reported per leg; a spread record holds the net of its
  // legs. Comparing one leg's cash against the pair's net figure would flag
  // every correct spread as a disagreement, so the legs of a position are
  // summed and the sum is what gets checked.
  const groups = new Map();
  cashSettlements.forEach((s) => {
    // Within a day, not on the day. Index settlement is exactly where this
    // file already allows a one-day skew -- the cash is stamped when it
    // settles and the position when it closed, and the two straddle midnight
    // often enough that an exact match would report every real settlement as
    // "no matching position" and the comparison would be noise.
    const owner = records.find(
      (r) =>
        (r.short_symbol === s.symbol || r.long_symbol === s.symbol) &&
        r.close_date &&
        s.date &&
        Math.abs(Date.parse(r.close_date) - Date.parse(s.date)) <= 86400000
    );
    const key = owner ? `${owner.short_symbol}|${owner.long_symbol}|${owner.close_date}` : `?${s.symbol}@${s.date}`;
    const g = groups.get(key) || { owner, legs: [], date: s.date, ticker: s.ticker };
    g.legs.push(s);
    groups.set(key, g);
  });

  return [...groups.values()].map((g) => {
    const unreadable = g.legs.some((l) => l.amount === null);
    const reported = unreadable ? null : g.legs.reduce((a, l) => a + l.amount, 0);
    // What this code booked for the position the settlement closed. The share
    // round-trip lands in stock_pl; the credit taken at open is separate and
    // is not part of what settlement paid.
    const computed = g.owner ? g.owner.stock_pl : null;

    let status;
    if (unreadable) status = "amount-unreadable";
    else if (computed === null) status = "no-matching-position";
    else if (Math.abs(reported - computed) <= 0.01) status = "agrees";
    else status = "disagrees";

    return {
      symbols: g.legs.map((l) => l.symbol),
      symbol: g.legs[0].symbol,
      ticker: g.ticker,
      date: g.date,
      qty: g.legs[0].qty,
      reported,
      computed,
      difference: reported !== null && computed !== null ? reported - computed : null,
      status
    };
  });
}
