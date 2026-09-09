// Everything one ticker is doing, as one position.
//
// The dashboard is organised by structure, which is right for acting on a
// single trade and wrong for deciding about a name. A repair is a share lot
// and a call ratio on two cards; a wheel is a put here, shares there, a call
// somewhere else. Nothing on the screen answered "what is my TSLA situation",
// and the columns cannot be summed to find out — adding a share row's net
// credit to a ratio's is arithmetic about nothing.
//
// What can be summed is P/L at a price. So that is what this does: it prices
// every position on the ticker at the same underlying, adds them up, and
// sweeps the result across a range. One curve, and the prices where it
// crosses zero, is the whole situation.

const CONTRACT = 100;
const itv = (n) => Math.max(n, 0);

// What one position is worth, in P/L, if it expired with the underlying at
// `price`. Intrinsic value only — no time premium, because at expiry there is
// none, and a curve drawn on marks would move every time a quote ticked.
//
// null means "cannot be priced", never zero: an adjusted contract delivers
// something other than 100 shares, so every figure below is about a
// deliverable it does not have.
export function positionPLAt(s, price) {
  if (!s || !(price > 0)) return null;
  if (s.adjusted) return null;

  if (s.type === "shares" || s.shares) {
    const basis = Number(s.shareBasis ?? s.longEntryPrice) || 0;
    const qty = Number(s.shareQty ?? s.qty) || 0;
    return (price - basis) * qty;
  }

  const legs = Array.isArray(s.legs) ? s.legs : [];
  if (!legs.length) return null;
  const units = Math.abs(Number(s.qty) || 0);
  const perShare = legs.reduce((sum, l) => {
    const ratio = Number(l.ratio) || 1;
    const entry = Math.abs(Number(l.entryPrice) || 0);
    const intrinsic = l.kind === "call" ? itv(price - l.strike) : itv(l.strike - price);
    // A short leg keeps what it took in and pays out the intrinsic; a long leg
    // paid for it and collects the intrinsic. One expression, both directions.
    return sum + ratio * (l.side === "short" ? entry - intrinsic : intrinsic - entry);
  }, 0);
  return perShare * units * CONTRACT;
}

// The rows on one ticker, with what can be added up already added.
//
// unrealizedPL and expirationPL come off the rows rather than being recomputed:
// they are mark-to-market and this file is at-expiry, and mixing the two is
// how a screen ends up showing two different answers to the same question.
export function tickerBook(spreads, ticker) {
  const rows = (spreads || []).filter((s) => s.ticker === ticker);
  if (!rows.length) return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const shares = rows
    .filter((s) => s.type === "shares")
    .reduce((n, s) => n + num(s.shareQty ?? s.qty), 0);

  let longContracts = 0;
  let shortContracts = 0;
  rows.forEach((s) => {
    if (s.type === "shares") return;
    const units = Math.abs(num(s.qty));
    (s.legs || []).forEach((l) => {
      const n = units * (num(l.ratio) || 1);
      if (l.side === "short") shortContracts += n;
      else longContracts += n;
    });
  });

  // A price to draw around. Every row on a ticker carries the same spot, but
  // one may have missed a sync, so the first real number wins.
  const spot = rows.map((s) => num(s.stockPrice)).find((p) => p > 0) || 0;

  return {
    ticker,
    rows,
    spot,
    prevClose: rows.map((s) => s.prevClose).find((p) => Number(p) > 0) ?? null,
    shares,
    longContracts,
    shortContracts,
    unrealizedPL: rows.reduce((a, s) => a + num(s.unrealizedPL), 0),
    // Null on any row means the account cannot be told what expiring now would
    // do, so the total says so rather than reporting the part it could add.
    expirationPL: rows.some((s) => s.expirationPL === null || s.expirationPL === undefined)
      ? null
      : rows.reduce((a, s) => a + num(s.expirationPL), 0),
    committed: rows.reduce((a, s) => a + num(s.collateral), 0),
    // Rows whose payoff cannot be drawn at all. The curve is still drawn from
    // the rest, and the panel says which are missing — a silently partial
    // curve is worse than no curve.
    unpriceable: rows.filter((s) => positionPLAt(s, spot || 1) === null)
  };
}

// A price range wide enough to show the shape: every strike and the share
// basis inside it, the spot inside it, and room past the edges so the last
// bend is visible rather than clipped at the frame.
export function curveRange(book) {
  const points = [];
  (book?.rows || []).forEach((s) => {
    if (s.type === "shares") {
      const basis = Number(s.shareBasis ?? s.longEntryPrice);
      if (basis > 0) points.push(basis);
      return;
    }
    (s.legs || []).forEach((l) => {
      if (Number(l.strike) > 0) points.push(Number(l.strike));
    });
    [s.breakEven, s.breakEvenHigh].forEach((b) => {
      if (Number(b) > 0) points.push(Number(b));
    });
  });
  if (book?.spot > 0) points.push(book.spot);
  if (!points.length) return null;

  const lo = Math.min(...points);
  const hi = Math.max(...points);
  // A book whose strikes all sit at one price (a single covered call, say) has
  // no span of its own, so it borrows one from the price.
  const pad = Math.max((hi - lo) * 0.35, (book.spot || hi) * 0.12);
  return { from: Math.max(0, lo - pad), to: hi + pad };
}

// The curve itself: combined P/L at expiry across the range.
export function payoffCurve(book, { from, to, steps = 160 } = {}) {
  if (!book || !(to > from)) return [];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const price = from + ((to - from) * i) / steps;
    let pl = 0;
    for (const s of book.rows) {
      const v = positionPLAt(s, price);
      if (v !== null) pl += v;
    }
    out.push({ price, pl });
  }
  return out;
}

// Where the combined position goes from losing to making money, or back.
//
// These are the numbers a decision actually turns on, and they are not any
// single row's break-even: a repair's shares are still climbing past the point
// where its calls give back what they made, so the book's own crossing sits
// somewhere neither card shows.
export function crossings(curve) {
  const out = [];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.pl === 0) {
      out.push({ price: a.price, rising: b.pl > 0 });
      continue;
    }
    if ((a.pl < 0 && b.pl > 0) || (a.pl > 0 && b.pl < 0)) {
      // Linear between the two samples, which is exact everywhere except at a
      // strike — and a strike between two samples moves this by less than the
      // step, well inside the width of the line drawn through it.
      const t = -a.pl / (b.pl - a.pl);
      out.push({ price: a.price + t * (b.price - a.price), rising: b.pl > a.pl });
    }
  }
  return out;
}
