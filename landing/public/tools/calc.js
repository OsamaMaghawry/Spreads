// The arithmetic behind every calculator on /tools, and nothing else.
//
// Pure functions: numbers in, numbers out, no DOM. Each page imports what it
// needs and does its own drawing, and landing/src/tools.test.js imports the
// same file, so the figures a visitor sees are the figures the tests checked.
//
// Every input is per share, as option prices are quoted; one contract is 100
// shares. A function either returns { error } with a sentence a visitor can
// act on, or the result. Expiration figures only: nothing here prices an
// option before expiration.

export const SHARES = 100;

const pos = (v) => typeof v === "number" && isFinite(v) && v > 0;
const contracts = (q) => Math.max(1, Math.round(pos(q) ? q : 1));

// ---------- credit spread (bull put / bear call) ----------

export function creditSpread({ kind, short, long, credit, qty }) {
  if (!pos(short) || !pos(long)) return { error: "Enter both strikes." };
  if (kind === "put" && !(short > long)) return { error: "For a put credit spread the short (sold) strike is the higher one." };
  if (kind === "call" && !(short < long)) return { error: "For a call credit spread the short (sold) strike is the lower one." };
  const width = Math.abs(short - long);
  if (!pos(credit)) return { error: "Enter the credit you received, per share (for example 1.20)." };
  if (!(credit < width)) return { error: "The credit cannot be as large as the width between the strikes." };
  const n = contracts(qty);
  const maxProfit = credit * SHARES * n;
  const maxLoss = (width - credit) * SHARES * n;
  return {
    kind, short, long, credit, qty: n, width,
    maxProfit, maxLoss,
    breakEven: kind === "put" ? short - credit : short + credit,
    ror: maxProfit / maxLoss,
    collateral: width * SHARES * n,
    kinks: [short, long],
    pl: (s) => (credit - (kind === "put"
      ? Math.max(0, short - s) - Math.max(0, long - s)
      : Math.max(0, s - short) - Math.max(0, s - long))) * SHARES * n
  };
}

// ---------- iron condor ----------

export function ironCondor({ longPut, shortPut, shortCall, longCall, credit, qty }) {
  if (![longPut, shortPut, shortCall, longCall].every(pos)) return { error: "Enter all four strikes." };
  if (!(longPut < shortPut)) return { error: "The long put (bought) must be below the short put (sold)." };
  if (!(shortPut <= shortCall)) return { error: "The short put must not be above the short call." };
  if (!(shortCall < longCall)) return { error: "The long call (bought) must be above the short call (sold)." };
  if (!pos(credit)) return { error: "Enter the total credit for all four legs, per share (for example 1.50)." };
  const putWidth = shortPut - longPut;
  const callWidth = longCall - shortCall;
  const wide = Math.max(putWidth, callWidth);
  if (!(credit < wide)) return { error: "The credit cannot be as large as the wider wing." };
  const n = contracts(qty);
  const maxProfit = credit * SHARES * n;
  const maxLoss = (wide - credit) * SHARES * n;
  // A wing narrower than the credit cannot lose at expiration, so it has no
  // break-even on that side. Real only on a very lopsided condor.
  const lowerBreakEven = credit < putWidth ? shortPut - credit : null;
  const upperBreakEven = credit < callWidth ? shortCall + credit : null;
  return {
    longPut, shortPut, shortCall, longCall, credit, qty: n,
    putWidth, callWidth,
    maxProfit, maxLoss,
    putSideLoss: (putWidth - credit) * SHARES * n,
    callSideLoss: (callWidth - credit) * SHARES * n,
    lowerBreakEven, upperBreakEven,
    profitZone: lowerBreakEven != null && upperBreakEven != null ? upperBreakEven - lowerBreakEven : null,
    ror: maxProfit / maxLoss,
    collateral: wide * SHARES * n,
    kinks: [longPut, shortPut, shortCall, longCall],
    pl: (s) => (credit
      - (Math.max(0, shortPut - s) - Math.max(0, longPut - s))
      - (Math.max(0, s - shortCall) - Math.max(0, s - longCall))) * SHARES * n
  };
}

// ---------- covered call ----------

export function coveredCall({ price, strike, premium, days, qty }) {
  if (!pos(price)) return { error: "Enter the stock price (what you paid, or the price now)." };
  if (!pos(strike)) return { error: "Enter the call's strike." };
  if (!pos(premium)) return { error: "Enter the premium you receive for the call, per share." };
  if (!(premium < price)) return { error: "The premium cannot be as large as the stock price." };
  if (!(strike + premium > price)) return { error: "That call is worth less than the amount it is in the money (stock price minus strike). Check the premium." };
  if (!pos(days)) return { error: "Enter the days to expiration (1 or more)." };
  const n = contracts(qty);
  const year = 365 / days;
  const ifCalled = (strike - price + premium) / price;
  // If the stock finishes where it is now. Above the strike that still means
  // the shares are called away, which the formula covers.
  const ifFlat = (premium - Math.max(0, price - strike)) / price;
  return {
    price, strike, premium, days, qty: n,
    premiumIncome: premium * SHARES * n,
    capital: price * SHARES * n,
    maxProfit: (strike - price + premium) * SHARES * n,
    ifCalled, ifCalledYear: ifCalled * year,
    ifFlat, ifFlatYear: ifFlat * year,
    breakEven: price - premium,
    protection: premium / price,
    kinks: [strike],
    pl: (s) => ((s - price) - Math.max(0, s - strike) + premium) * SHARES * n
  };
}

// ---------- cash-secured put ----------

export function cashSecuredPut({ strike, premium, days, qty, price }) {
  if (!pos(strike)) return { error: "Enter the put's strike." };
  if (!pos(premium)) return { error: "Enter the premium you receive for the put, per share." };
  if (!(premium < strike)) return { error: "The premium cannot be as large as the strike." };
  if (!pos(days)) return { error: "Enter the days to expiration (1 or more)." };
  const n = contracts(qty);
  const onCash = premium / strike;
  const costBasis = strike - premium;
  const spot = pos(price) ? price : null;
  return {
    strike, premium, days, qty: n, price: spot,
    collateral: strike * SHARES * n,
    premiumIncome: premium * SHARES * n,
    onCash, onCashYear: onCash * 365 / days,
    // Some brokers hold the strike minus the premium already received.
    onNetCash: premium / costBasis,
    breakEven: costBasis,
    costBasis,
    maxLoss: costBasis * SHARES * n,
    // How far below today's price the effective purchase would be.
    discount: spot ? (spot - costBasis) / spot : null,
    cushion: spot ? (spot - strike) / spot : null,
    kinks: [strike],
    pl: (s) => (premium - Math.max(0, strike - s)) * SHARES * n
  };
}

// ---------- expected move ----------

// Normal-distribution share inside ±1 and ±2 standard deviations.
export const ONE_SD = 0.6827;
export const TWO_SD = 0.9545;
// An at-the-money straddle is worth about sqrt(2/pi) = 0.798 of a one-sd move
// (Black-Scholes, rates ignored). It prices the average size of the move.
export const STRADDLE_FACTOR = Math.sqrt(2 / Math.PI);

export function expectedMove({ price, iv, days }) {
  if (!pos(price)) return { error: "Enter the stock price." };
  if (!pos(iv)) return { error: "Enter the implied volatility as a percent (for example 32)." };
  if (!(iv <= 500)) return { error: "Enter implied volatility as a percent: 32 means 32%." };
  if (!pos(days)) return { error: "Enter the days to expiration (1 or more)." };
  const move = price * (iv / 100) * Math.sqrt(days / 365);
  return rangeOf(price, move, iv, days);
}

export function expectedMoveFromStraddle({ price, straddle, days }) {
  if (!pos(price)) return { error: "Enter the stock price." };
  if (!pos(straddle)) return { error: "Enter the at-the-money straddle price (call plus put)." };
  if (!(straddle < price)) return { error: "The straddle cannot cost as much as the stock." };
  if (!pos(days)) return { error: "Enter the days to expiration (1 or more)." };
  const move = straddle / STRADDLE_FACTOR;
  const iv = (move / (price * Math.sqrt(days / 365))) * 100;
  return { ...rangeOf(price, move, iv, days), straddle };
}

function rangeOf(price, move, iv, days) {
  return {
    price, iv, days,
    move, movePct: move / price,
    low: price - move, high: price + move,
    low2: Math.max(0, price - 2 * move), high2: price + 2 * move,
    // One standard deviation over a single calendar day.
    dayMove: price * (iv / 100) / Math.sqrt(365),
    // What a straddle at this volatility would roughly cost.
    straddleEstimate: move * STRADDLE_FACTOR
  };
}

// ---------- annualized return on premium ----------

export function annualizedReturn({ premium, capital, days }) {
  if (!pos(premium)) return { error: "Enter the premium received, in dollars." };
  if (!pos(capital)) return { error: "Enter the capital tied up, in dollars (the collateral or the cost of the shares)." };
  if (!pos(days)) return { error: "Enter the number of days the money is tied up (1 or more)." };
  const period = premium / capital;
  return {
    premium, capital, days,
    period,
    simple: period * 365 / days,
    compound: Math.pow(1 + period, 365 / days) - 1,
    perDay: premium / days
  };
}

// ---------- rolling a short option ----------

export function roll({ kind, oldStrike, oldPremium, closeCost, newStrike, newPremium, qty }) {
  if (!pos(oldStrike) || !pos(newStrike)) return { error: "Enter both strikes, the one you are closing and the new one." };
  if (!pos(oldPremium)) return { error: "Enter the premium you received when you opened the option, per share." };
  if (!(typeof closeCost === "number" && isFinite(closeCost) && closeCost >= 0)) return { error: "Enter what it costs to buy the option back now, per share (0 if it is worthless)." };
  if (!pos(newPremium)) return { error: "Enter the premium for the new option, per share." };
  const n = contracts(qty);
  const net = newPremium - closeCost;
  const realized = oldPremium - closeCost;
  const total = oldPremium - closeCost + newPremium;
  const oldBreakEven = kind === "call" ? oldStrike + oldPremium : oldStrike - oldPremium;
  const newBreakEven = kind === "call" ? newStrike + total : newStrike - total;
  return {
    kind, oldStrike, oldPremium, closeCost, newStrike, newPremium, qty: n,
    net, netDollars: net * SHARES * n,
    realized, realizedDollars: realized * SHARES * n,
    total, totalDollars: total * SHARES * n,
    oldBreakEven, newBreakEven,
    breakEvenShift: newBreakEven - oldBreakEven,
    strikeShift: newStrike - oldStrike
  };
}

// ---------- early assignment of a short call before a dividend ----------

// The holder exercises the day before the ex-date when the dividend is worth
// more than what exercising throws away. The exact measure of that is the put
// at the same strike and expiration (what the holder would need to rebuild the
// downside protection the call gave them); the call's own time value is the
// common stand-in when no put price is to hand, and it errs towards warning.
export function earlyAssignment({ price, strike, callPrice, dividend, qty, putPrice }) {
  if (!pos(price)) return { error: "Enter the stock price." };
  if (!pos(strike)) return { error: "Enter the short call's strike." };
  if (!pos(callPrice)) return { error: "Enter the call's current price, per share (the bid or the mid)." };
  if (!pos(dividend)) return { error: "Enter the dividend per share." };
  const hasPut = typeof putPrice === "number" && isFinite(putPrice);
  if (hasPut && putPrice < 0) return { error: "The put price cannot be negative. Leave it blank if you do not have it." };
  const n = contracts(qty);
  const intrinsic = Math.max(0, price - strike);
  // A quote below intrinsic happens on a stale or wide market; time value
  // cannot be negative, so it counts as none.
  const extrinsic = Math.max(0, callPrice - intrinsic);
  const gauge = hasPut ? putPrice : extrinsic;
  const level = intrinsic === 0 ? "low" : dividend > gauge ? "high" : "lower";
  return {
    price, strike, callPrice, dividend, qty: n,
    putPrice: hasPut ? putPrice : null,
    test: hasPut ? "put" : "time value",
    intrinsic, extrinsic, gauge,
    belowIntrinsic: callPrice < intrinsic,
    gap: gauge - dividend,
    level,
    atStake: dividend * SHARES * n
  };
}

// ---------- chart range shared by the payoff charts ----------

// The stock prices worth drawing: every kink, padded either side, widened to
// include today's price when one is given.
export function chartRange(kinks, spot) {
  const lo = Math.min(...kinks), hi = Math.max(...kinks);
  const span = hi - lo;
  const pad = Math.max(span * 0.6, hi * 0.06);
  let x0 = lo - pad, x1 = hi + pad;
  if (pos(spot)) { x0 = Math.min(x0, spot - pad * 0.5); x1 = Math.max(x1, spot + pad * 0.5); }
  return [Math.max(0, x0), x1];
}
