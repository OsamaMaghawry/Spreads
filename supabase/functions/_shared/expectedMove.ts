// What the options market prices a stock to move by an expiry: the numbers
// behind the public /expected-move pages.
//
// The owner, 22 Oct 2026, after seeing a funding-data site rank one page per
// company: one page per stock, each answering the question people search
// ("TSLA expected move this week") with our own live numbers, and "make sure
// it's updated ... no one needs an outdated piece of news". The refresh job
// (functions/tickerPages) reads the chain every few minutes through the house
// data account and stores what this module computes; the landing Worker only
// renders the stored row.
//
// THE SAME DEFINITION AS THE PUBLIC CALCULATOR (landing/public/tools/calc.js,
// expectedMoveFromStraddle): the at-the-money straddle prices the AVERAGE
// size of the move, sqrt(2/pi) = 0.798 of one standard deviation, so the
// one-standard-deviation move is the straddle divided by that. A page and the
// calculator it links to must never disagree about the same stock.
//
// Pure: no I/O here, so every number on those pages is tested.

import type { ChainStrike } from "./optionChain.ts";

export const STRADDLE_FACTOR = Math.sqrt(2 / Math.PI);
// A leg whose ask is this far above its bid (as a share of the midpoint) is
// too wide for its midpoint to be a price; the page says the quote is wide.
export const WIDE_SPREAD = 0.25;
// How far out the refresh reads: far enough for the next monthly expiry.
export const WINDOW_DAYS = 45;

const DAY = 86400000;
const d = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Calendar days from `today` to `expiry` (YYYY-MM-DD, both New York dates). */
export function daysTo(expiry: string, today: string): number {
  return Math.round((d(expiry) - d(today)) / DAY);
}

/** The standard monthly expiry: the third Friday, days 15 to 21 of its month. */
export function isMonthly(expiry: string): boolean {
  const t = new Date(d(expiry));
  const day = t.getUTCDate();
  return t.getUTCDay() === 5 && day >= 15 && day <= 21;
}

/**
 * The two expiries a page reports. `week`: the nearest expiry at least one
 * day out and at most seven (a stock without weeklies gets its nearest one).
 * `month`: the next standard monthly after it, so the two rows always differ.
 * Same-day expiries are skipped: a move that ends at today's close is not a
 * question anyone searching this week is asking.
 */
export function pickExpiries(expiries: string[], today: string): { week: string | null; month: string | null } {
  const ahead = [...new Set(expiries)].filter((e) => daysTo(e, today) >= 1).sort();
  const week = ahead.find((e) => daysTo(e, today) <= 7) ?? ahead[0] ?? null;
  const month = ahead.find((e) => isMonthly(e) && (week === null || e > week)) ?? null;
  return { week, month };
}

const mid = (r: any): number | null => (typeof r?.mid === "number" && r.mid > 0 ? r.mid : null);
const wide = (r: any) => {
  const m = mid(r);
  return m === null || r.bid === null || r.ask === null ? true : (r.ask - r.bid) / m > WIDE_SPREAD;
};

/**
 * The at-the-money straddle at today's price: call plus put, read at the two
 * listed strikes either side of the price and blended by distance, so a stock
 * sitting between strikes is not priced as if it sat on one. Only strikes with
 * a two-sided market on both legs count. Null when there is none.
 */
export function straddleAt(ladder: ChainStrike[], spot: number) {
  const usable = (ladder || [])
    .filter((s) => mid(s.call) !== null && mid(s.put) !== null)
    .sort((a, b) => a.strike - b.strike);
  if (!usable.length || !(spot > 0)) return null;
  const price = (s: ChainStrike) => (mid(s.call) as number) + (mid(s.put) as number);
  const below = [...usable].reverse().find((s) => s.strike <= spot) ?? null;
  const above = usable.find((s) => s.strike >= spot) ?? null;
  const legsWide = (s: ChainStrike) => wide(s.call) || wide(s.put);

  if (below && above && below.strike !== above.strike) {
    const w = (spot - below.strike) / (above.strike - below.strike);
    return {
      straddle: price(below) * (1 - w) + price(above) * w,
      strikes: [below.strike, above.strike],
      wide: legsWide(below) || legsWide(above)
    };
  }
  const only = below ?? above;
  if (!only) return null;
  // Off the end of the listed strikes, the nearest straddle is still a price,
  // but not an at-the-money one; a strike more than 5% away is not used.
  if (Math.abs(only.strike - spot) / spot > 0.05) return null;
  return { straddle: price(only), strikes: [only.strike], wide: legsWide(only) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** The one-standard-deviation move to an expiry, its range, and the volatility it implies. */
export function moveFrom({ spot, straddle, days }: { spot: number; straddle: number; days: number }) {
  if (!(spot > 0) || !(straddle > 0) || !(days >= 1) || !(straddle < spot)) return null;
  const move = straddle / STRADDLE_FACTOR;
  return {
    straddle: r2(straddle),
    move: r2(move),
    movePct: r4(move / spot),
    low: r2(spot - move),
    high: r2(spot + move),
    iv: r4(move / (spot * Math.sqrt(days / 365)))
  };
}

/**
 * One expiry's row for a page: the move, or why there is none. Every reason
 * is a sentence the page can print, because a blank number on a public page
 * reads as "zero".
 */
export function expiryRow(ladder: ChainStrike[], spot: number, expiry: string, today: string) {
  const days = daysTo(expiry, today);
  const s = straddleAt(ladder, spot);
  if (!s) return { expiry, days, error: "No two-sided quotes near today's price for this expiry." };
  const m = moveFrom({ spot, straddle: s.straddle, days });
  if (!m) return { expiry, days, error: "The quotes for this expiry did not give a usable price." };
  return { expiry, days, ...m, strikes: s.strikes, wide: s.wide };
}

/** Whether a report date falls on or before an expiry, and not in the past. */
export function earningsBefore(expiry: string | null, report: string | null, today: string): boolean {
  return !!expiry && !!report && report >= today && report <= expiry;
}
