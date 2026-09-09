// What a whole TICKER can lose, from its legs.
//
// The level the risk math is correct at, stated as code rather than as a
// convention nobody can enforce.
//
// The old model deliberately splits one economic position across several rows:
// a covered call's cover lives on the SHARE row, so the call's own max risk is
// zero and the share row is netted by the premium written against it. Neither
// row is right alone, and the account total is assembled from a name-branch
// per row -- iron condors maxed per ticker here, stock-like rows shocked
// there, everything else summed -- which is the same "recognise the shape
// first" disease that hid two legs of a live repair on 8 Sep.
//
// A ticker's legs, taken together, need none of that. maxLoss evaluates the
// book at zero and at every strike and reads one slope, and the answer is
// exact for whatever the rows happen to be, including the shapes nobody
// enumerated.
//
// TWO THINGS THIS IS NOT, both deliberate:
//
//   1. It is not a substitute for the stress figure. A book holding shares
//      loses its whole basis at price zero, so its exact expiry floor IS the
//      notional -- true, and not what an account-level "risk" tile should
//      show, which is why totals.risk shocks stock-like rows by a defined
//      move instead. The two numbers answer different questions and are
//      reported separately rather than reconciled into one that means neither.
//
//   2. It is not always available. Everything here is valued at ONE expiry, so
//      a ticker holding a September and an October leg is refused with a
//      reason rather than flattened -- flattening is what reported $0 max loss
//      on a reverse calendar that becomes a naked short call the day the near
//      leg dies. A refusal is a real answer here, not a gap to paper over.

import { legsOfAll, bookByTicker } from "./positionLegs.ts";
import { maxLoss, breakEvens, netPremium, priceable } from "./legMath.ts";

export type BookRisk = {
  ticker: string;
  rows: number;
  legs: number;
  holdsStock: boolean;
  maxLoss: number | null;
  maxLossAt: number | null;
  unbounded: "up" | null;
  // Null when the book priced. A sentence when it did not, so a screen can say
  // which -- "cannot be priced" and "has no bound" are different facts and
  // used to render as the same blank.
  reason: string | null;
  breakEvens: number[];
  netPremium: number | null;
};

// One ticker's rows as one book.
export function bookRisk(ticker: string, rows: any[]): BookRisk {
  const legs = legsOfAll(rows);
  const loss = maxLoss(legs);
  return {
    ticker,
    rows: (rows || []).length,
    legs: legs.length,
    // Carried because it explains the whole difference against totals.risk: a
    // book with stock in it floors at the stock going to zero.
    holdsStock: legs.some((l) => l.type === "S"),
    maxLoss: loss.loss,
    maxLossAt: loss.at,
    unbounded: loss.unbounded,
    reason: loss.reason,
    breakEvens: priceable(legs) ? breakEvens(legs) : [],
    netPremium: netPremium(legs)
  };
}

export function bookRiskByTicker(rows: any[]): BookRisk[] {
  const books = bookByTicker(rows);
  return Object.keys(books)
    .sort()
    .map((t) => bookRisk(t, books[t]));
}

// The account, as the sum of its tickers.
//
// Summing ACROSS names is the same convention the existing total uses: every
// underlying is assumed to go wrong at once. That is conservative and it is
// what a reader of a single "risk" figure expects. Summing WITHIN a name is
// what this replaces, because inside one name the legs offset and the offsets
// are the whole point of a spread.
//
// `complete` is false the moment one ticker cannot be sized, and the tickers
// that could not are named -- an understatement presented as a total is the
// failure this codebase has now been bitten by twice.
export function bookRiskTotal(books: BookRisk[]) {
  let risk = 0;
  let complete = true;
  const unpriceable: { ticker: string; reason: string }[] = [];
  const unbounded: string[] = [];
  for (const b of books) {
    if (b.reason) {
      complete = false;
      unpriceable.push({ ticker: b.ticker, reason: b.reason });
      continue;
    }
    if (b.unbounded) {
      complete = false;
      unbounded.push(b.ticker);
      continue;
    }
    risk += Number(b.maxLoss) || 0;
  }
  return { risk: Math.round(risk * 100) / 100, complete, unpriceable, unbounded };
}
