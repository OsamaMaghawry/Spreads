// Provenance-based spread pairing.
//
// Multi-leg structures are grouped by the Alpaca order that actually created
// them: legs filled by one multi-leg order belong to one structure. Legs we
// cannot trace back to an order are only paired per side (put spread / call
// spread) and never guessed into an iron condor.

import { parseOCCSymbol } from "./alpaca.ts";
import { KINDS, classifyLeg, riskOfKind, collateralOfKind, breakEvenOfKind, labelOfKind } from "./positionKinds.ts";
import { allocateCallCover } from "./callCover.ts";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Current option positions keyed by OCC symbol, with a signed qty.
function buildLegs(positions, activities) {
  const fillDates = {};
  (activities || []).forEach((a) => {
    if (a.symbol && a.transaction_time && !fillDates[a.symbol]) {
      fillDates[a.symbol] = a.transaction_time.substring(0, 10);
    }
  });

  const legsBySymbol = {};
  // Shares are positions too. They were dropped outright here, so a wheel's
  // assigned stock -- and the covering side of every covered call -- never
  // entered the pipeline at all.
  const shareLots = {};
  (positions || []).forEach((p) => {
    const parsed = parseOCCSymbol(p.symbol);
    if (!parsed) {
      const shareQty = parseFloat(p.qty);
      if (!Number.isFinite(shareQty) || shareQty === 0) return;
      const sym = p.symbol;
      // How many of these shares are actually free to sell.
      //
      // Alpaca holds shares behind a working sell order and reports what is
      // left as `qty_available`. Without it the close ticket offered the whole
      // position -- "Quantity (max 10)" on a lot where five were already
      // committed to a resting order -- and the broker refused the order with
      // "qty available for order (requested: 10, available: 5)". The position
      // knows; we were not reading it.
      const availableQty = p.qty_available === undefined || p.qty_available === null
        ? shareQty
        : parseFloat(p.qty_available);
      if (!shareLots[sym]) {
        shareLots[sym] = {
          symbol: sym, ticker: sym, qty: shareQty,
          qtyAvailable: Number.isFinite(availableQty) ? availableQty : shareQty,
          avgEntryPrice: Math.abs(parseFloat(p.avg_entry_price) || 0),
          currentPrice: Math.abs(parseFloat(p.current_price || p.avg_entry_price) || 0),
          marketValue: parseFloat(p.market_value || "0"),
          entryDate: fillDates[sym] || new Date().toISOString().substring(0, 10)
        };
      } else {
        shareLots[sym].qty += shareQty;
        shareLots[sym].qtyAvailable += Number.isFinite(availableQty) ? availableQty : shareQty;
        shareLots[sym].marketValue += parseFloat(p.market_value || "0");
      }
      return;
    }
    const qty = parseInt(p.qty);
    if (!legsBySymbol[p.symbol]) {
      legsBySymbol[p.symbol] = {
        symbol: p.symbol,
        ticker: parsed.ticker,
        optionType: parsed.type,
        expiry: parsed.expiry,
        expiryFormatted: parsed.expiryFormatted,
        entryDate: fillDates[p.symbol] || new Date().toISOString().substring(0, 10),
        strike: parsed.strike,
        qty,
        // A corporate action changed what this contract delivers, so no share
        // count decides whether it is covered. The flag travels with the leg
        // because the cover allocator has to refuse to judge it.
        adjusted: !!parsed.adjusted,
        avgEntryPrice: Math.abs(parseFloat(p.avg_entry_price)),
        currentPrice: Math.abs(parseFloat(p.current_price || p.avg_entry_price))
      };
    } else {
      legsBySymbol[p.symbol].qty += qty;
    }
  });
  return { legsBySymbol, shareLots };
}

// Pair shorts with longs of the same option type and expiry.
// Mutates the qty of the legs it consumes.
//
// Each short takes the NEAREST eligible long, not the first one the
// position list happens to offer. With puts at 105 short / 100 long and
// 100 short / 95 long, first-match in ascending-strike order bolted the
// 105 short onto the 95 long — a 10-wide never traded — and left the 100
// short looking naked. Same rule as tradeReconstruction's nearestLong.
//
// `allowDebit` decides whether the long may sit on the OTHER side of the
// short — long below short on calls, long above short on puts. That is a
// debit vertical: a real, bounded, extremely common structure that this
// function refused to see for its whole life, so every one of them was
// broken into a loose short and a loose long. It is off by default and on
// only where an order proves the two legs were filled together.
//
// The reason for that asymmetry is not caution about the arithmetic, which is
// settled either way. It is that without provenance the shape is ambiguous: a
// long 352.50 call bought in June and a short 375 call sold in September on a
// name whose shares you hold is a repair, not a debit spread, and pairing them
// would take the shares' cover away and rename a position the owner
// recognises. With one order behind them there is nothing to guess.
function pairSide(legs, optionType, { allowDebit = false } = {}) {
  const isCall = optionType === "C";
  const shorts = legs.filter((l) => l.optionType === optionType && l.qty < 0);
  const longs = legs.filter((l) => l.optionType === optionType && l.qty > 0);
  const out = [];
  shorts.forEach((s) => {
    let remaining = Math.abs(s.qty);
    const byDistance = longs
      .slice()
      .sort((a, b) => Math.abs(a.strike - s.strike) - Math.abs(b.strike - s.strike));
    byDistance.forEach((l) => {
      const credit = isCall ? l.strike > s.strike : l.strike < s.strike;
      const debit = isCall ? l.strike < s.strike : l.strike > s.strike;
      const strikeOk = credit || (allowDebit && debit);
      if (remaining > 0 && strikeOk && l.expiry === s.expiry && l.qty > 0) {
        const q = Math.min(remaining, l.qty);
        const legOf = (leg, side) => ({
          symbol: leg.symbol,
          side,
          kind: isCall ? "call" : "put",
          strike: leg.strike,
          ratio: 1,
          entryPrice: leg.avgEntryPrice,
          currentPrice: leg.currentPrice
        });
        out.push({
          type: isCall ? "call_spread" : "put_spread",
          // Which way round the strikes sit decides the whole arithmetic
          // downstream -- max risk, break-even, what the close can cost -- so
          // it is stated on the structure rather than re-derived from the
          // strikes in four different places.
          direction: credit ? "credit" : "debit",
          legs: [legOf(s, "short"), legOf(l, "long")],
          ticker: s.ticker,
          expiry: s.expiry,
          expiryFormatted: s.expiryFormatted,
          entryDate: s.entryDate,
          shortSymbol: s.symbol,
          longSymbol: l.symbol,
          shortStrike: s.strike,
          longStrike: l.strike,
          qty: q,
          shortEntryPrice: s.avgEntryPrice,
          longEntryPrice: l.avgEntryPrice,
          shortCurrentPrice: s.currentPrice,
          longCurrentPrice: l.currentPrice
        });
        remaining -= q;
        l.qty -= q;
        s.qty += q;
      }
    });
  });
  return out;
}

// A CALL RATIO: more short calls than long ones, at one strike each, filled by
// one order. Long 1 at 352.50 against short 2 at 362.50 over stock you already
// hold is a stock repair, and it is one position, not two.
//
// It was being taken apart every way the code knew how. First the vertical
// pairing could only see a long ABOVE a short, so the whole thing fell through
// to the leftovers and read as two covered calls plus a loose long. Then, once
// the vertical pairing learned the debit direction, it did something worse: it
// paired one long with one short and left the other short to be covered by
// shares, so the two identical contracts the owner sold in one trade appeared
// on two different cards, one of them a "spread" and one of them a "covered
// call". A trader who put on 1x2 should see 1x2.
//
// So the ratio is matched BEFORE the verticals and consumes all of its legs.
// What it does not do is invent a risk figure spanning stock and options: the
// extra short is offered the account's shares by the same allocator every
// other short call goes through, and the stock's dollars stay on the stock's
// row. Covered, the ratio can lose only what it cost; uncovered, it is
// unbounded and says so.
//
// Deliberately narrow: one long strike, one short strike, one expiry, more
// shorts than longs, calls only. Anything else stays with the pairing that
// already handles it rather than being guessed into a structure. Puts are
// excluded because an excess short put is cash-secured by construction on this
// broker, and the leftover pass already names it exactly that.
function pairRatios(legs) {
  const out = [];
  const calls = legs.filter((l) => l.optionType === "C");
  const byExpiry = {};
  calls.forEach((l) => {
    if (l.qty === 0) return;
    (byExpiry[l.expiry] = byExpiry[l.expiry] || []).push(l);
  });

  Object.values(byExpiry).forEach((group) => {
    const longs = group.filter((l) => l.qty > 0);
    const shorts = group.filter((l) => l.qty < 0);
    if (longs.length !== 1 || shorts.length !== 1) return;
    const long = longs[0];
    const short = shorts[0];
    const longQty = long.qty;
    const shortQty = Math.abs(short.qty);
    if (!(shortQty > longQty) || longQty < 1) return;

    const units = gcd(longQty, shortQty);
    const longRatio = longQty / units;
    const shortRatio = shortQty / units;
    const legOf = (leg, side, ratio) => ({
      symbol: leg.symbol,
      side,
      kind: "call",
      strike: leg.strike,
      ratio,
      entryPrice: leg.avgEntryPrice,
      currentPrice: leg.currentPrice
    });

    out.push({
      type: "call_ratio_spread",
      ratio: true,
      legs: [legOf(short, "short", shortRatio), legOf(long, "long", longRatio)],
      ticker: short.ticker,
      expiry: short.expiry,
      expiryFormatted: short.expiryFormatted,
      entryDate: short.entryDate < long.entryDate ? short.entryDate : long.entryDate,
      shortSymbol: short.symbol,
      longSymbol: long.symbol,
      shortStrike: short.strike,
      longStrike: long.strike,
      qty: units,
      longRatio,
      shortRatio,
      // The shorts nothing inside the structure offsets. These are what the
      // account's shares have to cover for the ratio to be bounded at all.
      excessShorts: (shortRatio - longRatio) * units,
      adjusted: !!(short.adjusted || long.adjusted),
      shortEntryPrice: short.avgEntryPrice,
      longEntryPrice: long.avgEntryPrice,
      shortCurrentPrice: short.currentPrice,
      longCurrentPrice: long.currentPrice
    });

    long.qty -= longQty;
    short.qty += shortQty;
  });

  return out;
}

// Combine a put spread and a call spread that were opened by the SAME order
// into an iron condor. Ratios come from the leg quantities via GCD.
function toCondor(p, c) {
  const units = gcd(p.qty, c.qty);
  const putRatio = p.qty / units;
  const callRatio = c.qty / units;
  return {
    type: "iron_condor",
    ticker: p.ticker,
    expiry: p.expiry,
    expiryFormatted: p.expiryFormatted,
    entryDate: p.entryDate < c.entryDate ? p.entryDate : c.entryDate,
    shortSymbol: p.shortSymbol,
    longSymbol: p.longSymbol,
    callShortSymbol: c.shortSymbol,
    callLongSymbol: c.longSymbol,
    shortStrike: p.shortStrike,
    longStrike: p.longStrike,
    callShortStrike: c.shortStrike,
    callLongStrike: c.longStrike,
    qty: units,
    putRatio,
    callRatio,
    legs: [
      ...p.legs.map((l) => ({ ...l, ratio: putRatio })),
      ...c.legs.map((l) => ({ ...l, ratio: callRatio }))
    ],
    shortEntryPrice: putRatio * p.shortEntryPrice + callRatio * c.shortEntryPrice,
    longEntryPrice: putRatio * p.longEntryPrice + callRatio * c.longEntryPrice,
    shortCurrentPrice: putRatio * p.shortCurrentPrice + callRatio * c.shortCurrentPrice,
    longCurrentPrice: putRatio * p.longCurrentPrice + callRatio * c.longCurrentPrice
  };
}

// A filled multi-leg order claims quantity from the still-unassigned positions.
// Returns cloned leg slices (with the claimed qty) or null when the order can no
// longer be matched to live positions.
function claimOrderLegs(order, legsBySymbol) {
  const orderLegs = Array.isArray(order.legs) ? order.legs : [];
  if (orderLegs.length < 2) return null;

  const claims = [];
  for (const ol of orderLegs) {
    const pos = legsBySymbol[ol.symbol];
    const filled = parseInt(ol.filled_qty || "0");
    if (!pos || !filled) return null;
    const wantShort = ol.side === "sell";
    if (wantShort ? pos.qty >= 0 : pos.qty <= 0) return null;
    const take = Math.min(filled, Math.abs(pos.qty));
    if (!take) return null;
    claims.push({ pos, take, wantShort });
  }

  // The claim is NOT committed here.
  //
  // It used to be: this deducted from legsBySymbol and handed the copies to
  // pairSide. When pairSide could not pair them -- a call order whose long
  // sits BELOW its short is a ratio spread, not a vertical, and fails the
  // strike test -- nothing was emitted and the legs had already been removed
  // from the pool, so they never reached the leftovers pass that describes an
  // unpaired leg on its own. Two real TSLA legs vanished off a live dashboard
  // that way, and the shares behind them were then miscounted, because the
  // covered call that should have claimed them was one of the two.
  //
  // So the caller commits only what the pairing actually consumed. `source`
  // is the leg in the pool; `claimedQty` is what this order asked for.
  return claims.map(({ pos, take, wantShort }) => ({
    ...pos,
    qty: wantShort ? -take : take,
    source: pos,
    claimedQty: wantShort ? -take : take
  }));
}

// Give back whatever the pairing did not use. pairSide moves a claimed leg's
// qty toward zero as it consumes it, so the difference between what was
// claimed and what is left is what actually became a spread.
function commitClaims(claimed) {
  claimed.forEach((c) => {
    const consumed = Math.abs(c.claimedQty) - Math.abs(c.qty);
    if (consumed <= 0) return;
    c.source.qty += c.source.qty < 0 ? consumed : -consumed;
  });
}

// Merge structures with identical strikes / expiry (opened by separate orders)
// into one row, summing qty and qty-weighting the per-unit entry prices.
function mergeIdentical(spreads) {
  const merged = [];
  const byKey = {};
  spreads.forEach((s) => {
    const key = [
      s.type, s.ticker, s.expiry,
      s.shortStrike, s.longStrike, s.callShortStrike, s.callLongStrike,
      s.putRatio || 1, s.callRatio || 1,
      // Two 1x2s merge; a 1x2 and a 1x3 are different positions.
      s.longRatio || 1, s.shortRatio || 1
    ].join("|");
    const existing = byKey[key];
    if (!existing) {
      byKey[key] = { ...s };
      merged.push(byKey[key]);
      return;
    }
    const total = existing.qty + s.qty;
    const avg = (a, b) => (a * existing.qty + b * s.qty) / total;
    existing.shortEntryPrice = avg(existing.shortEntryPrice, s.shortEntryPrice);
    existing.longEntryPrice = avg(existing.longEntryPrice, s.longEntryPrice);
    existing.qty = total;
    // A ratio's cover is counted in contracts and shares, not averaged: two
    // 1x2s covered by 100 shares each are two excess shorts and 200 shares,
    // and both are only covered if both were.
    if (s.excessShorts) existing.excessShorts = (existing.excessShorts || 0) + s.excessShorts;
    if (s.coverShares) existing.coverShares = (existing.coverShares || 0) + s.coverShares;
    if (s.ratioCovered !== undefined) existing.ratioCovered = !!existing.ratioCovered && !!s.ratioCovered;
    if (s.entryDate < existing.entryDate) existing.entryDate = s.entryDate;
  });
  return merged;
}

// positions/activities from Alpaca, plus filled historical orders (nested=true).
// One leftover leg or share lot, described as what it is.
//
// Everything pairing could not explain arrives here rather than being dropped.
// The shares pool is consumed as covered calls claim it, so ten short calls
// against one hundred shares report as naked -- which they overwhelmingly are.
function toSinglePosition(leg, kind, extra = {}) {
  const contracts = Math.abs(leg.qty);
  const short = leg.qty < 0;
  return {
    type: kind,
    kindLabel: labelOfKind(kind),
    single: true,
    ticker: leg.ticker,
    expiry: leg.expiry,
    expiryFormatted: leg.expiryFormatted,
    entryDate: leg.entryDate,
    qty: contracts,
    legs: [{
      symbol: leg.symbol,
      side: short ? "short" : "long",
      kind: leg.optionType === "C" ? "call" : "put",
      strike: leg.strike,
      ratio: 1,
      entryPrice: leg.avgEntryPrice,
      currentPrice: leg.currentPrice
    }],
    // The close ticket reads shortSymbol/longSymbol; a single leg fills whichever
    // side it actually is so the existing path can price and close it unchanged.
    shortSymbol: short ? leg.symbol : null,
    longSymbol: short ? null : leg.symbol,
    shortStrike: short ? leg.strike : null,
    longStrike: short ? null : leg.strike,
    shortEntryPrice: short ? leg.avgEntryPrice : 0,
    longEntryPrice: short ? 0 : leg.avgEntryPrice,
    shortCurrentPrice: short ? leg.currentPrice : 0,
    longCurrentPrice: short ? 0 : leg.currentPrice,
    maxRisk: riskOfKind(kind, { ...leg, ...extra }),
    breakEven: breakEvenOfKind(kind, { ...leg, ...extra }),
    collateral: collateralOfKind(kind, { ...leg, ...extra }),
    ...extra
  };
}

function toSharePosition(lot) {
  return {
    type: KINDS.SHARES,
    kindLabel: labelOfKind(KINDS.SHARES),
    single: true,
    shares: true,
    ticker: lot.ticker,
    expiry: null,
    expiryFormatted: null,
    entryDate: lot.entryDate,
    qty: Math.abs(lot.qty),
    shareQty: lot.qty,
    // What the broker will actually accept a sell order for right now: the
    // holding minus whatever a working order already has spoken for.
    qtyAvailable: Math.abs(lot.qtyAvailable ?? lot.qty),
    legs: [],
    shortSymbol: null,
    longSymbol: lot.symbol,
    shortStrike: null,
    longStrike: null,
    shortEntryPrice: 0,
    longEntryPrice: lot.avgEntryPrice,
    shortCurrentPrice: 0,
    longCurrentPrice: lot.currentPrice,
    marketValue: lot.marketValue,
    // Adjusted where the wheel's history allows it, else the broker's -- and
    // the row says which, never silently one or the other.
    shareBasis: lot.adjustedBasis ?? lot.avgEntryPrice,
    basisSource: lot.basisSource || "broker",
    premiumCollected: lot.premiumCollected || 0,
    maxRisk: riskOfKind(KINDS.SHARES, { ...lot, shareQty: lot.qty, shareBasis: lot.adjustedBasis ?? lot.avgEntryPrice }),
    breakEven: breakEvenOfKind(KINDS.SHARES, { ...lot, shareBasis: lot.adjustedBasis ?? lot.avgEntryPrice }),
    collateral: collateralOfKind(KINDS.SHARES, lot)
  };
}

// positions/activities from Alpaca, plus filled historical orders (nested=true).
// `cash` lets a short put be judged secured or not; without it we do not assume.
// basisByTicker: from wheelBasis.basisByTicker -- the adjusted cost of held
// shares once the wheel's premiums are counted. Optional; without it every
// share lot carries the broker's basis, labelled as such.
export function pairSpreads(positions, activities, filledOrders = [], { cash = null, basisByTicker = {} } = {}) {
  const { legsBySymbol, shareLots } = buildLegs(positions, activities);
  for (const lot of Object.values(shareLots)) {
    const b = basisByTicker?.[lot.ticker];
    if (b && b.source === "adjusted") {
      lot.adjustedBasis = b.basis;
      lot.basisSource = "adjusted";
      lot.premiumCollected = b.collected;
    } else {
      lot.basisSource = "broker";
      lot.premiumCollected = 0;
    }
  }

  // Oldest orders first so FIFO-style claims match how the positions were built.
  const orders = (Array.isArray(filledOrders) ? filledOrders : [])
    .filter((o) => Array.isArray(o.legs) && o.legs.length >= 2)
    .sort((a, b) => String(a.filled_at || a.submitted_at || "").localeCompare(String(b.filled_at || b.submitted_at || "")));

  const proven = [];
  orders.forEach((o) => {
    const claimed = claimOrderLegs(o, legsBySymbol);
    if (!claimed) return;
    // A ratio is matched first, because the vertical pairing would otherwise
    // take one of its shorts and leave the other looking like a covered call
    // on its own card.
    proven.push(...pairRatios(claimed));
    // One order filled these legs together, so a long on the far side of a
    // short is a debit vertical this order put on, not a coincidence.
    const puts = pairSide(claimed, "P", { allowDebit: true });
    const calls = pairSide(claimed, "C", { allowDebit: true });
    // Within one order, a put spread + call spread IS an iron condor -- but
    // only when both sides are credit verticals. Two DEBIT verticals are a
    // reverse condor, whose risk is the debit paid and not the width less a
    // credit, and the condor arithmetic downstream would read it upside down.
    // They stay as the two spreads they are.
    const creditPuts = puts.filter((s) => s.direction !== "debit");
    const creditCalls = calls.filter((s) => s.direction !== "debit");
    while (creditPuts.length && creditCalls.length) {
      const p = creditPuts.shift();
      const c = creditCalls.shift();
      puts.splice(puts.indexOf(p), 1);
      calls.splice(calls.indexOf(c), 1);
      proven.push(toCondor(p, c));
    }
    proven.push(...puts, ...calls);
    commitClaims(claimed);
  });

  // Shares back short calls, so the pool is built before anything is named.
  const sharesLeft = {};
  Object.values(shareLots).forEach((lot) => {
    sharesLeft[lot.ticker] = (sharesLeft[lot.ticker] || 0) + lot.qty;
  });

  // Anything left is untraceable: pair per side only, never guess a condor.
  const remaining = {};
  Object.values(legsBySymbol).forEach((leg) => {
    if (leg.qty === 0) return;
    (remaining[leg.ticker] = remaining[leg.ticker] || []).push(leg);
  });
  const loose = [];
  Object.entries(remaining).forEach(([ticker, legs]) => {
    // A ratio is claimed without an order behind it only when the STOCK is
    // there. That is what removes the ambiguity: a long call, more short
    // calls above it at the same expiry, and a hundred shares or more on the
    // same name is a repair and nothing else — the shares are the reason the
    // extra short was sold. In an account holding no stock the same two legs
    // could be anything, so they go to the per-side pairing as before.
    //
    // Repairs are placed by hand, leg by leg, as often as they are placed as
    // one order. Requiring provenance would have named this one on Monday and
    // not on Tuesday depending on how the owner clicked.
    if (Math.abs(sharesLeft[ticker] || 0) >= 100) loose.push(...pairRatios(legs));
    loose.push(...pairSide(legs, "P"), ...pairSide(legs, "C"));
  });

  // Whatever survived every pairing pass is still real money. It used to be
  // discarded here, which is why a wheel account showed an empty dashboard and
  // why a naked short call -- the one position with unbounded loss -- was the
  // one position guaranteed not to be displayed.
  const singles = [];

  // Cover is allocated across a ticker's short calls before any of them is
  // named, because a short call is only naked once every cover in the account
  // has been offered to it and refused. The allocation itself lives in
  // callCover.ts, which the watch reads too -- it was written twice, the two
  // copies disagreed about a live account, and one of them had to go.
  const leftovers = Object.values(legsBySymbol).filter((l) => l.qty !== 0);
  // A ratio's excess shorts queue for cover beside every other short call,
  // through the same allocator and in the same expiry order. They are passed
  // as one synthetic leg rather than given a private rule, so a ratio and a
  // covered call on one ticker cannot both claim the same hundred shares.
  const ratios = [...proven, ...loose].filter((p) => p.type === "call_ratio_spread" && p.excessShorts > 0);
  const ratioLegs = ratios.map((r, i) => ({
    symbol: `${r.shortSymbol}~ratio${i}`,
    ticker: r.ticker,
    type: "C",
    qty: -r.excessShorts,
    expiry: r.expiry,
    strike: r.shortStrike,
    adjusted: r.adjusted
  }));
  const { bySymbol: coverage } = allocateCallCover(
    [
      ...leftovers.map((l) => ({
        symbol: l.symbol, ticker: l.ticker, type: l.optionType,
        qty: l.qty, expiry: l.expiry, strike: l.strike, adjusted: l.adjusted
      })),
      ...ratioLegs
    ],
    sharesLeft
  );
  ratios.forEach((r, i) => {
    const c = coverage[ratioLegs[i].symbol];
    if (!c) return;
    r.coverShares = c.judged ? c.fromShares * 100 : 0;
    r.coverLongs = c.byLongs;
    // Covered, the ratio can lose only what it cost. Uncovered, the extra
    // short has nothing above it and the loss has no bound -- and an adjusted
    // contract is neither, so it is not claimed as covered either.
    r.ratioCovered = c.judged && c.uncovered === 0;
    r.coverJudged = c.judged;
  });
  // The allocator returns what it consumed; the pool here has to follow it,
  // because the share row's encumbrance is read off this object below.
  Object.values(coverage).forEach((c) => {
    if (!c.judged || !c.fromShares) return;
    sharesLeft[c.ticker] = (sharesLeft[c.ticker] || 0) - c.fromShares * 100;
  });

  // Premium written against the shares rides with the lot, because the share
  // row now carries the whole holding and its risk.
  const writtenAgainstShares = {};
  leftovers.forEach((leg) => {
    const c = coverage[leg.symbol];
    if (!c || !c.judged || !c.fromShares) return;
    writtenAgainstShares[leg.ticker] =
      (writtenAgainstShares[leg.ticker] || 0) + Math.abs(leg.avgEntryPrice || 0) * 100 * c.fromShares;
  });
  // A ratio's excess short is premium written against the same stock, so it
  // lowers the share row's downside exactly as a covered call's does.
  ratios.forEach((r, i) => {
    const c = coverage[ratioLegs[i].symbol];
    if (!c || !c.judged || !c.fromShares) return;
    writtenAgainstShares[r.ticker] =
      (writtenAgainstShares[r.ticker] || 0) + Math.abs(r.shortEntryPrice || 0) * 100 * c.fromShares;
  });

  // A short call that is PART covered is two positions, and is emitted as two.
  //
  // It used to be one, named by whether anything was left over: ten short
  // calls against a hundred shares reported as ten naked calls, so riskOfKind
  // returned null for all ten and the account's total risk went unbounded on
  // account of nine contracts while the tenth -- genuinely covered, genuinely
  // bounded -- was swallowed by the same label. Naming it the other way is no
  // better: it would hide nine unbounded contracts behind one covered one.
  // The position is a covered call and a naked call, so the screen shows a
  // covered call and a naked call.
  const coverExtra = (leg, cover) => {
    const lot = shareLots[leg.ticker];
    return {
      shareBasis: lot ? (lot.adjustedBasis ?? lot.avgEntryPrice) : 0,
      shareMarketPrice: lot ? lot.currentPrice : 0,
      basisSource: lot ? lot.basisSource : "broker",
      premiumCollected: lot ? lot.premiumCollected : 0,
      // What is actually behind it, named, so the card can say so instead of
      // leaving the trader to work out which cover was claimed.
      coveredBy: cover.byLongs.length === 0 && lot ? lot.symbol : null,
      coverShares: cover.fromShares * 100,
      coverLongs: cover.byLongs
    };
  };

  leftovers.sort((a, b) => a.qty - b.qty);
  leftovers.forEach((leg) => {
    const cover = coverage[leg.symbol];
    const isShortCall = leg.optionType === "C" && leg.qty < 0;

    if (isShortCall && cover && !cover.judged) {
      // Adjusted: neither covered nor naked, and said so on the row.
      singles.push(toSinglePosition(leg, KINDS.SHORT_CALL_UNJUDGED, { adjusted: true }));
      return;
    }

    if (isShortCall && cover && cover.covered > 0 && cover.uncovered > 0) {
      singles.push(toSinglePosition({ ...leg, qty: -cover.covered }, KINDS.COVERED_CALL, coverExtra(leg, cover)));
      singles.push(toSinglePosition({ ...leg, qty: -cover.uncovered }, KINDS.NAKED_CALL, {}));
      return;
    }

    const kind =
      isShortCall && cover
        ? cover.uncovered > 0
          ? KINDS.NAKED_CALL
          : KINDS.COVERED_CALL
        : classifyLeg(leg, { shares: 0, cash });
    if (!kind) return;
    singles.push(toSinglePosition(leg, kind, kind === KINDS.COVERED_CALL ? coverExtra(leg, cover) : {}));
  });

  Object.values(shareLots).forEach((lot) => {
    const left = sharesLeft[lot.ticker] || 0;
    // The row reports the WHOLE holding, always.
    //
    // It used to report only what was left after covered calls claimed their
    // shares, so a trader holding 210 read "10 shares" — and at exact cover
    // the stock row disappeared from the screen entirely. No such lot exists
    // anywhere: not at the broker, not in a tax lot, not on a sell ticket.
    // The encumbrance is stated beside the quantity instead, and the risk
    // column carries the whole lot net of the premium written against it,
    // which is why the covered call's own risk is now zero rather than the
    // stock's.
    const encumbered = Math.max(0, Math.abs(lot.qty) - Math.abs(left));
    // qtyAvailable is the BROKER's number and nothing else.
    //
    // It briefly became `min(broker available, unencumbered)`, which turned a
    // piece of our own bookkeeping into a hard cap on what the owner could
    // sell: a holding of 210 shares with two covered calls written against it
    // offered a maximum of 10 on the close ticket. No such limit exists. The
    // broker will sell all 210 — the covered calls simply become naked, which
    // is the owner's decision to make, on his own stock, and ours only to
    // warn about. Capping it was the app substituting its opinion for his
    // authority over his own position.
    //
    // So the two numbers are kept apart and mean what they say: qtyAvailable
    // is what the broker will accept an order for (the holding, less anything
    // a working sell order already claims), and encumberedQty is how much of
    // it is currently backing short calls -- shown as a note, enforced
    // nowhere.
    const available = Math.abs(lot.qtyAvailable ?? lot.qty);
    const premiumWritten = Math.round((writtenAgainstShares[lot.ticker] || 0) * 100) / 100;
    singles.push({
      // premiumWritten goes IN, not on afterwards: riskOfKind reads it to net
      // the written credit off the lot's downside, and it runs inside here.
      ...toSharePosition({ ...lot, qtyAvailable: available, premiumWritten }),
      encumberedQty: encumbered,
      freeQty: Math.abs(left),
      premiumWritten
    });
  });

  return tagStructures([...mergeIdentical([...proven, ...loose].filter((s) => s.qty > 0)), ...singles]);
}

// Name the trade the owner put on, across the rows it is made of.
//
// A stock repair is a call ratio over stock: hold the shares, buy one call
// near the money, sell two above it to pay for it. The ratio itself is one
// row now (pairRatios), but the shares that make its extra short bounded are
// a row of their own, and have to be -- fusing them would put stock dollars
// inside an options figure, which is the double count that moving the shares'
// downside back onto the share row removed. So the two rows keep their own
// honest numbers and carry a tag saying they are one trade.
//
// Only claimed when the whole shape is there: a call ratio whose excess short
// is actually covered by this ticker's shares. A ratio in an account holding
// no stock is a ratio, not a repair, and is left named as what it is.
function tagStructures(rows) {
  const byTicker = {};
  rows.forEach((r) => {
    (byTicker[r.ticker] = byTicker[r.ticker] || []).push(r);
  });

  Object.values(byTicker).forEach((group) => {
    const shares = group.find((r) => r.type === KINDS.SHARES && Math.abs(r.qty) >= 100);
    if (!shares) return;
    const repairs = group.filter((r) => r.type === "call_ratio_spread" && r.coverShares > 0);
    if (!repairs.length) return;
    [shares, ...repairs].forEach((r) => {
      r.structure = "stock_repair";
      r.structureLabel = "Stock repair";
    });
  });

  return rows;
}