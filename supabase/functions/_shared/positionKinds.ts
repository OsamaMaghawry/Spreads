// What a position that is NOT a vertical spread actually is, and what it risks.
//
// pairSpreads returns only structures it can pair a short against a protective
// long, and silently discarded everything else. For a wheel account -- cash
// secured puts, covered calls, assigned shares -- that is the entire book, so
// the dashboard rendered nothing at all while the history read perfectly. The
// same hole swallows a leftover leg from a half-closed spread on any account,
// and it swallows a NAKED SHORT CALL, which carries unlimited risk and was
// therefore the one position guaranteed never to be shown.
//
// Two rules here, both from the house style:
//
//   Never drop a position. Anything the pairing cannot explain is still real
//   money and still appears. Classification decides how it READS, never whether
//   it is shown.
//
//   Withhold rather than default. A naked call has no computable maximum loss,
//   so its risk is null and every total carrying it says it is incomplete. A
//   zero there would be a lie the size of the account.

import { coveredByShares } from "./callCover.ts";

export const KINDS = {
  CASH_SECURED_PUT: "cash_secured_put",
  COVERED_CALL: "covered_call",
  NAKED_CALL: "naked_call",
  NAKED_PUT: "naked_put",
  LONG_OPTION: "long_option",
  SHARES: "shares",
  // A short call on an ADJUSTED contract. After a split or a merger the
  // contract no longer delivers 100 shares, so neither "covered" nor "naked"
  // can be established: the arithmetic behind both is a deliverable this
  // contract does not have. Saying so is the only honest answer, and it is a
  // separate kind rather than a flag because every risk figure below has to
  // withhold rather than compute.
  SHORT_CALL_UNJUDGED: "short_call_unjudged"
} as const;

const SHARES_PER_CONTRACT = 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp0 = (n: number) => Math.max(n, 0);

// leg: { symbol, ticker, optionType: "P"|"C", strike, qty (signed), avgEntryPrice,
//        currentPrice, expiry, expiryFormatted, entryDate }
// shares: net long share count in the same ticker, already reduced by whatever
//         earlier covered calls have claimed.
// cash:   account cash, for deciding whether a short put is actually secured.
export function classifyLeg(leg: any, { shares = 0, cash = null }: any = {}) {
  const qty = Number(leg.qty) || 0;
  if (qty > 0) return KINDS.LONG_OPTION;
  if (qty === 0) return null;

  const contracts = Math.abs(qty);
  if (leg.optionType === "C") {
    // An adjusted contract delivers something other than 100 shares, so no
    // share count answers the question. It is not naked and not covered; it
    // is unjudged, and every figure downstream withholds accordingly.
    if (leg.adjusted) return KINDS.SHORT_CALL_UNJUDGED;
    // Covered only to the extent shares back it. Ten short calls against 100
    // shares is one covered call and nine naked ones. This returns ONE kind
    // for the whole leg, so a partially covered leg answers "naked" -- which
    // is why callers holding a real book split the leg by
    // callCover.allocateCallCover first and ask about each part. The
    // hundred-per-contract arithmetic itself lives in callCover, so this and
    // the watch cannot drift apart again.
    return coveredByShares(contracts, shares) === contracts ? KINDS.COVERED_CALL : KINDS.NAKED_CALL;
  }
  // A lone short put on Alpaca is cash-secured by construction. Alpaca offers
  // options levels 1-3 only: level 2 is covered calls and cash-secured puts,
  // level 3 is spreads. The industry's uncovered tier is level 4, which Alpaca
  // does not have -- so if the broker let the order through, the collateral
  // was there. Testing `cash >= strike x 100` here was wrong on a margin
  // account, where cash is legitimately below the strike while buying power
  // still covers it; it labelled a real CSP "uncovered". NAKED_PUT stays in
  // the enum for a broker that permits one; nothing reaches it today.
  void cash;
  void contracts;
  return KINDS.CASH_SECURED_PUT;
}

// What the position loses if the underlying moves against it by `move`
// (0.15 = fifteen percent). This is the OCC TIMS shock behind every
// portfolio-margin engine, and it is the number that belongs in an ACCOUNT
// total for stock-like exposure. Stock-to-zero is true for one position and
// meaningless summed across a book -- by that logic the whole market's max
// risk is its market cap. Returns 0 when the move does not reach the position
// ("survives a 15% drop"), null when there is no spot to shock.
export function stressLossOfKind(kind: string, p: any, move = 0.15): number | null {
  const contracts = Math.abs(Number(p.qty) || 0);
  const credit = Math.abs(Number(p.avgEntryPrice) || 0);
  const strike = Number(p.strike) || 0;
  const spot = Number(p.stockPrice ?? p.spot) || 0;
  if (!(spot > 0)) return null;

  const down = spot * (1 - move);
  const up = spot * (1 + move);
  switch (kind) {
    case KINDS.CASH_SECURED_PUT:
    case KINDS.NAKED_PUT: {
      const intrinsic = Math.max(strike - down, 0);
      return round2(Math.max(0, (intrinsic - credit) * SHARES_PER_CONTRACT * contracts));
    }
    case KINDS.COVERED_CALL: {
      // The shares fall; the call can only help. Per contract, 100 shares.
      const drop = (spot - down) * SHARES_PER_CONTRACT * contracts;
      return round2(Math.max(0, drop - credit * SHARES_PER_CONTRACT * contracts));
    }
    case KINDS.NAKED_CALL: {
      // Unbounded to the upside, but a loss AT a defined move still exists and
      // is what a margin engine would charge. The kind stays flagged unbounded.
      const intrinsic = Math.max(up - strike, 0);
      return round2(Math.max(0, (intrinsic - credit) * SHARES_PER_CONTRACT * contracts));
    }
    case KINDS.LONG_OPTION: {
      // Can never lose more than the premium; at a 15% adverse move a short-dated
      // long is roughly worthless, so the premium is the honest shock figure.
      return round2(credit * SHARES_PER_CONTRACT * contracts);
    }
    case KINDS.SHARES: {
      const shares = Math.abs(Number(p.shareQty ?? p.qty) || 0);
      return round2(shares * (spot - down));
    }
    default:
      return null;
  }
}

// What this position is worth, in P/L, if the underlying were at `price` and
// every option settled at intrinsic value. NEGATIVE is a loss.
//
// stressLossOfKind above answers "how much does this row lose in its own
// adverse direction", which is the right number to print ON the row and the
// wrong number to add up. Rows on one ticker do not move independently: a
// covered call's shares and its short call are the same bet in opposite
// directions, and summing each row's own worst case charges an account for a
// drop and a rally at the same instant. The account total therefore shocks a
// TICKER once, prices every row on it at that one price, and sums the P/L --
// which is what a clearing house does, and what these two functions exist to
// keep apart.
//
// Returns null where there is no honest figure: no spot to shock, or a
// deliverable we cannot assume.
export function stressPL(kind: string, p: any, price: number): number | null {
  if (!(price > 0)) return null;
  const contracts = Math.abs(Number(p.qty) || 0);
  const credit = Math.abs(Number(p.avgEntryPrice) || 0);
  const strike = Number(p.strike) || 0;
  const scale = SHARES_PER_CONTRACT * contracts;

  switch (kind) {
    case KINDS.CASH_SECURED_PUT:
    case KINDS.NAKED_PUT:
      return round2((credit - clamp0(strike - price)) * scale);
    // Both are short calls; what differs is whether something covers them,
    // and the cover is a row of its own that gets priced at the same shock.
    // Counting the shares' fall here as well as on the share row is the
    // double-count this split removes.
    case KINDS.COVERED_CALL:
    case KINDS.NAKED_CALL:
      return round2((credit - clamp0(price - strike)) * scale);
    case KINDS.LONG_OPTION: {
      const intrinsic = p.optionType === "C" || p.kind === "call"
        ? clamp0(price - strike)
        : clamp0(strike - price);
      return round2((intrinsic - credit) * scale);
    }
    case KINDS.SHARES: {
      const spot = Number(p.stockPrice ?? p.spot) || 0;
      if (!(spot > 0)) return null;
      return round2((price - spot) * Math.abs(Number(p.shareQty ?? p.qty) || 0));
    }
    // An adjusted contract has no deliverable we may assume, so it has no
    // priced outcome either. Null propagates and the total says it is short.
    case KINDS.SHORT_CALL_UNJUDGED:
      return null;
    default:
      return null;
  }
}

// Stock-like kinds carry the stock's risk; a spread carries its own defined
// loss. The account total treats the two differently, so the split lives here.
export const STOCK_LIKE = new Set<string>([
  KINDS.CASH_SECURED_PUT, KINDS.NAKED_PUT, KINDS.COVERED_CALL, KINDS.NAKED_CALL, KINDS.LONG_OPTION, KINDS.SHARES,
  KINDS.SHORT_CALL_UNJUDGED
]);

// Maximum loss, in dollars, for one classified position.
//
// null means UNDEFINED, not zero, and callers must propagate that rather than
// coerce it. A short call with no shares behind it can lose without limit; there
// is no honest number to put in the column.
export function riskOfKind(kind: string, p: any): number | null {
  const contracts = Math.abs(Number(p.qty) || 0);
  const credit = Math.abs(Number(p.avgEntryPrice) || 0);
  const strike = Number(p.strike) || 0;

  switch (kind) {
    case KINDS.CASH_SECURED_PUT:
    case KINDS.NAKED_PUT:
      // Assigned at the strike with the stock at zero, less what was collected.
      return round2((strike - credit) * SHARES_PER_CONTRACT * contracts);
    case KINDS.COVERED_CALL:
      // Nothing. The call caps the upside on cover the trader already holds;
      // it adds no loss of its own.
      //
      // This used to return the SHARES' downside-to-zero, which is why the
      // share row had to be shrunk by the covered quantity to stop the
      // account total counting the same stock twice. That made every
      // attribution false to keep one total honest: a trader holding 210
      // shares read "10 shares", and the 200 he could not see were inside a
      // call's max-risk figure. The stock's dollars belong in the stock's
      // row, so they live there now, net of the premium written against them,
      // and the share row reports what he actually owns.
      //
      // A call covered by a LONG CALL is a different animal, and zero is
      // wrong for it. That pair is a vertical, and its worst case is the
      // strike distance less the credit taken in. Only the part beyond what
      // the long already cost belongs on this row, because the long is a row
      // of its own carrying its premium — so the two rows add up to the
      // pair's real bound and neither counts the other's money. Where the
      // long sits BELOW the short this comes out at nothing, which is right:
      // the position cannot lose more than it cost, and the cost is on the
      // long's row.
      if (Array.isArray(p.coverLongs) && p.coverLongs.length) {
        return round2(
          p.coverLongs.reduce((sum: number, l: any) => {
            const distance = clamp0((Number(l.strike) || 0) - strike);
            return sum + clamp0(distance - credit) * SHARES_PER_CONTRACT * Math.abs(Number(l.qty) || 0);
          }, 0)
        );
      }
      return 0;
    case KINDS.NAKED_CALL:
      return null; // unbounded, and saying so is the point
    case KINDS.SHORT_CALL_UNJUDGED:
      // Not "unlimited" -- unknown. The contract may be fully covered; we
      // cannot establish it, and a figure either way would be invented.
      return null;
    case KINDS.LONG_OPTION:
      return round2(credit * SHARES_PER_CONTRACT * contracts);
    case KINDS.SHARES:
      // Cost from inception, to match every other row in the column. Market
      // value is what can still be lost from HERE, which double-counts a drop
      // already sitting in unrealized P/L against the same row.
      //
      // premiumWritten is the credit taken on calls written against this lot.
      // It is money already received against exactly these shares, so the most
      // they can still cost is their basis less that credit — and it is
      // subtracted here because this row now carries the whole holding,
      // encumbered shares included.
      return round2(
        (Number(p.shareBasis ?? p.avgEntryPrice) || 0) * Math.abs(Number(p.shareQty ?? p.qty) || 0) -
          (Number(p.premiumWritten) || 0)
      );
    default:
      return null;
  }
}

// Where the position breaks even, per share -- the number a wheel is run
// against. OIC: a covered call breaks even at the stock's cost less the call
// premium; a short put at the strike less its premium.
export function breakEvenOfKind(kind: string, p: any): number | null {
  const credit = Math.abs(Number(p.avgEntryPrice) || 0);
  const strike = Number(p.strike) || 0;
  switch (kind) {
    case KINDS.CASH_SECURED_PUT:
    case KINDS.NAKED_PUT:
      return round2(strike - credit);
    case KINDS.COVERED_CALL:
      return round2((Number(p.shareBasis) || 0) - credit);
    case KINDS.NAKED_CALL:
      return round2(strike + credit);
    case KINDS.SHORT_CALL_UNJUDGED:
      // Break-even is per share of the deliverable, and the deliverable is
      // what a corporate action changed.
      return null;
    case KINDS.LONG_OPTION:
      return round2(p.optionType === "C" ? strike + credit : strike - credit);
    case KINDS.SHARES:
      return round2(Number(p.shareBasis ?? p.avgEntryPrice) || 0);
    default:
      return null;
  }
}

// Collateral the broker is actually holding against the position. Distinct from
// maximum loss: a cash-secured put ties up the full strike while its worst case
// is the strike less the credit, and the trader needs to see both.
export function collateralOfKind(kind: string, p: any): number | null {
  const contracts = Math.abs(Number(p.qty) || 0);
  if (kind === KINDS.CASH_SECURED_PUT) {
    return round2((Number(p.strike) || 0) * SHARES_PER_CONTRACT * contracts);
  }
  // A covered call ties up no capital of its own: the shares behind it are
  // reported in full on their own row and that row already counts them. This
  // returned the covered shares' market value while the share row returned
  // the rest, which added to the right total out of two wrong halves.
  if (kind === KINDS.COVERED_CALL) return 0;
  if (kind === KINDS.SHARES) {
    const mv = Math.abs(Number(p.marketValue) || 0);
    return mv > 0 ? round2(mv) : null;
  }
  return null;
}

export function labelOfKind(kind: string) {
  switch (kind) {
    case KINDS.CASH_SECURED_PUT: return "Cash-secured put";
    case KINDS.NAKED_PUT: return "Short put (uncovered)";
    case KINDS.COVERED_CALL: return "Covered call";
    case KINDS.NAKED_CALL: return "Naked call";
    case KINDS.SHORT_CALL_UNJUDGED: return "Short call — adjusted contract";
    case KINDS.LONG_OPTION: return "Long option";
    case KINDS.SHARES: return "Shares";
    default: return "Position";
  }
}

// The account's stock-like exposure at a defined adverse move.
//
// One shock per TICKER, not one per row. Every stock-like row on a name is
// priced at the same underlying price and the P/L is summed; the ticker
// contributes the worse of the down and the up shock, and nothing if it
// survives both. Then the tickers sum, because they can genuinely move
// against each other at once.
//
// What this replaces summed each row's own worst case, which charged an
// account twice over in two different ways: a ticker holding shares and a
// naked call was billed for a 15% fall AND a 15% rally at the same instant,
// and a covered call's shares were counted on the share row and again inside
// the call's own figure. Both are gone -- not because the arithmetic was
// wrong per row, but because those rows were never independent.
//
// A row with no priceable outcome (no spot, an adjusted deliverable) does not
// contribute a zero: its ticker is named incomplete, the way every other
// total in this file refuses to guess.
export function stressTotal(rows: any[], move = 0.15) {
  const byTicker: Record<string, any[]> = {};
  for (const r of rows || []) {
    const t = r?.ticker || "?";
    (byTicker[t] = byTicker[t] || []).push(r);
  }

  let risk = 0;
  let complete = true;
  const undefinedRisk: string[] = [];

  for (const [ticker, group] of Object.entries(byTicker)) {
    const spot = group.map((r) => Number(r.stockPrice ?? r.spot) || 0).find((s) => s > 0) || 0;
    if (!(spot > 0)) {
      complete = false;
      undefinedRisk.push(ticker);
      continue;
    }
    let short = false;
    const at = (price: number) =>
      group.reduce((sum, r) => {
        // stressInput is what a caller attaches when the figures this needs
        // (a leg's strike and entry price) sit inside the position rather
        // than on the row. Falling back to the row keeps this usable on a
        // plain object in a test.
        const pl = stressPL(r.type, { ...(r.stressInput || r), stockPrice: spot }, price);
        if (pl === null) { short = true; return sum; }
        return sum + pl;
      }, 0);
    const worst = Math.min(at(spot * (1 - move)), at(spot * (1 + move)));
    if (short) {
      complete = false;
      undefinedRisk.push(ticker);
    }
    risk += Math.max(0, -worst);
  }

  return { risk: round2(risk), complete, undefinedRisk: [...new Set(undefinedRisk)] };
}

// Sum risk across positions, refusing to produce a confident total when any one
// of them has no number. `complete: false` is what stops a dashboard printing a
// tidy figure that omits an unlimited liability.
export function totalRisk(positions: any[]) {
  let sum = 0;
  let complete = true;
  const undefinedRisk: string[] = [];
  for (const p of positions || []) {
    if (p.maxRisk === null || p.maxRisk === undefined || !Number.isFinite(p.maxRisk)) {
      complete = false;
      if (p.ticker) undefinedRisk.push(p.ticker);
      continue;
    }
    sum += p.maxRisk;
  }
  return { risk: round2(sum), complete, undefinedRisk: [...new Set(undefinedRisk)] };
}
