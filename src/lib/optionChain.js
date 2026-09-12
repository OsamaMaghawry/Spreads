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
    fromChain: true,
    // The account the chain was read on. `shares`, `basis` and therefore the
    // whole covered/uncovered judgement below are properties of THAT account,
    // so the ticket can tell when it has been pointed somewhere else.
    accountId: ctx?.accountId ?? null,
    accountName: ctx?.accountName ?? null
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
      // The basis itself travels, not just its source. Without it the ticket's
      // payoff chart could not put the shares under the call and drew a NAKED
      // call — loss falling without limit above the strike — directly beneath
      // a "Max loss" cell that had been computed from this very number.
      basis: covered ? basis : null,
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
 * Two selected legs, as whatever structure they actually form.
 *
 * The owner, after the first build: *"It has an issue when selecting the
 * spreads with different expiry dates. Buying 270 Feb 2027 Put, and Selling
 * Dec 2027 320 Put — when I select one and change the date to select the
 * other, the first disappears."*
 *
 * Two separate faults. The page cleared the selection on every expiry change,
 * which is fixed there. This function assumed both legs shared the page's
 * current expiry, which is fixed here: each leg carries its own.
 *
 * THREE STRUCTURES, TOLD APART RATHER THAN ASSUMED:
 *
 *   VERTICAL   same expiry, different strikes. Risk is bounded by the width.
 *   CALENDAR   same strike, different expiries.
 *   DIAGONAL   both differ.
 *
 * AND THE PART THAT MATTERS MOST — WHICH LEG OUTLIVES THE OTHER.
 *
 * A calendar or diagonal is only a bounded position while the long leg is
 * still alive to cover the short one. Put the short leg further out and the
 * long expires first, leaving a NAKED SHORT for the rest of the short's life.
 * That is the owner's own example: long Feb 2027, short Dec 2027 — from
 * February onwards it is a bare short put, and its risk is the strike, not the
 * debit paid.
 *
 * So `maxRisk` is computed only where it is genuinely bounded:
 *
 *   - a vertical, either way round;
 *   - a calendar or diagonal where the LONG outlives the short AND the long
 *     strike protects the short (a put long at or above the short strike, a
 *     call long at or below it), paid for as a net debit.
 *
 * Everything else returns null with `riskNote` saying why. A number there
 * would be read as a ceiling on a position that has none, which is the single
 * most dangerous thing this screen could print.
 */
export function spreadSetup(legs, ctx) {
  const picked = (legs || []).filter(Boolean);
  if (picked.length !== 2) {
    return { ok: false, reason: "A spread is exactly two legs." };
  }

  const [a, b] = picked;
  const typeOf = (l) => (l.row.type === "P" || l.row.type === "put" ? "P" : "C");
  if (typeOf(a) !== typeOf(b)) {
    return { ok: false, reason: "Both legs must be the same type — two puts or two calls." };
  }
  const expiryOf = (l) => String(l.expiry || l.row.expiry || ctx?.expiry || "");
  if (expiryOf(a) === expiryOf(b) && Number(a.row.strike) === Number(b.row.strike)) {
    return { ok: false, reason: "Both legs are the same contract, so there is no spread between them." };
  }
  const sell = picked.find((l) => l.action === "sell");
  const buy = picked.find((l) => l.action === "buy");
  if (!sell || !buy) {
    return { ok: false, reason: "A spread needs one leg sold and one bought." };
  }

  const sellMid = num(sell.row.mid);
  const buyMid = num(buy.row.mid);
  if (sellMid === null || buyMid === null) {
    const dead = sellMid === null ? sell.row.symbol : buy.row.symbol;
    return { ok: false, reason: `No two-sided market on ${dead}. Nothing to price the spread from.` };
  }

  const isPut = typeOf(a) === "P";
  const sellExp = expiryOf(sell);
  const buyExp = expiryOf(buy);
  const sellStrike = Number(sell.row.strike);
  const buyStrike = Number(buy.row.strike);
  const sameExpiry = sellExp === buyExp;
  const sameStrike = sellStrike === buyStrike;

  const structure = sameExpiry ? "vertical" : sameStrike ? "calendar" : "diagonal";
  // Positive is a credit taken, negative a debit paid. One convention, the
  // same one openPosition reads to decide what to send.
  const credit = Math.round((sellMid - buyMid) * 10000) / 10000;
  const width = Math.abs(sellStrike - buyStrike);
  const spot = num(ctx?.spot);

  // Does the long leg outlive the short one? On a vertical they expire
  // together, which counts as covered.
  const longOutlives = sameExpiry || buyExp > sellExp;
  // Does the long STRIKE protect the short? A long put caps a short put only
  // from at or above it; a long call only from at or below.
  const strikeProtects = isPut ? buyStrike >= sellStrike : buyStrike <= sellStrike;

  let maxRisk = null;
  let maxProfit = null;
  let riskNote = null;

  if (structure === "vertical") {
    maxRisk = credit >= 0 ? (width - credit) * 100 : Math.abs(credit) * 100;
    maxProfit = credit >= 0 ? credit * 100 : (width - Math.abs(credit)) * 100;
  } else if (longOutlives && strikeProtects && credit < 0) {
    // A paid-for calendar or diagonal whose long covers the short in both time
    // and strike: the most that can go is what was paid.
    maxRisk = Math.abs(credit) * 100;
    riskNote = `The ${buyExp} leg outlives the ${sellExp} short, so the most at risk is the debit paid.`;
  } else if (!longOutlives) {
    // A BARE SHORT PUT IS BOUNDED; A BARE SHORT CALL IS NOT.
    //
    // Both used to return `maxRisk: null`, and the screen printed "No ceiling"
    // over each. On a put that is false, and false in the reassuring
    // direction's opposite — it refuses to name a number the user badly needs.
    // A stock cannot go below zero, so the worst a short put can do is the
    // strike, less whatever came in: on the owner's 320 put taken for 1.66
    // that is $31,834, not "unknowable". This branch's own `riskNote` has said
    // so in words since it was written; the figure simply never travelled.
    //
    // A call keeps null, because there the words and the null agree: a stock
    // has no upper bound and neither does the loss.
    maxRisk = isPut ? (sellStrike - credit) * 100 : null;
    maxProfit = credit >= 0 ? credit * 100 : null;
    riskNote =
      `The short ${sellExp} leg outlives the long ${buyExp} leg. After ${buyExp} this is a bare short ` +
      `${isPut ? "put" : "call"} at ${sellStrike} until ${sellExp}` +
      (isPut
        ? `, and the worst case is ${sellStrike} a share with the stock at zero, less what came in.`
        : `, with no ceiling on the loss.`);
  } else {
    riskNote =
      `A ${structure} taken for a credit is not bounded by the width — the legs expire on different ` +
      `days, so there is no point at which they settle against each other.`;
  }

  const leg = (l, side) => ({
    role: `${side === "sell" ? "short" : "long"}_${isPut ? "put" : "call"}`,
    symbol: l.row.symbol,
    strike: Number(l.row.strike),
    expiry: expiryOf(l),
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
      // The NEAR expiry is the one that governs the position's next event, so
      // it is what the ticket shows. Both travel on the legs.
      expiry: sellExp < buyExp ? sellExp : buyExp,
      expiries: sameExpiry ? [sellExp] : [sellExp, buyExp].sort(),
      structure,
      strategy: isPut ? "put_spread" : "call_spread",
      targetDelta: null,
      wingWidth: sameExpiry ? width : null,
      width: sameExpiry ? width : null,
      spot,
      spotSource: ctx?.spotSource ?? null,
      spotAsOf: ctx?.spotAsOf ?? null,
      putRatio: 1,
      callRatio: 1,
      fromChain: true,
      credit,
      debit: credit < 0 ? Math.abs(credit) : null,
      // Collateral is the width only on a vertical; on a calendar or diagonal
      // the two legs do not settle against each other and the broker does not
      // treat the width as cover.
      collateral: structure === "vertical" ? width * 100 : null,
      maxRisk,
      maxProfit,
      unlimitedRisk: maxRisk === null,
      riskNote,
      breakEvenLow: structure === "vertical" && isPut ? sellStrike - credit : null,
      breakEvenHigh: structure === "vertical" && !isPut ? sellStrike + credit : null,
      returnOnCollateral: structure === "vertical" && width > 0 ? credit / width : null,
      otmPct: spot && spot > 0
        ? (isPut ? (spot - sellStrike) / spot : (sellStrike - spot) / spot)
        : null,
      short_symbol: sell.row.symbol,
      long_symbol: buy.row.symbol,
      short_strike: sellStrike,
      long_strike: buyStrike,
      legs: [leg(sell, "sell"), leg(buy, "buy")]
    }
  };
}
