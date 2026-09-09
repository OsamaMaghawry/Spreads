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
import { allocateCallCover } from "./callCover.ts";

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
// The allocation itself is callCover.allocateCallCover, shared with the
// dashboard's pairing. It used to be a second implementation living here, and
// on 8 Sep the two disagreed about the same live TSLA book on the same
// afternoon -- this one right, the dashboard's wrong. One rule, read twice, is
// the only arrangement in which that cannot recur.
function coverOf(legs: any[], shares: Record<string, number>) {
  return allocateCallCover(
    (legs || [])
      .filter((l) => l?.occ)
      .map((l) => ({
        symbol: l.symbol,
        ticker: l.occ.ticker,
        type: l.occ.type,
        qty: l.qty,
        expiry: String(l.occ.expiryFormatted || ""),
        strike: l.occ.strike,
        adjusted: !!l.occ.adjusted
      })),
    shares
  ).bySymbol;
}

export function nakedShortCalls(legs: any[], shares: Record<string, number>, cash: number | null = null) {
  void cash;
  const cover = coverOf(legs, shares);
  const bySymbol = new Map((legs || []).map((l) => [l.symbol, l]));
  const out: any[] = [];
  for (const c of Object.values(cover)) {
    // An adjusted contract is reported by unjudgedShortCalls instead: it is
    // not naked, it is unreadable, and raising a critical on it was raising a
    // critical on arithmetic we had no right to run.
    if (!c.judged || c.uncovered <= 0) continue;
    out.push({
      symbol: c.symbol,
      occ: bySymbol.get(c.symbol)?.occ,
      contracts: c.contracts,
      uncovered: c.uncovered,
      coveredByLongs: c.coveredByLongs,
      coveredByShares: c.fromShares,
      shares: shares?.[c.ticker] || 0
    });
  }
  return out;
}

// Short calls on contracts a corporate action changed, which no share count
// can judge. A split or a merger leaves the contract delivering something
// other than a hundred shares, so both "covered" and "naked" are claims about
// a deliverable it no longer has. They are surfaced as a liveness note -- "I
// am watching this and cannot read it" -- rather than a critical nobody can
// act on, which is what the old shares-only arithmetic produced.
export function unjudgedShortCalls(legs: any[], shares: Record<string, number>) {
  const cover = coverOf(legs, shares);
  const bySymbol = new Map((legs || []).map((l) => [l.symbol, l]));
  return Object.values(cover)
    .filter((c) => !c.judged)
    .map((c) => ({ symbol: c.symbol, occ: bySymbol.get(c.symbol)?.occ, contracts: c.contracts }));
}

// Where the clock is relative to the US regular session, in UTC.
//
// The session watch fires every 15 minutes from 13:00 to 21:59 UTC, and the
// regular session is 13:30 to 20:00 — so ten of the thirty-six runs each day
// happen when the market is shut. Judging those runs on live prices is what
// produced the "price not trusted" mail: once trading stops, the last trade
// ages past the staleness rule and EVERY leg goes untrusted at once. The
// timestamps showed it exactly — a batch at 13:00 and 13:15 that resolved at
// 13:30 when the bell rang, and another first appearing at 20:30, half an hour
// after the close.
//
// alert-rules.md already describes the cure ("staleness after the bell is the
// expected state, not a defect") but it was only ever applied to the daily
// report. The phase, not the mode, should decide which price to judge on.
//
// Weekends are "closed" for the same reason: nothing has traded since Friday.
// Holidays are not modelled — on a holiday this returns "open" and the closing
// price is used anyway, because getClosingSpots is what a shut market wants.
export function sessionPhase(now: Date = new Date()): "pre" | "open" | "post" | "closed" {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return "closed";
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (mins < 13 * 60 + 30) return "pre";
  if (mins >= 20 * 60) return "post";
  return "open";
}

// Live prices are only worth judging while the market is actually trading.
export const judgeOnLivePrices = (now: Date = new Date()) => sessionPhase(now) === "open";
