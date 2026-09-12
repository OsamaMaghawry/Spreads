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
