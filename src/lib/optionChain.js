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

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * A two-leg, one-expiry position with unequal quantities, at expiration, per
 * unit (sellRatio short, buyRatio long) and per 100 shares.
 *
 * The payoff is straight between strikes, so its value at zero, at each strike
 * and its slope past the top strike describe all of it. Past the top strike
 * only calls are in the money: a net short call keeps losing (no ceiling), a
 * net long call keeps gaining (no cap on profit). Puts are worth nothing up
 * there, and at zero they are worth their full strike, so a put ratio is
 * always bounded.
 *
 * Exported for the tests; spreadSetup is the only caller.
 */
export function ratioPayoff({ isPut, credit, sellStrike, buyStrike, sellRatio, buyRatio }) {
  const intrinsic = (k, s) => (isPut ? Math.max(0, k - s) : Math.max(0, s - k));
  const pl = (s) => credit + buyRatio * intrinsic(buyStrike, s) - sellRatio * intrinsic(sellStrike, s);
  const lo = Math.min(sellStrike, buyStrike);
  const hi = Math.max(sellStrike, buyStrike);
  const xs = [0, lo, hi];
  // Rounded so a credit of exactly nothing reads as zero, not 1e-15.
  const ys = xs.map((s) => Math.round(pl(s) * 1e6) / 1e6);
  const tail = isPut ? 0 : buyRatio - sellRatio;

  const worst = Math.min(...ys);
  const best = Math.max(...ys);
  const maxLoss = tail < 0 ? null : r2(Math.max(0, -worst) * 100);
  const maxProfit = tail > 0 ? null : r2(Math.max(0, best) * 100);

  // Where the payoff crosses zero: inside each segment, then on the tail. A
  // stretch that sits exactly at zero (a ratio put on for no credit) has no
  // single break-even, so its ends are not reported as one.
  const crossings = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[i], ys[i + 1]];
    if (y0 === 0 && y1 === 0) continue;
    if (i === 0 && y0 === 0) crossings.push(x0);
    if (y1 === 0) {
      if (!(x1 === hi && tail === 0)) crossings.push(x1);
    } else if (y0 !== 0 && Math.sign(y0) !== Math.sign(y1)) {
      crossings.push(x0 + (0 - y0) * (x1 - x0) / (y1 - y0));
    }
  }
  const yHi = ys[ys.length - 1];
  if (tail !== 0 && yHi !== 0 && Math.sign(yHi) !== Math.sign(tail)) crossings.push(hi - yHi / tail);
  return { maxLoss, maxProfit, breakEvens: [...new Set(crossings.map(r2))].sort((a, b) => a - b) };
}

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

  // Cover already behind a call sold: priced as covered, flagged, and left to
  // the trader -- see scanCover. The flag rides on whichever cover is used.
  const inUse = ctx?.coverInUse || null;
  const long = freeLong(ctx?.longCover, ctx?.expiry);
  if (long) {
    const r = callOverLong({ base, leg, price, strike, otm, long, shares, ticker: ctx?.ticker });
    if (r.ok && inUse) r.setup.coverInUse = inUse;
    return r;
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
      ...(covered && inUse ? { coverInUse: inUse } : {}),
      otmPct: otm,
      legs: [leg]
    }
  };
}

/**
 * The first long call that can cover a call sold for `expiry`: one the account
 * holds free (not already behind a call it has sold -- the server decides
 * that, with the allocator the Dashboard uses), expiring ON OR AFTER the new
 * call, with a cost on record. A long that dies first would leave the short
 * bare for the rest of its life. Longs cover before shares, as they do in the
 * Scanner and in the allocator itself.
 */
function freeLong(list, expiry) {
  for (const l of list || []) {
    if (!(num(l?.cost) > 0) || num(l?.strike) === null || !(num(l?.qty) > 0)) continue;
    if (String(l.expiry || "") < String(expiry || "")) continue;
    return l;
  }
  return null;
}

/**
 * A call sold against a long call already held -- a spread, priced exactly as
 * `buildCallOverLong` in optionScan.ts prices it, so the chain and the Scanner
 * give one answer for one position:
 *
 *   max loss / share   long cost - credit + max(0, long strike - short strike)
 *   if assigned        short strike - long strike + credit - long cost
 *
 * The first is a bound at the short call's expiry that ignores the long's
 * remaining time value, so it overstates the risk rather than understating it.
 * The second is the floor, because exercising the long to deliver forfeits that
 * time value. No max profit: at the short strike the long has gained too, by an
 * amount that depends on volatility nobody knows yet.
 */
function callOverLong({ base, leg, price, strike, otm, long, shares, ticker }) {
  const longStrike = num(long.strike);
  const cost = num(long.cost);
  const riskPerShare = cost - price + Math.max(0, longStrike - strike);
  if (!(riskPerShare > 0)) {
    return {
      ok: false,
      reason: `The $${price.toFixed(2)} credit would cover everything your ${ticker} long call cost — check the quote before trusting it.`
    };
  }
  return {
    ok: true,
    setup: {
      ...base,
      credit: price,
      collateral: cost * 100,
      maxRisk: riskPerShare * 100,
      unlimitedRisk: false,
      coveredBy: "long_call",
      cover: {
        symbol: long.symbol,
        strike: longStrike,
        expiry: long.expiry,
        cost,
        mark: num(long.mark),
        contracts: num(long.qty)
      },
      ifAssigned: (strike - longStrike + price - cost) * 100,
      maxProfit: null,
      basis: null,
      sharesHeld: shares,
      basisSource: null,
      maxContracts: num(long.qty),
      breakEvenLow: null,
      breakEvenHigh: null,
      returnOnCollateral: price / cost,
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

  // HOW MANY OF EACH. The owner: "buying 1 Call vs selling 2 calls ... to be
  // able to control the quantity for each leg". The trader states contracts
  // per leg; the broker takes one multi-leg order whose leg ratios are in
  // lowest terms (mlegLimits rule 3: a 2:4 is refused, 2 x 1:2 is the same
  // eight contracts and is accepted). So 2 bought against 4 sold goes as
  // `units` 2 of a 1:2, and every per-unit figure below is per 1:2.
  const qtyOf = (l) => {
    const n = Math.floor(Number(l.qty));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  };
  const sellQty = qtyOf(sell);
  const buyQty = qtyOf(buy);
  const units = gcd(sellQty, buyQty);
  const sellRatio = sellQty / units;
  const buyRatio = buyQty / units;
  const ratioed = sellRatio !== buyRatio;

  const isPut = typeOf(a) === "P";
  const sellExp = expiryOf(sell);
  const buyExp = expiryOf(buy);
  const sellStrike = Number(sell.row.strike);
  const buyStrike = Number(buy.row.strike);
  const sameExpiry = sellExp === buyExp;
  const sameStrike = sellStrike === buyStrike;

  const structure = ratioed && sameExpiry ? "ratio" : sameExpiry ? "vertical" : sameStrike ? "calendar" : "diagonal";
  // Positive is a credit taken, negative a debit paid. One convention, the
  // same one openPosition reads to decide what to send. Per unit, so on a
  // 1:2 it is two shorts' premium less one long's.
  const credit = Math.round((sellMid * sellRatio - buyMid * buyRatio) * 10000) / 10000;
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
  let ratioBreakEvens = null;

  if (structure === "ratio") {
    // Unequal quantities on one expiry: the width formulas no longer hold, so
    // the payoff is walked instead. It is straight between strikes, so its
    // value at zero, at each strike and its slope past the top strike are the
    // whole of it.
    const r = ratioPayoff({ isPut, credit, sellStrike, buyStrike, sellRatio, buyRatio });
    maxRisk = r.maxLoss;
    maxProfit = r.maxProfit;
    ratioBreakEvens = r.breakEvens;
    const kind = isPut ? "put" : "call";
    const extra = Math.abs(sellRatio - buyRatio);
    const plural = (n) => (n > 1 ? `${kind}s` : kind);
    if (sellRatio > buyRatio && !isPut) {
      // The extra short call. With shares behind it this is the stock repair
      // (or a covered ratio write); without them it is a naked call, and the
      // ticket says which rather than printing a ceiling that is not there.
      const need = extra * units * 100;
      const shares = num(ctx?.shares) || 0;
      riskNote =
        `Sells ${sellRatio} ${plural(sellRatio)} for every ${buyRatio} bought. Above ${Math.max(sellStrike, buyStrike)} ` +
        `the extra ${plural(extra)} ${extra > 1 ? "lose" : "loses"} without limit` +
        (shares >= need
          ? `, unless covered: ${ctx?.accountName || "this account"} holds ${shares} free ${ctx?.ticker || ""} shares, enough for the ${extra * units} extra. With them, this is a stock repair.`
          : `. ${need} shares would cover the extra; ${ctx?.accountName || "this account"} has ${shares} free.`);
    } else if (sellRatio > buyRatio) {
      riskNote =
        `Sells ${sellRatio} ${plural(sellRatio)} for every ${buyRatio} bought. Below ${Math.min(sellStrike, buyStrike)} ` +
        `the extra ${plural(extra)} ${extra > 1 ? "lose" : "loses"} a dollar a share for every dollar the stock falls, ` +
        `which is the max risk at the stock going to zero.`;
    } else {
      riskNote = `Buys ${buyRatio} ${plural(buyRatio)} for every ${sellRatio} sold: the extra long ${kind} is paid for and adds no risk beyond it.`;
    }
  } else if (ratioed) {
    // Unequal quantities across two expiries: no single expiration settles the
    // legs against each other, so there is no figure to show honestly.
    riskNote =
      `${sellRatio} sold against ${buyRatio} bought across two expiries: there is no single expiration ` +
      `to measure the risk at, so none is shown.`;
  } else if (structure === "vertical") {
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
    ratio: side === "sell" ? sellRatio : buyRatio,
    side
  });
  const vertical = structure === "vertical";

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
      // Order units and per-leg contracts. `units` is what the ticket sends as
      // the order quantity; each leg's `ratio` multiplies it. `legQty` is what
      // the trader typed, kept so the ticket can show it back unchanged.
      units,
      legQty: { [sell.row.symbol]: sellQty, [buy.row.symbol]: buyQty },
      ratioLabel: ratioed ? `${buyRatio}×${sellRatio}` : null,
      targetDelta: null,
      // A width only means collateral on a 1:1 vertical.
      wingWidth: vertical ? width : null,
      width: vertical ? width : null,
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
      // A ratio's margin is the broker's to set: it depends on the cover
      // behind the extra leg, which this screen cannot see.
      collateral: vertical ? width * 100 : null,
      maxRisk,
      maxProfit,
      unlimitedRisk: maxRisk === null,
      riskNote,
      breakEvenLow: ratioBreakEvens ? ratioBreakEvens[0] ?? null : vertical && isPut ? sellStrike - credit : null,
      breakEvenHigh: ratioBreakEvens
        ? (ratioBreakEvens.length > 1 ? ratioBreakEvens[ratioBreakEvens.length - 1] : null)
        : vertical && !isPut ? sellStrike + credit : null,
      returnOnCollateral: vertical && width > 0 ? credit / width : null,
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

/**
 * A collar on shares the account holds: one put BOUGHT below the price as a
 * floor, one call SOLD above it as a cap, per 100 shares, one order.
 *
 * The owner: "I want to build the Collar strategy ... apply it on my holding."
 * The two option legs on their own are a synthetic short with a naked call in
 * it, so this refuses unless the account holds the shares that make the call
 * covered: a collar is the shares plus the two legs, never the legs alone.
 *
 * Measured like the covered call (contractSetup): against what the shares
 * cost where the basis is known, because that is what the trader actually
 * locks in; and from today's price, because that is what the collar itself
 * adds or gives up from here. Both are per collar (100 shares), at expiry.
 *
 *   net       call premium in, less put premium out (positive is a credit)
 *   floor     the put strike: below it the put pays a dollar for every dollar
 *             the shares lose
 *   cap       the call strike: above it the shares are called away
 *   worst     floor - basis + net    (at or below the put strike)
 *   best      cap   - basis + net    (at or above the call strike)
 */
export function collarSetup(legs, ctx) {
  const picked = (legs || []).filter(Boolean);
  if (picked.length !== 2) return { ok: false, reason: "A collar is one put bought and one call sold." };
  const typeOf = (l) => (l.row.type === "P" || l.row.type === "put" ? "P" : "C");
  const put = picked.find((l) => typeOf(l) === "P");
  const call = picked.find((l) => typeOf(l) === "C");
  if (!put || !call) return { ok: false, reason: "A collar is one put and one call." };
  if (put.action !== "buy" || call.action !== "sell") {
    return { ok: false, reason: "A collar buys the put and sells the call. Other put and call pairs are not supported here." };
  }
  const expiryOf = (l) => String(l.expiry || l.row.expiry || ctx?.expiry || "");
  if (expiryOf(put) !== expiryOf(call)) {
    return { ok: false, reason: "Pick the put and the call on the same expiry for a collar." };
  }
  const putStrike = Number(put.row.strike);
  const callStrike = Number(call.row.strike);
  if (!(putStrike <= callStrike)) {
    return { ok: false, reason: "The put's strike must be at or below the call's: the put is the floor, the call the cap." };
  }
  const putMid = num(put.row.mid);
  const callMid = num(call.row.mid);
  if (putMid === null || callMid === null) {
    const dead = putMid === null ? put.row.symbol : call.row.symbol;
    return { ok: false, reason: `No two-sided market on ${dead}. Nothing to price the collar from.` };
  }

  const shares = Number(ctx?.shares) || 0;
  if (shares < 100) {
    return {
      ok: false,
      reason: `A collar needs 100 free ${ctx?.ticker || ""} shares per contract in ${ctx?.accountName || "this account"}, ` +
        `which has ${shares}. Without them the call is not covered.`
    };
  }

  const expiry = expiryOf(put);
  const spot = num(ctx?.spot);
  const basis = num(ctx?.basis);
  const credit = Math.round((callMid - putMid) * 10000) / 10000;
  const per = (v) => (v === null ? null : r2(v * 100));
  const fromBasis = basis !== null && basis > 0;
  const worstBasis = fromBasis ? per(putStrike - basis + credit) : null;
  const bestBasis = fromBasis ? per(callStrike - basis + credit) : null;
  const worstSpot = spot ? per(putStrike - spot + credit) : null;
  const bestSpot = spot ? per(callStrike - spot + credit) : null;
  // The figure the shared risk panels read: the worst case against the basis
  // where it is known, from today's price where it is not. A worst case that
  // is a gain (a collar locking in profit) is no risk at all.
  const worst = fromBasis ? worstBasis : worstSpot;
  const ref = fromBasis ? basis : spot;

  const leg = (l, side) => ({
    role: side === "sell" ? "short_call" : "long_put",
    symbol: l.row.symbol,
    strike: Number(l.row.strike),
    expiry,
    type: side === "sell" ? "call" : "put",
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
      expiry,
      expiries: [expiry],
      structure: "collar",
      strategy: "collar",
      targetDelta: null,
      wingWidth: null,
      width: null,
      spot,
      spotSource: ctx?.spotSource ?? null,
      spotAsOf: ctx?.spotAsOf ?? null,
      putRatio: 1,
      callRatio: 1,
      fromChain: true,
      accountId: ctx?.accountId ?? null,
      accountName: ctx?.accountName ?? null,
      credit,
      debit: credit < 0 ? Math.abs(credit) : null,
      collateral: null,
      floor: putStrike,
      cap: callStrike,
      basis: fromBasis ? basis : null,
      basisSource: ctx?.basisSource ?? null,
      sharesHeld: shares,
      maxContracts: Math.floor(shares / 100),
      worstFromBasis: worstBasis,
      bestFromBasis: bestBasis,
      worstFromSpot: worstSpot,
      bestFromSpot: bestSpot,
      maxRisk: worst === null ? null : Math.max(0, -worst),
      maxProfit: fromBasis ? bestBasis : bestSpot,
      unlimitedRisk: false,
      riskNote: fromBasis
        ? null
        : "No cost basis on record for these shares, so the worst and best cases are measured from today's price.",
      // Where the shares plus the collar come out even, against the reference
      // price, when that point lies between the floor and the cap.
      breakEvenLow: ref !== null && ref - credit >= putStrike && ref - credit <= callStrike ? r2(ref - credit) : null,
      breakEvenHigh: null,
      returnOnCollateral: null,
      otmPct: spot ? (spot - putStrike) / spot : null,
      legs: [leg(put, "buy"), leg(call, "sell")]
    }
  };
}
