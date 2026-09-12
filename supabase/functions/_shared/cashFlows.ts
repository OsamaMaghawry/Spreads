// The trader's own money moving in and out, which this product could not see.
//
// THE DEFECT THIS EXISTS FOR. Every return percentage on the Analysis page
// divided the account's result by the broker's CURRENT equity, and that figure
// contains every deposit ever made. The owner found it on his live account:
//
//   *"the analysis or the P/L doesn't take into account the deposits and
//   withdrawals. It says the pl 500 while it should be more but because I
//   deposited 700 last week. It got reduced!!"*
//
// He is right about the effect. A $700 deposit into a roughly $500 account
// more than doubled the denominator, for money that had been there five days
// and had never been in a position, so Return on equity, Annualized, CAGR and
// both day-return figures all read about half what they should.
//
// And the root cause was not arithmetic. `fetchBrokerData` asks Alpaca for
// FILL, OPEXP, OPASN and OPEXC -- fills, expirations, assignments, exercises.
// A transfer is none of those, so a deposit was not mishandled, it was
// INVISIBLE. Nothing in the product could see one, so nothing could subtract
// one. This is the half that makes it visible; `src/lib/capital.js` is the
// half that does the arithmetic.
//
// PURE, so the parsing can be tested against the shapes the API actually
// returns rather than against an assumption about them.

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // parseFloat("1,000.00") is 1, silently. Separators are stripped before
  // parsing rather than trusted to a function that stops at the comma -- the
  // same trap `cashAmountOf` documents in the reconstruction.
  const cleaned = v.replace(/[$\s,]/g, "");
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const day = (v: unknown): string | null => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// The four types that move CASH. JNLS and ACATS move SHARES, and are
// deliberately absent: a share arriving from outside carries a basis this
// product cannot see, which is a different and larger problem than a
// denominator, and folding it in as a dollar amount would state a cost we do
// not know.
export const CASH_FLOW_TYPES = ["CSD", "CSW", "JNLC", "ACATC"] as const;

export type CashFlow = {
  id: string;
  day: string;
  /** Signed: deposits positive, withdrawals negative. */
  amount: number;
  kind: string;
};

/**
 * Alpaca's non-trade activities, reduced to signed dated amounts.
 *
 * THE SIGN COMES FROM THE AMOUNT, NOT THE TYPE. Alpaca reports a withdrawal
 * with a negative `net_amount`, and a `JNLC` can be either direction depending
 * on which side of the journal the account is on -- so deriving the sign from
 * the type name would invert every outbound journal. Where the amount's sign
 * and the type disagree the AMOUNT wins, because it is the figure the broker
 * actually moved.
 *
 * A row whose amount cannot be read is DROPPED rather than treated as zero.
 * Zero is a statement that no money moved, and that is exactly the thing we
 * would be wrong about; a dropped row makes the count disagree with the
 * broker's, which is visible, rather than the total, which is not.
 */
export function cashFlows(activities: any[] | null | undefined): CashFlow[] | null {
  // NULL IN, NULL OUT. "We could not look" and "we looked and there were none"
  // are different answers, and collapsing them is how a denominator nobody
  // checked gets published as a confident percentage.
  if (!Array.isArray(activities)) return null;

  const out: CashFlow[] = [];
  const seen = new Set<string>();
  for (const a of activities) {
    const kind = String(a?.activity_type || "").toUpperCase();
    if (!(CASH_FLOW_TYPES as readonly string[]).includes(kind)) continue;
    // `date` is the settlement day on a non-trade activity; `transaction_time`
    // is the fallback for the shapes that carry one instead.
    const when = day(a?.date) || day(a?.transaction_time);
    const amount = num(a?.net_amount) ?? num(a?.amount);
    if (!when || amount === null || amount === 0) continue;
    const id = String(a?.id || `${kind}|${when}|${amount}`);
    // The feed is paged and OPCSH is merged into it elsewhere; a repeated id
    // would double a deposit and halve a return.
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, day: when, amount, kind });
  }
  return out.sort((x, y) => x.day.localeCompare(y.day));
}
