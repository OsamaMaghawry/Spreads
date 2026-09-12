// One clicked strike, as a ticket.
//
// Lives on the client because that is where it is used: the `optionChain`
// function returns a LADDER and never a ticket, and building the setup here
// costs nothing — every number it needs is already on the page. The first
// version put this in the edge function's shared module with no caller, and
// the page grew a second, worse copy of the same arithmetic. Two answers to
// "what does this strike cost and risk" is the shape every P/L defect in this
// product has taken.
//
// The output is deliberately the SAME SHAPE `buildSingle` returns in
// `optionScan.ts`, so `TradeDialog`, `SetupPreview`, `PreTradeRisk` and
// `useOpenOrder` need no chain-specific branch.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The four things a single option leg can be, named as this product names them.
 *
 * Selling a put is a cash-secured put and selling a call is a covered call only
 * in the wheel sense the rest of the app uses. The collateral and cover checks
 * that make those names true run in `openPosition`'s preflight on every order,
 * whatever this returns — a name is not a guarantee.
 */
export function legStrategy(type, action) {
  const put = type === "P" || type === "put";
  if (action === "sell") return put ? "cash_secured_put" : "covered_call";
  return put ? "long_put" : "long_call";
}

/**
 * A ticket from one chain row and a side.
 *
 * WHAT IS AT RISK, and why buying and selling are not mirror images:
 *
 *   SELL a put    the stock can go to zero, so the most it loses is the strike
 *                 less the credit, on 100 shares. Collateral is the strike.
 *   SELL a call   uncovered, the loss has NO CEILING and `maxRisk` is null
 *                 rather than a number — any figure there would be read as a
 *                 floor. Covered, the risk lives in the shares and is measured
 *                 against what they cost, never against the spot.
 *   BUY either    the most that can be lost is what was paid, known exactly at
 *                 the moment of the order.
 *
 * Priced at the MID, not the bid and not the ask. The scanner takes the bid
 * when selling because it is modelling a fill nobody asked for; a person
 * clicking a strike is about to choose their own limit and the ticket walks
 * from there. Starting them at the bid would anchor every order to the worst
 * half of a wide market.
 */
export function contractSetup(row, action, ctx) {
  if (!row) return { ok: false, reason: "No contract selected." };
  const price = num(row.mid);
  if (price === null) {
    return {
      ok: false,
      reason: `No two-sided market on ${row.symbol} — bid ${row.bid ?? "—"}, ask ${row.ask ?? "—"}. Nothing to price a ticket from.`
    };
  }

  const spot = num(ctx?.spot);
  const strike = Number(row.strike);
  const isPut = row.type === "P" || row.type === "put";
  const buying = action === "buy";
  const shares = Number(ctx?.shares) || 0;
  const basis = num(ctx?.basis);
  const covered = !isPut && !buying && shares >= 100 && basis !== null && basis > 0;

  const base = {
    ticker: ctx?.ticker,
    expiry: ctx?.expiry,
    strategy: legStrategy(isPut ? "P" : "C", action),
    // Nothing was searched for. `targetDelta` means "what the sweep asked
    // for", and putting the contract's own delta here would make the ticket
    // claim it had gone looking.
    targetDelta: null,
    wingWidth: null,
    width: null,
    spot,
    spotSource: ctx?.spotSource ?? null,
    spotAsOf: ctx?.spotAsOf ?? null,
    putRatio: 1,
    callRatio: 1,
    fromChain: true
  };

  const leg = {
    role: buying ? (isPut ? "long_put" : "long_call") : (isPut ? "short_put" : "short_call"),
    symbol: row.symbol,
    strike,
    type: isPut ? "put" : "call",
    bid: num(row.bid),
    ask: num(row.ask),
    mid: price,
    delta: num(row.delta),
    iv: num(row.iv),
    ratio: 1,
    side: buying ? "buy" : "sell"
  };

  const otm = spot && spot > 0
    ? (isPut ? (spot - strike) / spot : (strike - spot) / spot)
    : null;

  if (buying) {
    return {
      ok: true,
      setup: {
        ...base,
        // Negative credit IS the debit convention the rest of the product
        // uses. A second sign convention is how a debit gets booked as a
        // credit.
        credit: -price,
        debit: price,
        collateral: price * 100,
        maxRisk: price * 100,
        // A bought put breaks even BELOW its strike, a bought call above.
        breakEvenLow: isPut ? strike - price : null,
        breakEvenHigh: isPut ? null : strike + price,
        returnOnCollateral: null,
        otmPct: otm,
        legs: [leg]
      }
    };
  }

  if (isPut) {
    return {
      ok: true,
      setup: {
        ...base,
        credit: price,
        collateral: strike * 100,
        maxRisk: (strike - price) * 100,
        breakEvenLow: strike - price,
        breakEvenHigh: null,
        returnOnCollateral: strike > 0 ? price / strike : null,
        otmPct: otm,
        legs: [leg]
      }
    };
  }

  return {
    ok: true,
    setup: {
      ...base,
      credit: price,
      // Covered, the collateral is the shares at what they cost. Uncovered,
      // no figure here means anything, and printing the strike would suggest
      // the position is secured when it is not.
      collateral: covered ? basis * 100 : null,
      maxRisk: covered ? (basis - price) * 100 : null,
      unlimitedRisk: !covered,
      sharesHeld: shares,
      basisSource: ctx?.basisSource ?? null,
      maxContracts: covered ? Math.floor(shares / 100) : 0,
      breakEvenLow: null,
      breakEvenHigh: strike + price,
      ifCalled: covered ? (strike - basis + price) * 100 : null,
      otmPct: otm,
      legs: [leg]
    }
  };
}

/**
 * Two selected legs, as a vertical spread.
 *
 * The owner: *"I can't open spreads from it. Only one put or call. Not multi
 * select."* Selling one strike and buying another of the same type and expiry
 * is a vertical, and it is the structure this product was built around — it
 * had a builder for it in the scanner and no way to reach it by hand.
 *
 * WHAT MAKES IT A VERTICAL, checked rather than assumed: same underlying, same
 * expiry, same type, different strikes, and exactly one of each side. Anything
 * else is refused by name. A "spread" assembled from two legs that do not form
 * one is the shape that reports a defined risk on an undefined position.
 *
 * THE CREDIT IS SIGNED. Sell the near strike and buy the far one and money
 * comes in — a credit spread, positive. The other way round it goes out, and
 * the same field carries a negative number, which is the debit convention used
 * everywhere else in this product. `openPosition` reads that sign to decide
 * what to send; a separate `debit` field would be a second convention.
 *
 * MAX RISK IS THE WIDTH LESS WHAT CAME IN, and on a debit spread it is simply
 * what was paid. Both are bounded, which is the whole reason a trader puts one
 * leg against another.
 */
export function spreadSetup(legs, ctx) {
  const picked = (legs || []).filter(Boolean);
  if (picked.length !== 2) {
    return { ok: false, reason: "A vertical spread is exactly two legs." };
  }

  const [a, b] = picked;
  const typeOf = (l) => (l.row.type === "P" || l.row.type === "put" ? "P" : "C");
  if (typeOf(a) !== typeOf(b)) {
    return { ok: false, reason: "Both legs of a vertical must be the same type — two puts or two calls." };
  }
  if (Number(a.row.strike) === Number(b.row.strike)) {
    return { ok: false, reason: "Both legs are the same strike, so there is no spread between them." };
  }
  const sell = picked.find((l) => l.action === "sell");
  const buy = picked.find((l) => l.action === "buy");
  if (!sell || !buy) {
    return { ok: false, reason: "A vertical needs one leg sold and one bought." };
  }

  const sellMid = num(sell.row.mid);
  const buyMid = num(buy.row.mid);
  if (sellMid === null || buyMid === null) {
    const dead = sellMid === null ? sell.row.symbol : buy.row.symbol;
    return { ok: false, reason: `No two-sided market on ${dead}. Nothing to price the spread from.` };
  }

  const isPut = typeOf(a) === "P";
  // Positive is a credit taken, negative a debit paid. One convention.
  const credit = Math.round((sellMid - buyMid) * 10000) / 10000;
  const width = Math.abs(Number(sell.row.strike) - Number(buy.row.strike));
  const spot = num(ctx?.spot);

  const leg = (l, side) => ({
    role: `${side === "sell" ? "short" : "long"}_${isPut ? "put" : "call"}`,
    symbol: l.row.symbol,
    strike: Number(l.row.strike),
    type: isPut ? "put" : "call",
    bid: num(l.row.bid),
    ask: num(l.row.ask),
    mid: num(l.row.mid),
    delta: num(l.row.delta),
    iv: num(l.row.iv),
    ratio: 1,
    side
  });

  return {
    ok: true,
    setup: {
      ticker: ctx?.ticker,
      expiry: ctx?.expiry,
      // A credit spread is the product's "spreads" strategy; a debit vertical
      // is the same structure with the sign the other way, and the
      // reconstruction already pairs both.
      strategy: isPut ? "put_spread" : "call_spread",
      targetDelta: null,
      wingWidth: width,
      width,
      spot,
      spotSource: ctx?.spotSource ?? null,
      spotAsOf: ctx?.spotAsOf ?? null,
      putRatio: 1,
      callRatio: 1,
      fromChain: true,
      credit,
      debit: credit < 0 ? Math.abs(credit) : null,
      collateral: width * 100,
      // Bounded either way, which is the point of the second leg. On a credit
      // spread the width less what came in; on a debit spread, what was paid.
      maxRisk: credit >= 0 ? (width - credit) * 100 : Math.abs(credit) * 100,
      maxProfit: credit >= 0 ? credit * 100 : (width - Math.abs(credit)) * 100,
      breakEvenLow: isPut ? Number(sell.row.strike) - credit : null,
      breakEvenHigh: isPut ? null : Number(sell.row.strike) + credit,
      returnOnCollateral: width > 0 ? credit / width : null,
      otmPct: spot && spot > 0
        ? (isPut ? (spot - Number(sell.row.strike)) / spot : (Number(sell.row.strike) - spot) / spot)
        : null,
      short_symbol: sell.row.symbol,
      long_symbol: buy.row.symbol,
      short_strike: Number(sell.row.strike),
      long_strike: Number(buy.row.strike),
      legs: [leg(sell, "sell"), leg(buy, "buy")]
    }
  };
}
