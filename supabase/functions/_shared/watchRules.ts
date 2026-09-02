// The watch rules that need more than one leg to decide.
//
// Most of positionWatch's rules look at a single option leg and a price. A
// naked short call is different: whether it is naked depends on the shares
// the same account holds, and shares arrive from the broker as positions of
// their own. These two helpers are pure so the rule can be tested without a
// broker, a database or a schedule -- the previous version of this rule was a
// call to a function that did not exist, and nothing caught it before it
// reached production.
import { parseOCCSymbol } from "./occ.ts";

const SHARES_PER_CONTRACT = 100;

// Net long shares per ticker from the raw broker positions. A share position
// is one whose symbol is not an OCC contract. A short share position covers
// no call, so it contributes nothing.
export function sharesByTicker(positions: any[]) {
  const out: Record<string, number> = {};
  for (const p of positions || []) {
    if (parseOCCSymbol(p.symbol)) continue;
    const qty = parseFloat(p.qty);
    if (!(qty > 0)) continue;
    const sym = String(p.symbol || "").toUpperCase();
    out[sym] = (out[sym] || 0) + qty;
  }
  return out;
}

// Short calls nothing in the account covers. `legs` are the watch's parsed
// option legs ({ symbol, occ: { ticker, strike, type, expiryFormatted }, qty }),
// signed; `shares` is sharesByTicker's result.
//
// The watch reads RAW positions, before pairing, so the short call of a call
// credit spread or an iron condor arrives here beside its long. A long call on
// the same name expiring on or after the short covers it contract for
// contract -- that is a defined-risk spread, not a naked call -- and shares
// cover what the longs do not, a hundred per contract. Only what is left is
// naked, and a partially covered leg is reported with how much is uncovered.
// The first version of this rule counted shares alone and raised six false
// criticals on one account of call spreads.
export function nakedShortCalls(legs: any[], shares: Record<string, number>, cash: number | null = null) {
  void cash;
  const sharesLeft: Record<string, number> = { ...(shares || {}) };
  // Long calls by ticker: { expiry, contracts } with contracts still unclaimed.
  const longs: Record<string, { expiry: string; left: number }[]> = {};
  for (const leg of legs || []) {
    if (!leg?.occ || leg.occ.type !== "C" || !(leg.qty > 0)) continue;
    (longs[leg.occ.ticker] = longs[leg.occ.ticker] || []).push({ expiry: String(leg.occ.expiryFormatted || ""), left: leg.qty });
  }
  const shorts = (legs || []).filter((l) => l?.occ && l.occ.type === "C" && l.qty < 0)
    // Nearest expiry first, so a long that can cover only the nearest short is
    // not spent on a later one.
    .sort((a, b) => String(a.occ.expiryFormatted || "").localeCompare(String(b.occ.expiryFormatted || "")));

  const out: any[] = [];
  for (const leg of shorts) {
    const ticker = leg.occ.ticker;
    const expiry = String(leg.occ.expiryFormatted || "");
    let uncovered = Math.abs(leg.qty);
    // Longs on the same name expiring on or after this short, nearest first.
    const eligible = (longs[ticker] || []).filter((l) => l.left > 0 && l.expiry >= expiry).sort((a, b) => a.expiry.localeCompare(b.expiry));
    let byLongs = 0;
    for (const l of eligible) {
      if (uncovered === 0) break;
      const take = Math.min(l.left, uncovered);
      l.left -= take; uncovered -= take; byLongs += take;
    }
    const have = sharesLeft[ticker] || 0;
    const byShares = Math.min(uncovered, Math.floor(have / SHARES_PER_CONTRACT));
    sharesLeft[ticker] = have - byShares * SHARES_PER_CONTRACT;
    uncovered -= byShares;
    if (uncovered > 0) {
      out.push({ symbol: leg.symbol, occ: leg.occ, contracts: Math.abs(leg.qty), uncovered, coveredByLongs: byLongs, coveredByShares: byShares, shares: have });
    }
  }
  return out;
}
