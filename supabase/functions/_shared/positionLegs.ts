// Any position the app holds today, as a plain list of legs.
//
// The bridge between the old model and the new one. Every structure the
// pairing emits already carries a `legs` array — a vertical's two, a condor's
// four, a ratio's two with their counts, a single's one — plus a share row
// that carries none and means one. legMath and structureName want that list
// and nothing else, so this is the one place that knows the shape of a row.
//
// It exists so the switch can be PROVEN rather than trusted: the new engine
// can be run beside the old one on the same live positions and the two
// answers compared to the cent, which is not possible while the leg list is
// reconstructed differently in each caller.

import type { Leg } from "./legMath.ts";

// `qty` on a row is units of the structure; `ratio` on a leg is how many
// contracts of it are in one unit. Their product is what the account holds,
// and it is the number every figure downstream is per.
export function legsOf(row: any): Leg[] {
  if (!row) return [];

  // Shares. `shareQty` is signed — a short lot is a real position — and the
  // basis is the adjusted one where the wheel's premiums could be linked to
  // it, which is the number the P/L on screen is already measured against.
  if (row.type === "shares" || row.shares) {
    const qty = Number(row.shareQty ?? row.qty) || 0;
    if (!qty) return [];
    return [{
      symbol: row.longSymbol || row.ticker,
      underlying: row.ticker || row.longSymbol,
      type: "S",
      qty,
      strike: null,
      entryPrice: Number(row.shareBasis ?? row.longEntryPrice) || 0,
      expiry: null,
      adjusted: false
    }];
  }

  const units = Math.abs(Number(row.qty) || 0);
  const legs = Array.isArray(row.legs) ? row.legs : [];
  return legs
    .filter((l: any) => l && l.symbol)
    .map((l: any) => {
      // A leg inside a structure can be STOCK. No row puts it there today, but
      // "one order, one position" will: a covered call filled by one ticket is
      // a share leg and a call leg in one row. Until this branch existed the
      // share leg fell to the call/else below, came out as a PUT struck at
      // Number(null) = 0, and the structure priced as 100 long zero-strike
      // puts with a -$2.99m net premium and a confident wrong name.
      const equity = l.assetClass === "equity" || l.kind === "shares";
      if (equity) {
        return {
          symbol: l.symbol,
          underlying: row.ticker || l.symbol,
          type: "S" as const,
          qty: (l.side === "short" ? -1 : 1) * Math.abs(Number(l.qty ?? units) || 0),
          strike: null,
          entryPrice: Math.abs(Number(l.entryPrice) || 0),
          expiry: null,
          adjusted: false
        };
      }
      return {
        symbol: l.symbol,
        // Carried so the gate can refuse a "spread" whose legs are on two
        // different names.
        underlying: row.ticker || null,
        type: (l.kind === "put" ? "P" : "C") as "C" | "P",
        // The signed quantity the account actually holds of this contract. A
        // row's `side` plus its `ratio` plus the structure's `qty` collapse
        // into one number here, which is the only form legMath accepts — and
        // the reason it has no long/short branches to get wrong.
        qty: (l.side === "short" ? -1 : 1) * (Number(l.ratio) || 1) * units,
        strike: Number(l.strike),
        entryPrice: Math.abs(Number(l.entryPrice) || 0),
        expiry: l.expiry ?? row.expiryFormatted ?? row.expiry ?? null,
        // A row-level flag today; carried per leg because that is where it is
        // true, and because a structure with one adjusted leg among four is
        // still a structure nobody may price.
        adjusted: !!(l.adjusted ?? row.adjusted)
      };
    });
}

// The legs of several rows as one book.
//
// THIS is the level the risk math is correct at, and it is a precondition
// rather than a convention. The old model deliberately splits one economic
// position across two rows -- a covered call's cover lives on the SHARE row,
// which is why the call's own max risk is zero and the share row is netted by
// the premium written against it -- so the two rows are right together and
// neither is right alone. Hand legMath one row of that pair and a fully
// covered call reads as unbounded and the share row loses its credit.
//
// Rows are for acting on. Books are for pricing.
export const legsOfAll = (rows: any[]) => (rows || []).flatMap(legsOf);

// The rows of one ticker, as one book. The unit every risk figure below the
// row level should be computed at.
export const bookByTicker = (rows: any[]) => {
  const out: Record<string, any[]> = {};
  for (const r of rows || []) {
    const t = r?.ticker;
    if (!t) continue;
    (out[t] = out[t] || []).push(r);
  }
  return out;
};
