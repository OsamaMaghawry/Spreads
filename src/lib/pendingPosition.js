import { bsPrice, impliedVol, tteYears, RISK_FREE } from "./blackScholes.js";
import { expiryOf } from "./occ.js";

// An order that has not been placed, priced the same way an open one is.
//
// The dashboard can already draw what a ticker is doing: `tickerBook` prices
// every open row at one underlying, adds them up and sweeps the result
// (`positionPLAt`, `payoffCurve`, `crossings`). The ticket had none of that —
// it showed a max risk, a max profit and a break-even as three separate
// numbers and left the shape between them to the imagination.
//
// The owner: *"'Analysis' inside the ticket before I submit to show the graph
// like the one with max loss and profit we have already. I want it to this
// position only. Then 'Advanced Analysis' to show how it reflects to the
// entire position if any if executed."*
//
// So this turns a SETUP into rows of exactly the shape `positionPLAt` reads.
// Nothing here re-derives a payoff: the same function prices the pending order
// and the open book, which is the only way the two pictures can be compared at
// all. A second payoff engine for "what if" would be a second answer to the
// same question, and this product has paid for that mistake before.

// Null, undefined and "" are NOT zero. `Number(null)` is 0, which would turn
// a builder's deliberate "this has no ceiling" into a $0.00 ceiling and a
// missing mid into a free contract.
// Backed out of the leg's own mid, with the same model and the same 0.25
// fallback the scanner uses -- never a number typed in here.
function impliedFrom(price, spot, strike, expiry, isCall) {
  if (!(price > 0) || !(spot > 0) || !(strike > 0) || !expiry) return null;
  return impliedVol(price, spot, strike, tteYears(expiry), RISK_FREE, isCall);
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A leg's kind comes from its ROLE, which every builder sets, rather than from
// `type`, which the scanner's legs inherit from the chain and the chain's own
// legs spell differently ("P" vs "put").
const kindOfLeg = (l) =>
  String(l?.role || "").endsWith("_call") || l?.type === "call" || l?.type === "C" ? "call" : "put";

// What one contract of the order is actually worth per share, from the legs.
// Positive is a credit taken in, negative a debit paid — the same sign
// convention `openPosition` reads.
export function legNet(legs) {
  return (legs || []).reduce((sum, l) => {
    const price = num(l.mid) ?? num(l.bid) ?? 0;
    const ratio = num(l.ratio) || 1;
    return sum + ratio * (l.side === "sell" ? price : -price);
  }, 0);
}

/**
 * The order as priceable rows.
 *
 * `net` is what the order will actually be done at, per contract, per share —
 * the limit on the ticket rather than the midpoint the setup was built from.
 * It is passed through exactly: a payoff at expiry depends on the legs' net
 * only as one additive term, so the difference between the limit and the mid
 * shifts the whole curve and changes nothing else. The shift is applied to the
 * first leg's entry (divided by its ratio, signed by its side) because that is
 * arithmetically identical to spreading it across all of them, and picking one
 * leg keeps the row readable.
 *
 * A COVERED CALL BRINGS ITS SHARES. "This position only" means the position,
 * and a covered call is not a naked call — the hundred shares per contract are
 * what make it covered, and drawing the call alone would show an unbounded
 * loss above the strike on a position that has none.
 */
export function pendingRows(setup, qty = 1, net = undefined) {
  if (!setup?.legs?.length) return [];
  const units = Math.max(1, Math.round(num(qty) || 1));

  const spot = num(setup.spot);
  const legs = setup.legs.map((l) => {
    const kind = kindOfLeg(l);
    const strike = num(l.strike) ?? 0;
    const expiry = l.expiry || setup.expiry || null;
    const price = num(l.mid) ?? num(l.bid) ?? 0;
    return {
      kind,
      side: l.side === "sell" ? "short" : "long",
      strike,
      entryPrice: price,
      ratio: num(l.ratio) || 1,
      // The leg's OWN expiry, kept rather than discarded. Without it a
      // calendar and a vertical are indistinguishable by the time they reach
      // the chart, and the chart draws them the same way -- which is how a
      // diagonal came to be shown with a floor it does not have.
      expiry,
      // Volatility, so a leg that is still alive on some future date can be
      // valued rather than guessed at. The chain hands us the market's own
      // implied volatility; the scanner does not, so it is backed out of the
      // leg's mid at the setup's spot using the same model that will price it.
      iv: num(l.iv) ?? impliedFrom(price, spot, strike, expiry, kind === "call")
    };
  });

  const target = num(net);
  if (target !== null) {
    const shift = target - legNet(setup.legs);
    if (shift !== 0) {
      const first = legs[0];
      first.entryPrice += (first.side === "short" ? shift : -shift) / (first.ratio || 1);
      // `positionPLAt` takes the absolute entry price, so a leg driven
      // negative by a large shift would silently flip sign. It cannot happen
      // from a limit a few cents off the mid, and if it ever did the row must
      // not quietly price the opposite trade.
      if (first.entryPrice < 0) return [];
    }
  }

  const rows = [{
    id: "pending",
    pending: true,
    ticker: setup.ticker,
    type: "option",
    qty: units,
    legs,
    stockPrice: num(setup.spot) ?? 0,
    // Never adjusted: the chain refuses to build a ticket from a contract
    // whose deliverable is not 100 shares, so anything reaching here is plain.
    adjusted: false
  }];

  if (setup.strategy === "covered_call" && num(setup.basis) > 0) {
    rows.push({
      id: "pending-shares",
      pending: true,
      ticker: setup.ticker,
      type: "shares",
      shareQty: units * 100,
      shareBasis: num(setup.basis),
      stockPrice: num(setup.spot) ?? 0,
      adjusted: false
    });
  }

  return rows;
}

/**
 * The most the order can make at expiry, per contract — or null where there
 * is no ceiling on that side either.
 *
 * A builder that has WORKED OUT the answer puts `maxProfit` on the setup, and
 * that answer wins, including when it is null: `spreadSetup` sets it to null
 * on a calendar or diagonal precisely because the two legs never settle
 * against each other and the width does not bound anything. So the presence of
 * the key is the test, not its value — falling back on a null would replace a
 * considered refusal with a guess.
 *
 * Setups from the scanner carry no such key, and every shape it builds is a
 * credit structure whose best case is keeping the credit.
 */
export function maxProfitOf(setup) {
  if (!setup) return null;
  if (Object.prototype.hasOwnProperty.call(setup, "maxProfit")) {
    return num(setup.maxProfit);
  }
  const credit = num(setup.credit);
  const strike = num(setup.legs?.[0]?.strike);
  switch (setup.strategy) {
    // A bought call gains with the stock and the stock has no ceiling.
    case "long_call": return null;
    // A bought put is worth most with the stock at zero. `credit` is negative
    // on a debit, so adding it subtracts what was paid.
    case "long_put": return strike !== null && credit !== null ? (strike + credit) * 100 : null;
    // Covered, the best case is being called away. UNCOVERED — a short call on
    // an account with no shares behind it — `ifCalled` is null, and falling
    // through to null printed "Max profit: No ceiling" on a naked call. Its
    // profit has a very firm ceiling: the credit. It is the LOSS that has none.
    case "covered_call":
      return num(setup.ifCalled) ?? (credit !== null ? credit * 100 : null);
    default: return credit !== null ? credit * 100 : null;
  }
}

// The strikes, named, for the chart's vertical marks.
export function ticketMarks(setup) {
  const marks = (setup?.legs || []).map((l) => ({
    label: `${l.side === "sell" ? "S" : "L"} ${num(l.strike)}${kindOfLeg(l) === "call" ? "C" : "P"}`,
    value: num(l.strike)
  })).filter((m) => m.value > 0);
  if (setup?.strategy === "covered_call" && num(setup.basis) > 0) {
    marks.push({ label: "Basis", value: num(setup.basis) });
  }
  const seen = new Set();
  return marks.filter((m) => (seen.has(m.value) ? false : seen.add(m.value)));
}

/**
 * A book of open rows plus the pending ones, in the shape `tickerBook` returns
 * so `payoffCurve` and `curveRange` read it unchanged.
 *
 * `spot` is taken from the OPEN rows first: they were marked by the same sync
 * that priced the dashboard, and a ticket's own spot can be a scan minutes old.
 *
 * THE SHARES UNDER A COVERED CALL ARE ADDED ONCE, NEVER TWICE. `pendingRows`
 * attaches a synthetic share lot so the call can be drawn as the covered
 * position it is. Beside the open book those same shares are already there —
 * they are what makes the call covered — so adding the synthetic row again
 * would draw twice the stock and make writing a call look like it ADDS upside
 * rather than capping it.
 */
export function withPending(book, rows, spot = null) {
  const open = book?.rows || [];
  const holdsShares = open.some(
    (r) => r?.type === "shares" && Number(r.shareQty ?? r.qty) > 0
  );
  const add = holdsShares ? rows.filter((r) => r.id !== "pending-shares") : rows;
  const all = [...open, ...add];
  if (!all.length) return null;
  const px = num(book?.spot) || num(spot) || num(rows[0]?.stockPrice) || 0;
  return { ticker: book?.ticker || rows[0]?.ticker || null, rows: all, spot: px };
}

/**
 * The distinct expiry dates the setup's legs carry, soonest first.
 *
 * More than one does NOT mean the position cannot be analysed — that was the
 * lazy answer, and the owner rejected it: *"I don't think it's correct to just
 * add the text of no Payoff just because they are in different dates. This is
 * laziness from our side. You can add what you want to the graph with dates...
 * the period when both are there and after one expires."*
 *
 * He is right, and `plAt` below is the answer. What more than one expiry
 * actually means is that "at expiry" is no longer a single moment, so the
 * curve has to be drawn AS OF a date — and these are the dates worth drawing.
 */
export function expiriesOf(setup) {
  const dates = (setup?.legs || [])
    .map((l) => l?.expiry || setup?.expiry)
    .filter(Boolean)
    .map(String);
  // A setup with no per-leg dates falls back to its own, which is one date.
  if (!dates.length && setup?.expiry) return [String(setup.expiry)];
  return [...new Set(dates)].sort();
}

// ---------------------------------------------------------------------------
// Valuing a position on a DATE, not only at expiry
//
// `tickerBook.positionPLAt` prices every leg at intrinsic value. That is exact
// at expiry and silent about every day before it, which is why a calendar or a
// diagonal could not be drawn: its two legs never share an expiry, so there is
// no single moment at which "intrinsic for everything" is true.
//
// So the curve is drawn AS OF a date. On that date each leg is one of two
// things and nothing else:
//
//   ALREADY EXPIRED   worth its intrinsic value, exactly as before.
//   STILL ALIVE       worth what the model says someone would pay for the time
//                     it has left, at its own implied volatility.
//
// Set the date past every expiry and the second case disappears, every leg is
// intrinsic, and this reduces to `positionPLAt` — which is asserted in the
// tests rather than assumed, so the two can never drift into disagreeing about
// a vertical.
// ---------------------------------------------------------------------------

const CONTRACT = 100;

// One leg's worth per share on `asOf`.
export function legValueAt(leg, price, asOf) {
  const isCall = leg.kind === "call";
  const T = leg.expiry ? tteYears(leg.expiry, asOf) : 0;
  const sigma = num(leg.iv);
  // No volatility for a leg that is still alive means the model cannot speak.
  // Intrinsic would understate a long and overstate a short, so the caller is
  // told rather than handed a number — see `plAt`.
  if (T > 0 && !(sigma > 0)) return null;
  return bsPrice(price, leg.strike, T, RISK_FREE, sigma ?? 0, isCall);
}

/**
 * A whole position's P/L at one underlying price, on one date.
 *
 * null, never zero, when any leg cannot be valued — the same rule
 * `positionPLAt` follows for an adjusted contract. A curve drawn from the legs
 * that happened to price is not the position.
 */
export function rowPLAt(row, price, asOf) {
  if (!row || !(price > 0)) return null;
  if (row.adjusted) return null;

  if (row.type === "shares" || row.shares) {
    const basis = num(row.shareBasis ?? row.longEntryPrice) ?? 0;
    const qty = num(row.shareQty ?? row.qty) ?? 0;
    return (price - basis) * qty;
  }

  const legs = Array.isArray(row.legs) ? row.legs : [];
  if (!legs.length) return null;
  const units = Math.abs(num(row.qty) ?? 0);
  let perShare = 0;
  for (const leg of legs) {
    const ratio = num(leg.ratio) || 1;
    const entry = Math.abs(num(leg.entryPrice) ?? 0);
    const value = legValueAt(leg, price, asOf);
    if (value === null) return null;
    // A short leg keeps what it took in and owes the value; a long leg paid
    // for it and owns the value. One expression, both directions — the same
    // one `positionPLAt` uses, with value in place of intrinsic.
    perShare += ratio * (leg.side === "short" ? entry - value : value - entry);
  }
  return perShare * units * CONTRACT;
}

/** Several rows together, at one price, on one date. */
export function bookPLAt(rows, price, asOf) {
  let total = 0;
  let priced = 0;
  for (const row of rows || []) {
    const v = rowPLAt(row, price, asOf);
    if (v === null) continue;
    total += v;
    priced += 1;
  }
  return priced === 0 ? null : total;
}

/** The curve across a price range, on one date. */
export function curveAt(rows, { from, to, steps = 160 }, asOf) {
  if (!(to > from)) return [];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const price = from + ((to - from) * i) / steps;
    const pl = bookPLAt(rows, price, asOf);
    if (pl !== null) out.push({ price, pl });
  }
  return out;
}

/**
 * The dates worth drawing a two-expiry position on.
 *
 * The NEAR EXPIRY is the one that matters: it is the moment the position stops
 * being what it is now. Before it, both legs are alive and the picture is a
 * smooth curve; on it, the near leg settles and what is left is a different
 * position with its own risk. Drawing today and the near expiry together shows
 * exactly the thing the owner asked for — "the period when both are there and
 * after one expires" — because the near-expiry line already IS the position
 * after the near leg is gone, priced at that instant.
 *
 * A single-expiry position gets one date, its own expiry, and the near-expiry
 * curve is then the familiar straight-line payoff.
 */
export function analysisDates(setup, now = Date.now()) {
  const dates = expiriesOf(setup);
  if (!dates.length) return { near: null, far: null, today: now, multi: false };
  return {
    near: dates[0],
    far: dates.length > 1 ? dates[dates.length - 1] : null,
    today: now,
    multi: dates.length > 1
  };
}

// The near expiry as a timestamp, at the close.
export const atClose = (date) =>
  date ? new Date(`${date}T20:00:00Z`).getTime() : null;

/**
 * What is still alive after a date — the position the near expiry leaves behind.
 *
 * THE REASON THIS EXISTS, and it is the whole analysis of a diagonal.
 *
 * Take the owner's structure: long a Feb-2027 270 put, short a Dec-2027 320
 * put. Priced ON the February expiry (`rowPLAt` above) the loss is bounded at
 * roughly the width less the credit, because the long put's intrinsic value
 * rises alongside the short put's. A single payoff line therefore looks safe,
 * and that is true — of that one day.
 *
 * It is what happens NEXT that has no floor. After February the long put is
 * gone and a bare short 320 put runs to December. If the stock sits at $400 in
 * February, the long expires worthless, and then the stock collapses, there is
 * nothing underneath the short at all.
 *
 * No single curve can say this, because it depends on TWO prices — where the
 * stock is in February and where it is in December — and a payoff chart has
 * one axis. So the honest picture is two curves: the whole position on the
 * near date, and the leftover on its own date. The second is what this
 * function builds, and the screen says plainly that they are not additive.
 */
export function survivingRows(rows, afterDate) {
  const cutoff = String(afterDate || "");
  const out = [];
  for (const row of rows || []) {
    // Shares do not expire; they are part of whatever is left.
    if (row.type === "shares" || row.shares) { out.push(row); continue; }
    const legs = (row.legs || []).filter((l) => String(l.expiry || "") > cutoff);
    if (legs.length) out.push({ ...row, legs });
  }
  return out;
}

/**
 * OPEN positions, made datable.
 *
 * The rows `syncAccounts` returns carry `symbol`, `side`, `kind`, `strike`,
 * `ratio`, `entryPrice` and `currentPrice` on each leg — and no expiry and no
 * volatility. `legValueAt` reads a missing expiry as T = 0 and prices the leg
 * at intrinsic, so the combined chart was drawing the open book AT EXPIRY
 * while the pending order beside it was priced at a date, under a caption
 * saying both were on the same day.
 *
 * That mispricing runs AGAINST the account: intrinsic overstates what a short
 * leg has retained and understates what a long leg is worth, so the true mark
 * is worse than the line drawn.
 *
 * Both missing pieces are recoverable without asking the server for anything.
 * The expiry is in the OCC symbol. The volatility is whatever makes the
 * model agree with the leg's own current price — the same back-out
 * `pendingRows` does for a scanner leg, from the same model.
 *
 * A leg that still cannot be dated or valued is left exactly as it was, and
 * `undatable` names its row so the screen can say which positions the lines
 * leave out rather than quietly dropping them.
 */
export function datedBookRows(rows, spot, now = Date.now()) {
  const out = [];
  const undatable = [];
  for (const row of rows || []) {
    if (!Array.isArray(row?.legs) || !row.legs.length) { out.push(row); continue; }
    let missing = false;
    const legs = row.legs.map((leg) => {
      const expiry = leg.expiry || expiryOf(leg.symbol);
      if (!expiry) { missing = true; return leg; }
      if (num(leg.iv) > 0) return { ...leg, expiry };
      const mark = num(leg.currentPrice) ?? num(leg.entryPrice);
      const iv = impliedFrom(mark, num(spot), num(leg.strike), expiry, leg.kind === "call");
      if (!(iv > 0)) { missing = true; return { ...leg, expiry }; }
      return { ...leg, expiry, iv };
    });
    if (missing) undatable.push(row);
    out.push({ ...row, legs });
  }
  return { rows: out, undatable };
}

/**
 * A price window wide enough to contain everything the reader needs to see.
 *
 * The first version took `curveRange`'s window — strikes and spot, padded —
 * and it CLIPPED A BREAK-EVEN BY TWENTY-ONE CENTS. The surviving short 320 put
 * on the owner's diagonal turns over at $275.94; the window started at
 * $276.14. So the one line drawn to show a position with $31,834 underneath it
 * was rendered entirely in profit, its lowest visible point +$20.62, and the
 * caption that would have named the crossing suppressed itself because there
 * was no crossing inside the frame.
 *
 * So the crossings decide the window, not the other way round: every curve is
 * probed across a deliberately wide range first, and the window is then set to
 * hold every crossing found, every strike and the spot, with room to spare.
 */
export function analysisRange(curves, anchors, spot) {
  const points = [];
  for (const list of curves || []) {
    for (const c of list || []) if (c?.price > 0) points.push(c.price);
  }
  for (const a of anchors || []) if (a > 0) points.push(a);
  if (num(spot) > 0) points.push(num(spot));
  if (!points.length) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = Math.max((hi - lo) * 0.12, (num(spot) || hi) * 0.05);
  return { from: Math.max(0, lo - pad), to: hi + pad };
}

// A deliberately wide sweep, used only to FIND the crossings that then set the
// window. Never drawn.
export const probeRange = (spot) => {
  const s = num(spot) || 0;
  return s > 0 ? { from: Math.max(0.01, s * 0.2), to: s * 2.6, steps: 320 } : null;
};
