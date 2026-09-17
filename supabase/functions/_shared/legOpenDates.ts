// When did each option leg on the book today actually open?
//
// The history walk needs a `from` day for every live leg: the day it joined
// the book, so it is marked from that day forward and not before. A leg with
// no `from` is carried as "held, unpriced" on EVERY day of the series --
// dailyPortfolio.ts:984 -- because a leg that cannot be placed in time cannot
// be placed anywhere. That rule is right. What it costs when the date is
// missing for a BAD reason is the whole chart: 52 stored days on the owner's
// live account, back to July, every one of them `performance: null`, because
// of one contract.
//
// The bad reason was the fetch, not the fill. `fetchOpenDates` asked the
// broker for closed orders filtered by `symbols=<OCC symbol>`. A multi-leg
// order -- the very thing this product places -- carries its contracts in a
// nested `legs` array under a parent whose own `symbol` is not the contract,
// so the filter matched nothing and the leg had no history at all. The long
// TSLA 370 put bought inside a spread on 14 September was invisible to the
// walk, and the walk did what it is built to do with an invisible leg.
//
// This module is the half that can be tested: given the orders (parents and
// their nested legs) and the legs held now, produce the open day of each.
// Fetching is the caller's job, and the caller now fetches EVERY closed order
// in the window and lets this match by symbol -- the same walk tradeSync
// makes, which is why the trade history always knew about the fill.

export type Fill = { day: string; qty: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every fill of every wanted symbol, taken from the orders themselves and from
 * their nested legs. Signed by side so a buy and a sell on the same contract
 * cancel the way the position does.
 */
export function fillsBySymbol(orders: any[], wanted: Iterable<string>): Record<string, Fill[]> {
  const want = new Set([...wanted].filter(Boolean));
  const fills: Record<string, Fill[]> = {};
  for (const o of orders || []) {
    // The parent AND its legs. A single-leg order is its own row; a spread's
    // contracts appear only under `legs`, beneath a parent that names the
    // underlying or nothing.
    for (const r of [o, ...((o?.legs as any[]) || [])]) {
      const symbol = r?.symbol;
      if (!symbol || !want.has(symbol)) continue;
      // A leg row may carry its own filled_at; the parent's stands in when it
      // does not, because a multi-leg order fills as one.
      const at = String(r?.filled_at || o?.filled_at || "").slice(0, 10);
      if (!DAY.test(at)) continue;
      const qty = Number(r?.filled_qty ?? r?.qty);
      if (!Number.isFinite(qty) || qty === 0) continue;
      const signed = String(r?.side || "").startsWith("sell") ? -qty : qty;
      (fills[symbol] = fills[symbol] || []).push({ day: at, qty: signed });
    }
  }
  return fills;
}

/**
 * The day each held leg reached its current quantity, walking fills from the
 * newest backwards. `>=` for a long and `<=` for a short, because the running
 * total approaches the target from zero in the direction of the position's
 * own sign. A leg whose fills never add up to what is held gets no date --
 * and the walk will then say so, rather than guess.
 */
export function openDatesFor(
  legs: { symbol: string; qty: number }[],
  fills: Record<string, Fill[]>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const leg of legs || []) {
    const held = Number(leg?.qty);
    const rows = (fills[leg?.symbol] || []).slice().sort((a, b) => b.day.localeCompare(a.day));
    if (!rows.length || !Number.isFinite(held) || held === 0) continue;
    let running = 0;
    for (const f of rows) {
      running += f.qty;
      const reached = held > 0 ? running >= held : running <= held;
      if (reached) { out[leg.symbol] = f.day; break; }
    }
  }
  return out;
}
