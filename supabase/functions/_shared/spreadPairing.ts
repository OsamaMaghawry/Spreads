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
      s.putRatio || 1, s.callRatio || 1
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

  // Anything left is untraceable: pair per side only, never guess a condor.
  const remaining = {};
  Object.values(legsBySymbol).forEach((leg) => {
    if (leg.qty === 0) return;
    (remaining[leg.ticker] = remaining[leg.ticker] || []).push(leg);
  });
  const loose = [];
  Object.values(remaining).forEach((legs) => {
    loose.push(...pairSide(legs, "P"), ...pairSide(legs, "C"));
  });

  // Whatever survived every pairing pass is still real money. It used to be
  // discarded here, which is why a wheel account showed an empty dashboard and
  // why a naked short call -- the one position with unbounded loss -- was the
  // one position guaranteed not to be displayed.
  const singles = [];
  // Shares back covered calls first; only what remains is reported as stock.
  const sharesLeft = {};
  Object.values(shareLots).forEach((lot) => {
    sharesLeft[lot.ticker] = (sharesLeft[lot.ticker] || 0) + lot.qty;
  });

  // Cover is allocated across a ticker's short calls before any of them is
  // named, because a short call is only naked once every cover in the account
  // has been offered to it and refused. The allocation itself lives in
  // callCover.ts, which the watch reads too -- it was written twice, the two
  // copies disagreed about a live account, and one of them had to go.
  const leftovers = Object.values(legsBySymbol).filter((l) => l.qty !== 0);
  const { bySymbol: coverage } = allocateCallCover(
    leftovers.map((l) => ({
      symbol: l.symbol, ticker: l.ticker, type: l.optionType,
      qty: l.qty, expiry: l.expiry, strike: l.strike, adjusted: l.adjusted
    })),
    sharesLeft
  );
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

// Name the shape the trader put on, without inventing arithmetic for it.
//
// A stock repair -- hold the shares, buy one call near the money, sell two
// above it to pay for it -- arrives here as three correct rows that never
// mention each other: a share lot, a covered call, a long call. Every figure
// on them is right, and the owner still had to reassemble his own position by
// eye, because nothing on the screen said the three were one trade.
//
// The temptation is to fuse them into a single "ratio spread" row with a risk
// figure of its own. That figure would have to span stock and options, which
// is exactly the double count that putting the shares' dollars back on the
// share row removed. So the rows stay as they are, each bounded by its own
// honest number, and they carry a tag that lets the screen group them under
// one heading. The sum is unchanged; only the reading improves.
//
// The shape is only claimed when all of it is present on one ticker and one
// expiry: shares, a long call, and short calls above it that the shares are
// covering. Anything less is left unnamed.
function tagStructures(rows) {
  const byTicker = {};
  rows.forEach((r) => {
    (byTicker[r.ticker] = byTicker[r.ticker] || []).push(r);
  });

  Object.values(byTicker).forEach((group) => {
    const shares = group.find((r) => r.type === KINDS.SHARES && Math.abs(r.qty) >= 100);
    if (!shares) return;
    const longCalls = group.filter(
      (r) => r.type === KINDS.LONG_OPTION && r.legs?.[0]?.kind === "call"
    );
    if (!longCalls.length) return;

    longCalls.forEach((long) => {
      const strike = long.legs[0].strike;
      const shorts = group.filter(
        (r) =>
          r.type === KINDS.COVERED_CALL &&
          r.expiry === long.expiry &&
          r.legs?.[0]?.strike > strike &&
          r.coverShares > 0
      );
      if (!shorts.length) return;
      [shares, long, ...shorts].forEach((r) => {
        r.structure = "stock_repair";
        r.structureLabel = "Stock repair";
      });
    });
  });

  return rows;
}