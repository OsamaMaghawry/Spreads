// Who covers a short call, decided once for the whole codebase.
//
// This rule was written twice. `spreadPairing` allocated cover to decide what
// the dashboard calls a position; `watchRules.nakedShortCalls` allocated it
// again to decide whether the watch emails a critical. They were written
// weeks apart, they drifted, and on 8 Sep they disagreed about the same live
// account on the same afternoon: the dashboard printed "Naked call ·
// Unlimited" on a book the watch was — correctly — silent about. Two answers
// to one question is worse than either answer alone, because the trader has
// no way to know which screen is lying.
//
// So the allocation lives here, once, and both callers read it.
//
// Three rules, in this order:
//
//   1. An ADJUSTED contract is not judged at all. After a split or a merger
//      an option no longer delivers 100 shares of anything, so "100 shares
//      per contract" — the arithmetic both callers ran — is simply false for
//      it. Guessing produces a critical alert on a fully covered position.
//      It is reported unjudged, and it consumes no cover, so the shares it
//      might have taken stay available to contracts we CAN judge.
//
//   2. Long calls cover first, contract for contract, and only those expiring
//      ON OR AFTER the short: a long that dies first leaves the short bare
//      for the rest of its life, and no broker margins that as a spread.
//      Strike does not matter. Long 352.50 against short 375 is still a
//      spread — above 375 the long gains what the short loses — and treating
//      only higher strikes as cover is what produced the false "unlimited".
//
//   3. Shares cover what the longs did not, a hundred per contract.
//
// Cover is allocated across a ticker's shorts SHORTEST-DATED FIRST, because
// the one that runs out of time soonest has the first claim on it.
//
// The result is per contract, never per symbol. Ten short calls against one
// hundred shares are one covered call and nine naked ones, and both of those
// facts have to survive: calling the whole row naked hides a covered
// contract, calling it covered hides nine unbounded ones.

import { parseOCCSymbol } from "./occ.ts";

export const SHARES_PER_CONTRACT = 100;

// leg: { symbol, ticker, type: "C" | "P", qty (signed), expiry, strike, adjusted }
// Expiries are compared as strings, so a caller must pass one consistent
// format for every leg (raw OCC "YYMMDD" and ISO "2026-09-19" both sort
// correctly; mixing them does not).
export type CoverLeg = {
  symbol: string;
  ticker: string;
  type: string;
  qty: number;
  expiry?: string | null;
  strike?: number | null;
  adjusted?: boolean;
  // A claim from an order still working, not a position (workingCallClaims).
  working?: boolean;
};

export type Cover = {
  symbol: string;
  ticker: string;
  contracts: number;
  fromShares: number;
  // The long's strike rides along because a short call covered by a LONG is a
  // spread, and riskOfKind needs the distance between the strikes to bound it.
  byLongs: { symbol: string; qty: number; strike?: number | null; expiry?: string | null }[];
  coveredByLongs: number;
  covered: number;
  uncovered: number;
  // false when the contract is adjusted: `covered` and `uncovered` are 0 and
  // mean nothing. A caller must branch on this before reading either.
  judged: boolean;
};

export function allocateCallCover(legs: CoverLeg[], shares: Record<string, number> = {}) {
  const sharesLeft: Record<string, number> = {};
  for (const [k, v] of Object.entries(shares || {})) sharesLeft[k] = Number(v) || 0;

  const calls = (legs || []).filter((l) => l && l.type === "C");
  // An adjusted long is no more countable as cover than an adjusted short is
  // as a liability -- it delivers something else too.
  const longPool = calls
    .filter((l) => l.qty > 0 && !l.adjusted)
    .map((l) => ({ leg: l, left: Math.abs(l.qty) }));

  const shorts = calls
    .filter((l) => l.qty < 0)
    .sort((a, b) => String(a.expiry ?? "").localeCompare(String(b.expiry ?? "")));

  const bySymbol: Record<string, Cover> = {};
  for (const leg of shorts) {
    const contracts = Math.abs(leg.qty);
    const base = {
      symbol: leg.symbol,
      ticker: leg.ticker,
      contracts,
      fromShares: 0,
      byLongs: [] as Cover["byLongs"],
      coveredByLongs: 0,
      covered: 0,
      uncovered: 0
    };
    if (leg.adjusted) {
      bySymbol[leg.symbol] = { ...base, judged: false };
      continue;
    }

    let still = contracts;
    const byLongs: Cover["byLongs"] = [];
    let coveredByLongs = 0;
    for (const c of longPool) {
      if (still <= 0) break;
      if (c.left <= 0 || c.leg.ticker !== leg.ticker) continue;
      if (String(c.leg.expiry ?? "") < String(leg.expiry ?? "")) continue;
      const take = Math.min(still, c.left);
      c.left -= take;
      still -= take;
      coveredByLongs += take;
      byLongs.push({ symbol: c.leg.symbol, qty: take, strike: c.leg.strike, expiry: c.leg.expiry });
    }

    const have = sharesLeft[leg.ticker] || 0;
    const fromShares = Math.max(0, Math.min(still, Math.floor(have / SHARES_PER_CONTRACT)));
    sharesLeft[leg.ticker] = have - fromShares * SHARES_PER_CONTRACT;
    still -= fromShares;

    bySymbol[leg.symbol] = {
      ...base,
      fromShares,
      byLongs,
      coveredByLongs,
      covered: contracts - still,
      uncovered: still,
      judged: true
    };
  }

  // The long calls NOT yet standing behind a short, after the shorts above
  // have taken theirs.
  //
  // `sharesLeft` has always answered "what can cover a NEW short call?" for
  // shares; nothing answered it for longs, so every caller that wanted free
  // cover could only see shares. The Scanner's covered-call mode was the
  // casualty: a trader holding a long IBIT call to write against was told he
  // held nothing, while the Dashboard -- reading this same allocation -- would
  // have called the result covered. Same account, same rule, two answers.
  //
  // Contract-for-contract, and a long already covering a short is not offered
  // twice: that is the whole point of computing it here, after allocation,
  // rather than listing the account's long calls.
  const longsLeft = longPool
    .filter((c) => c.left > 0)
    .map((c) => ({
      symbol: c.leg.symbol,
      ticker: c.leg.ticker,
      strike: c.leg.strike ?? null,
      expiry: c.leg.expiry ?? null,
      qty: c.left
    }));

  return { bySymbol, sharesLeft, longsLeft };
}

// How many of `contracts` short calls `shares` alone can cover. The one place
// the hundred-shares-per-contract rule is written down, so a caller that has
// only a share count (trade reconstruction reads a historical share ledger and
// has no view of the long calls held that day) applies the same arithmetic the
// live classifier does.
export const coveredByShares = (contracts: number, shares: number) =>
  Math.max(0, Math.min(Math.abs(Number(contracts) || 0), Math.floor((Number(shares) || 0) / SHARES_PER_CONTRACT)));

/**
 * What can cover a NEW short call, read from raw broker positions.
 *
 * TWO FAULTS, ONE CAUSE. This file used to answer "which shares does the
 * account hold?" and every caller took that as "which calls may it write?".
 * Those are different questions, and the gap between them cost twice:
 *
 *   - A LONG CALL IS COVER, and was invisible. The owner, holding one long
 *     IBIT call to write against: "when I try to scan the covered call on
 *     DeltaMint, I can't find it ... it shows up only Tesla." Options were
 *     skipped on the first line of the loop, so the Scanner never saw it --
 *     while the Dashboard, reading callCover.ts, would have called the very
 *     position it refused to suggest covered.
 *
 *   - COMMITTED SHARES WERE COUNTED AGAIN. The same owner held 100 TSLA and was
 *     already short the TSLA 390C against them. The Scanner still offered a
 *     second TSLA covered call, and the order ticket raised nothing, because
 *     100 shares is "enough" for one contract. It was: for the one already
 *     sold. The second would have been naked.
 *
 * Both are the same fix -- allocate the account's existing short calls against
 * its cover FIRST, with the one rule the rest of the codebase already uses,
 * and offer only what is left. Pure, so it can be tested against a real book.
 */
/**
 * Calls that orders STILL WORKING at the broker will sell, as short call legs
 * the allocator can charge against shares and long calls like any other.
 *
 * The broker does: it holds cover for a working order that sells a call, and
 * refuses a new order the cover no longer stretches to. Counting positions
 * only, the screen said "100 of 100 free" while Alpaca had those shares behind
 * a two-collar order still resting, and the owner's stock repair came back
 * "account not eligible to trade uncovered option contracts". Per order: the
 * calls it opens short, less the calls it opens long (a vertical's long covers
 * its own short), times the units not yet filled -- what is filled is already
 * a position. Calls being closed are not claims.
 */
export function workingCallClaims(orders: any[]) {
  const out: CoverLeg[] = [];
  for (const o of Array.isArray(orders) ? orders : []) {
    const units = Math.max(0, (parseFloat(o?.qty) || 0) - (parseFloat(o?.filled_qty) || 0));
    if (!(units > 0)) continue;
    const legs = o.order_class === "mleg" && Array.isArray(o.legs)
      ? o.legs
      : [{ symbol: o.symbol, side: o.side, ratio_qty: 1, position_intent: o.position_intent }];
    const byTicker: Record<string, { sold: number; bought: number; expiry: string | null; strike: number | null }> = {};
    for (const l of legs) {
      const occ = parseOCCSymbol(l?.symbol);
      if (!occ || occ.type !== "C") continue;
      const ratio = Math.max(1, Math.floor(parseFloat(l.ratio_qty) || 1));
      const t = (byTicker[occ.ticker] ||= { sold: 0, bought: 0, expiry: null, strike: null });
      if (l.side === "sell" && l.position_intent !== "sell_to_close") {
        t.sold += ratio;
        if (t.expiry === null || occ.expiryFormatted < t.expiry) { t.expiry = occ.expiryFormatted; t.strike = occ.strike; }
      } else if (l.side === "buy" && l.position_intent !== "buy_to_close") {
        t.bought += ratio;
      }
    }
    for (const [ticker, t] of Object.entries(byTicker)) {
      const net = (t.sold - t.bought) * units;
      if (net > 0) {
        out.push({ symbol: `working:${o.id}:${ticker}`, ticker, type: "C", qty: -net, expiry: t.expiry, strike: t.strike, adjusted: false, working: true });
      }
    }
  }
  return out;
}

export function freeCallCover(positions: any[], workingOrders: any[] = []) {
  const shares: Record<string, number> = {};
  const legs: any[] = [];
  const cost: Record<string, number> = {};
  const mark: Record<string, number> = {};
  for (const p of Array.isArray(positions) ? positions : []) {
    const qty = parseFloat(p?.qty);
    if (!isFinite(qty) || qty === 0) continue;
    const occ = parseOCCSymbol(p.symbol);
    if (!occ) {
      // A short stock position covers nothing and is not a share balance.
      if (qty > 0) {
        const sym = String(p.symbol).toUpperCase();
        shares[sym] = (shares[sym] || 0) + qty;
      }
      continue;
    }
    // Signed, as the broker reports it: negative is short. The same shape
    // watchRules hands the allocator, so the two cannot read a book differently.
    legs.push({
      symbol: p.symbol,
      ticker: occ.ticker,
      type: occ.type,
      qty,
      expiry: occ.expiryFormatted,
      strike: occ.strike,
      adjusted: !!occ.adjusted
    });
    // Per-share premium paid. For a long call this is what the position cost,
    // which is what a call written against it risks -- the same footing a
    // covered call's share basis stands on.
    const avg = parseFloat(p.avg_entry_price);
    if (avg > 0) cost[p.symbol] = avg;
    // What it is worth now, per share. The ticket's payoff chart values the
    // long on the short call's expiry, when it still has time left, and needs
    // today's price to back a volatility out of; the entry cost cannot give it.
    const now = parseFloat(p.current_price);
    if (now > 0) mark[p.symbol] = now;
  }

  // Calls that orders still working will sell take their cover first-come,
  // exactly as a short already open would.
  legs.push(...workingCallClaims(workingOrders));
  const { bySymbol, sharesLeft, longsLeft } = allocateCallCover(legs, shares);

  const longsFree: Record<string, any[]> = {};
  for (const l of longsLeft) {
    (longsFree[l.ticker] ||= []).push({ ...l, cost: cost[l.symbol] ?? null, mark: mark[l.symbol] ?? null });
  }
  const sharesFree: Record<string, number> = {};
  for (const [t, n] of Object.entries(sharesLeft)) if (n > 0) sharesFree[t] = n;

  const coverTickers = [
    ...new Set([
      ...Object.keys(sharesFree).filter((t) => sharesFree[t] >= 100),
      ...Object.keys(longsFree).filter((t) => longsFree[t].length > 0)
    ])
  ].sort();

  // WHAT IS HELD BUT ALREADY SPOKEN FOR, said out loud. Leaving a ticker out
  // silently read as a fault: the owner, the day this rule shipped, "you
  // removed the stocks because Tesla ... it's not showing up anymore". It was
  // left out on purpose -- his 100 TSLA stood behind a short 390 call -- and
  // the screen has to say so rather than make him guess.
  const committed: { ticker: string; reason: string }[] = [];
  const heldTickers = new Set([
    ...Object.keys(shares).filter((t) => shares[t] >= SHARES_PER_CONTRACT),
    ...legs.filter((l) => l.type === "C" && l.qty > 0 && !l.adjusted).map((l) => l.ticker)
  ]);
  for (const t of [...heldTickers].sort()) {
    if (coverTickers.includes(t)) continue;
    const shorts = Object.values(bySymbol)
      .filter((c) => c.ticker === t && c.judged && c.covered > 0)
      .map((c) => {
        const leg = legs.find((l) => l.symbol === c.symbol);
        return `${leg?.strike ?? "?"} call (${leg?.expiry ?? "?"})${leg?.working ? " in an order still working" : ""}`;
      });
    const what = [
      shares[t] >= SHARES_PER_CONTRACT ? `${shares[t]} shares` : null,
      legs.some((l) => l.ticker === t && l.type === "C" && l.qty > 0) ? "long call" : null
    ].filter(Boolean).join(" and ");
    const verb = what === "long call" ? "covers" : "cover";
    committed.push({
      ticker: t,
      reason: shorts.length
        ? `Your ${what} already ${verb} the ${shorts.join(", ")} you sold.`
        : `Your ${what} can't cover a new call right now.`
    });
  }

  // Every long call held, free or not, in the same shape as longsFree -- for a
  // ticker whose cover is all in use, so its calls can still be shown.
  const longsHeld: Record<string, any[]> = {};
  for (const l of legs) {
    if (l.type !== "C" || !(l.qty > 0) || l.adjusted) continue;
    (longsHeld[l.ticker] ||= []).push({
      symbol: l.symbol, ticker: l.ticker, strike: l.strike ?? null, expiry: l.expiry ?? null,
      qty: l.qty, cost: cost[l.symbol] ?? null, mark: mark[l.symbol] ?? null
    });
  }

  return { shares, sharesFree, longsFree, longsHeld, coverTickers, committed };
}

/**
 * What a covered-call SCAN is given: every ticker the account can write a call
 * on, including ones whose cover is already behind a call it has sold.
 *
 * The owner, on those being left out: "Even if I have another covered call ...
 * just give me [it]. I need to see if I want to close mine and open another one
 * before the current one expires." Hiding them decided that for him. So they
 * are shown, each flagged with `inUse` -- the sentence saying what the cover is
 * already doing -- and the order ticket warns again (freeCoverWarning) before
 * anything is sent.
 *
 * A ticker with free cover is priced on its FREE cover only, so a second
 * contract is never sized off shares already spoken for. A ticker with none is
 * priced on what it holds, and flagged.
 */
export function scanCover(cover: ReturnType<typeof freeCallCover>) {
  const inUse: Record<string, string> = {};
  for (const c of cover.committed || []) inUse[c.ticker] = c.reason;
  const free = new Set(cover.coverTickers || []);
  const tickers = [...new Set([...free, ...Object.keys(inUse)])].sort();
  const sharesByTicker: Record<string, number> = {};
  const longCoverByTicker: Record<string, any[]> = {};
  for (const t of tickers) {
    sharesByTicker[t] = free.has(t) ? (cover.sharesFree[t] || 0) : (cover.shares[t] || 0);
    longCoverByTicker[t] = free.has(t) ? (cover.longsFree[t] || []) : (cover.longsHeld[t] || []);
  }
  return { tickers, sharesByTicker, longCoverByTicker, inUse };
}
