// Provenance-based spread pairing.
//
// Multi-leg structures are grouped by the Alpaca order that actually created
// them: legs filled by one multi-leg order belong to one structure. Legs we
// cannot trace back to an order are only paired per side (put spread / call
// spread) and never guessed into an iron condor.

import { parseOCCSymbol } from "./alpaca.ts";
import { KINDS, classifyLeg, riskOfKind, collateralOfKind, breakEvenOfKind, labelOfKind } from "./positionKinds.ts";

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
      if (!shareLots[sym]) {
        shareLots[sym] = {
          symbol: sym, ticker: sym, qty: shareQty,
          avgEntryPrice: Math.abs(parseFloat(p.avg_entry_price) || 0),
          currentPrice: Math.abs(parseFloat(p.current_price || p.avg_entry_price) || 0),
          marketValue: parseFloat(p.market_value || "0"),
          entryDate: fillDates[sym] || new Date().toISOString().substring(0, 10)
        };
      } else {
        shareLots[sym].qty += shareQty;
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
        avgEntryPrice: Math.abs(parseFloat(p.avg_entry_price)),
        currentPrice: Math.abs(parseFloat(p.current_price || p.avg_entry_price))
      };
    } else {
      legsBySymbol[p.symbol].qty += qty;
    }
  });
  return { legsBySymbol, shareLots };
}

// Pair shorts with protective longs of the same option type.
// Puts: long strike below short. Calls: long strike above short.
// Mutates the qty of the legs it consumes.
//
// Each short takes the NEAREST eligible long, not the first one the
// position list happens to offer. With puts at 105 short / 100 long and
// 100 short / 95 long, first-match in ascending-strike order bolted the
// 105 short onto the 95 long — a 10-wide never traded — and left the 100
// short looking naked. Same rule as tradeReconstruction's nearestLong.
function pairSide(legs, optionType) {
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
      const strikeOk = isCall ? l.strike > s.strike : l.strike < s.strike;
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

  return claims.map(({ pos, take, wantShort }) => {
    pos.qty += wantShort ? take : -take;
    return { ...pos, qty: wantShort ? -take : take };
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
    const puts = pairSide(claimed, "P");
    const calls = pairSide(claimed, "C");
    // Within one order, a put spread + call spread IS an iron condor.
    while (puts.length && calls.length) {
      proven.push(toCondor(puts.shift(), calls.shift()));
    }
    proven.push(...puts, ...calls);
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

  // Shorts before longs, so a covered call claims its shares before a long leg
  // in the same name is described.
  const leftovers = Object.values(legsBySymbol).filter((l) => l.qty !== 0);
  leftovers.sort((a, b) => a.qty - b.qty);
  leftovers.forEach((leg) => {
    const shares = sharesLeft[leg.ticker] || 0;
    const kind = classifyLeg(leg, { shares, cash });
    if (!kind) return;
    let extra = {};
    if (kind === KINDS.COVERED_CALL) {
      const claimed = Math.abs(leg.qty) * 100;
      sharesLeft[leg.ticker] = shares - claimed;
      const lot = shareLots[leg.ticker];
      extra = {
        shareBasis: lot ? (lot.adjustedBasis ?? lot.avgEntryPrice) : 0,
        shareMarketPrice: lot ? lot.currentPrice : 0,
        basisSource: lot ? lot.basisSource : "broker",
        premiumCollected: lot ? lot.premiumCollected : 0,
        coveredBy: lot ? lot.symbol : null
      };
    }
    singles.push(toSinglePosition(leg, kind, extra));
  });

  Object.values(shareLots).forEach((lot) => {
    const left = sharesLeft[lot.ticker] || 0;
    if (Math.abs(left) < 1) return; // fully committed to covered calls
    singles.push(toSharePosition({ ...lot, qty: left, marketValue: lot.marketValue * (left / lot.qty) }));
  });

  return [...mergeIdentical([...proven, ...loose].filter((s) => s.qty > 0)), ...singles];
}