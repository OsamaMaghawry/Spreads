// How much of the trader's own money was actually at work, and for how long.
//
// THE DEFECT THIS EXISTS FOR. Every return percentage on the Analysis page
// divided the account's P/L by `equity` -- the broker's figure for what the
// account is worth RIGHT NOW, which includes every deposit ever made into it.
//
// The owner found it on his live account: *"the analysis or the P/L doesn't
// take into account the deposits and withdrawals. It says the pl 500 while it
// should be more but because I deposited 700 last week. It got reduced!!"*
//
// He is right about the effect and it is worse than it sounds on a small
// account. His equity read $688.70 against a $700 deposit made the week
// before, so the denominator MORE THAN DOUBLED for money that had been in the
// account for five days and had never been at risk in a position. Return on
// equity, Annualized, CAGR and both day-return figures all read roughly half
// what they should.
//
// THE RULE. A return is a result divided by the capital that earned it. Money
// deposited on the second-to-last day of a window did not earn the window's
// result and must not sit in its denominator at full weight; money withdrawn
// early was not there to earn it either. So each flow is weighted by the share
// of the window it was actually present for -- the Modified Dietz denominator,
// which is the standard answer to exactly this question and is what a
// performance report means by "return".
//
//   capital = startingEquity + Σ ( flow × (days it was present ÷ days in window) )
//
// A $700 deposit five days before the end of a thirty-day window contributes
// $700 × 5/30 = $117, not $700.
//
// AND IF WE CANNOT SEE THE FLOWS, THE RETURN IS A DASH. Null, never a
// fallback to closing equity: the whole defect was publishing a confident
// percentage over a denominator nobody had checked. The same rule the rest of
// this product already follows -- a figure that cannot be trusted renders "—",
// never a substitute number.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dayCount = (from, to) => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Inclusive of both ends: a one-day window is one day, not zero, or a flow
  // on that day divides by nothing.
  return Math.round((b - a) / 86400000) + 1;
};

/**
 * The capital a window's result should be measured against.
 *
 * @param startEquity  what the account was worth the day the window opened.
 *                     Null when we have no stored value for that day, which
 *                     is the honest state for an account whose series has not
 *                     been built yet.
 * @param flows        [{ day, amount }] — deposits positive, withdrawals
 *                     negative. An EMPTY array is a real answer ("we looked
 *                     and there were none"); `null` means we never looked, and
 *                     the two must not behave the same.
 * @param from, to     the window, inclusive, as YYYY-MM-DD.
 *
 * Returns null when the answer is unknowable, or when the weighted capital
 * comes out at or below zero — an account funded entirely by a deposit inside
 * the window has no starting capital to have earned a return ON, and a
 * percentage over a near-zero base is a number that means nothing however
 * confidently it prints.
 */
export function capitalAtWork({ startEquity, flows, from, to }) {
  const start = num(startEquity);
  if (start === null) return null;
  // Never looked. Distinct from "looked and found none".
  if (!Array.isArray(flows)) return null;

  const span = dayCount(from, to);
  if (!span || span <= 0) return null;

  let weighted = start;
  for (const f of flows) {
    const amount = num(f?.amount);
    if (amount === null || amount === 0) continue;
    const at = dayCount(from, String(f?.day || "").slice(0, 10));
    // A flow dated outside the window is not this window's capital. Dropped
    // rather than clamped: clamping a deposit made a month later to full
    // weight is the original defect in a smaller box.
    if (at === null || at < 1 || at > span) continue;
    // Present for the rest of the window, counting the day it landed.
    weighted += amount * ((span - at + 1) / span);
  }

  // A denominator at or below zero produces a return that is either infinite
  // or sign-flipped. Both are worse than a dash.
  return weighted > 0 ? weighted : null;
}

/** Net of every flow in the window, for the sentence that explains the step. */
export function netFlow(flows, from, to) {
  if (!Array.isArray(flows)) return null;
  const span = dayCount(from, to);
  if (!span) return null;
  return flows.reduce((a, f) => {
    const amount = num(f?.amount);
    const at = dayCount(from, String(f?.day || "").slice(0, 10));
    if (amount === null || at === null || at < 1 || at > span) return a;
    return a + amount;
  }, 0);
}

/**
 * The sentence that goes beside a return measured over a window with flows in
 * it, so the reader knows the denominator is not the balance they can see.
 */
export function flowNote(flows, from, to) {
  const net = netFlow(flows, from, to);
  if (net === null || Math.abs(net) < 0.005) return null;
  const moved = flows.filter((f) => num(f?.amount));
  const word = net > 0 ? "added" : "withdrew";
  const money = `$${Math.abs(net).toFixed(2)}`;
  return `You ${word} ${money} over this period (${moved.length} ${moved.length === 1 ? "transfer" : "transfers"}). ` +
    `Returns are measured against the capital actually at work, weighted for when it arrived — ` +
    `not against the closing balance, which would credit the whole period to money that was only here for part of it.`;
}
