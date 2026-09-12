// The option chain, as a ladder a person reads — and one clicked strike as a
// ticket.
//
// The owner asked for the chain to "show up complete on the app", with orders
// placeable from it. Everything needed to FETCH a chain already existed in
// `optionScan.ts`; none of it was shaped for reading. Three differences, and
// each one matters on screen:
//
//   1. `scanChain` clamps strikes to ±20% of spot. Right when the machine is
//      picking a delta, wrong for a ladder somebody scrolls — the strike they
//      want is sometimes the far one.
//   2. `scanChain` DROPS any contract without a two-sided quote. Right when
//      choosing something tradeable; wrong on a chain, where an illiquid strike
//      must still appear, with an empty quote, rather than silently vanish. A
//      missing row reads as "that strike does not exist".
//   3. No open interest and no volume, which is half of why a chain is read at
//      all.
//
// So this reads `/v1beta1/options/snapshots/{underlying}`, which returns the
// whole chain — quote, greeks, implied volatility — in ONE request rather than
// the contracts-then-quotes pair the scanner walks. Open interest comes from
// the contracts endpoint, which is the only place Alpaca carries it.
//
// PURE. Every function here takes data and returns data. The fetching lives in
// the optionChain function, and the arithmetic that decides what a strike costs
// is tested rather than trusted.

import { parseOCCSymbol } from "./occ.ts";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ChainRow {
  symbol: string;
  strike: number;
  type: "C" | "P";
  bid: number | null;
  ask: number | null;
  /** Midpoint, or null when the quote is not two-sided. Never invented. */
  mid: number | null;
  last: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  openInterest: number | null;
  volume: number | null;
  /** True when a corporate action changed what the contract delivers. */
  adjusted: boolean;
  /** In the money against the current spot. */
  itm: boolean;
}

export interface ChainStrike {
  strike: number;
  call: ChainRow | null;
  put: ChainRow | null;
}

/**
 * The mid, or nothing.
 *
 * A one-sided quote has no midpoint. Half of a market is not a price, and
 * `quoteSanity.ts` already settled this for the scanner — the same rule holds
 * here, because a mid printed from a single side is the number a person would
 * anchor their limit to.
 */
export function midOf(bid: number | null, ask: number | null): number | null {
  if (bid === null || ask === null) return null;
  if (!(bid > 0) || !(ask > 0)) return null;
  if (ask < bid) return null;
  // Four decimals, then trimmed: (0.07 + 0.09) / 2 is 0.08000000000000002, and
  // a price that long reaches the limit field the user is about to submit.
  return Math.round(((bid + ask) / 2) * 10000) / 10000;
}

/**
 * One snapshot entry to a chain row.
 *
 * `oi` is passed separately because Alpaca carries open interest on the
 * contracts endpoint and not on the snapshot.
 */
export function chainRow(
  symbol: string,
  snap: any,
  spot: number | null,
  oi: number | null = null
): ChainRow | null {
  const occ = parseOCCSymbol(symbol);
  if (!occ) return null;

  const q = snap?.latestQuote || null;
  const bid = num(q?.bp);
  const ask = num(q?.ap);
  const g = snap?.greeks || null;
  const type = occ.type === "C" ? "C" : "P";
  const strike = Number(occ.strike);

  return {
    symbol,
    strike,
    type,
    // Zero is a real bid on a worthless option, so only a missing value is
    // null. `midOf` is what refuses to build a price out of it.
    bid,
    ask,
    mid: midOf(bid, ask),
    last: num(snap?.latestTrade?.p),
    delta: num(g?.delta),
    gamma: num(g?.gamma),
    theta: num(g?.theta),
    vega: num(g?.vega),
    iv: num(snap?.impliedVolatility),
    openInterest: num(oi),
    volume: num(snap?.dailyBar?.v),
    adjusted: !!occ.adjusted,
    itm: spot === null ? false : type === "C" ? spot > strike : spot < strike
  };
}

/**
 * Calls and puts paired by strike, ascending.
 *
 * Every strike the feed returned appears, whether or not it is quoted. A chain
 * with holes in it is worse than a chain with empty cells: the reader cannot
 * tell a strike that does not trade from one that does not exist.
 */
export function chainLadder(
  snapshots: Record<string, any>,
  spot: number | null,
  oiBySymbol: Record<string, number> = {}
): ChainStrike[] {
  const byStrike = new Map<number, ChainStrike>();

  for (const symbol of Object.keys(snapshots || {})) {
    const row = chainRow(symbol, snapshots[symbol], spot, oiBySymbol[symbol] ?? null);
    if (!row) continue;
    const cur = byStrike.get(row.strike) || { strike: row.strike, call: null, put: null };
    if (row.type === "C") cur.call = row;
    else cur.put = row;
    byStrike.set(row.strike, cur);
  }

  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}

/** The strike closest to spot, so the ladder can open centred on the money. */
export function atTheMoneyIndex(ladder: ChainStrike[], spot: number | null): number {
  if (!ladder.length || spot === null || !(spot > 0)) return 0;
  let best = 0;
  let bestGap = Infinity;
  ladder.forEach((s, i) => {
    const gap = Math.abs(s.strike - spot);
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
}

// The ticket builder that used to sit here now lives in src/lib/optionChain.js.
//
// This function returns a LADDER and never a ticket, so it had no caller for
// it — and the page had quietly grown a second, worse copy of the same
// arithmetic. Two implementations of "what does this strike cost and risk" is
// the shape every P/L defect in this product has taken. One, tested, on the
// side that uses it.
