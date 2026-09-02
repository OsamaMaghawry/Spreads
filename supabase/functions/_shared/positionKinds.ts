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

export const KINDS = {
  CASH_SECURED_PUT: "cash_secured_put",
  COVERED_CALL: "covered_call",
  NAKED_CALL: "naked_call",
  NAKED_PUT: "naked_put",
  LONG_OPTION: "long_option",
  SHARES: "shares"
} as const;

const SHARES_PER_CONTRACT = 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
    // Covered only to the extent shares back it. Ten short calls against 100
    // shares is one covered call and nine naked ones -- and the nine are the
    // whole story, so a partially covered holding is reported as naked.
    return shares >= contracts * SHARES_PER_CONTRACT ? KINDS.COVERED_CALL : KINDS.NAKED_CALL;
  }
  // A short put is "cash secured" only if the cash to buy the stock is actually
  // there. Without knowing cash we do NOT get to assume it is -- an unsecured
  // short put is margin risk, not a wheel position.
  if (cash === null) return KINDS.NAKED_PUT;
  const needed = contracts * leg.strike * SHARES_PER_CONTRACT;
  return cash >= needed ? KINDS.CASH_SECURED_PUT : KINDS.NAKED_PUT;
}

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
      // The call is not the risk -- the shares are. Downside to zero on the
      // covered lot, less the premium collected for capping the upside.
      // shareBasis is the ADJUSTED basis where the wheel's history allows it
      // (assignment strike less every credit collected), else the broker's.
      return round2(
        (Number(p.shareBasis) || 0) * SHARES_PER_CONTRACT * contracts -
          credit * SHARES_PER_CONTRACT * contracts
      );
    case KINDS.NAKED_CALL:
      return null; // unbounded, and saying so is the point
    case KINDS.LONG_OPTION:
      return round2(credit * SHARES_PER_CONTRACT * contracts);
    case KINDS.SHARES:
      // Cost from inception, to match every other row in the column. Market
      // value is what can still be lost from HERE, which double-counts a drop
      // already sitting in unrealized P/L against the same row.
      return round2((Number(p.shareBasis ?? p.avgEntryPrice) || 0) * Math.abs(Number(p.shareQty ?? p.qty) || 0));
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
  // A covered call and bare shares tie up the shares themselves, at what they
  // are worth now -- that is the capital the trader cannot deploy elsewhere.
  if (kind === KINDS.COVERED_CALL) {
    const mv = Number(p.shareMarketPrice) || 0;
    return mv > 0 ? round2(mv * SHARES_PER_CONTRACT * contracts) : null;
  }
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
    case KINDS.LONG_OPTION: return "Long option";
    case KINDS.SHARES: return "Shares";
    default: return "Position";
  }
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
