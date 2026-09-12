// The audit layer: find what is wrong, withhold exactly that, keep the rest.
//
// WHY THIS EXISTS. Two guards used to protect this product's stored history,
// and both worked by refusing the entire sync:
//
//   - the impossible-result check, when a defined-risk spread computed a loss
//     past what its strikes can lose;
//   - `refuseMassDelete`, when a reconstruction wanted to remove most of what
//     was stored.
//
// Each was right about the danger and wrong about the remedy. One bad XLY row
// on the owner's paper account -- a $189 loss on a spread whose floor is $125,
// one row out of a whole account -- left that account with ZERO stored trades,
// a blank Analysis page and a weekly email with nothing in it. The owner:
//
//   *"I need to build a more robust way to check this kind of errors, this
//   kind of discrepancies in the accounts, and to check them in a different
//   way, not to block the account. This doesn't work like this. So create a
//   framework to audit. No problem. To catch the mistakes, to catch the
//   errors, to catch anything. But at the same time, don't block everything.
//   It has to be something smarter than what we have."*
//
// THE SHAPE. Nothing in this file throws. Every check returns FINDINGS, and
// every finding carries the narrowest action that keeps a figure we cannot
// stand behind off the screen:
//
//   withhold_row    the trade is stored and visible, its untrusted figures are
//                   withheld -- rendered "—", excluded from every total and
//                   every statistic. The trade happened; only our arithmetic
//                   about it is in doubt, and the reader is told which.
//   keep_deleted    the rows a sync wanted to remove are KEPT instead. The
//                   rest of the sync writes normally. Nothing is lost and
//                   nothing is blocked -- the opposite of the old refusal,
//                   which lost the whole update to protect the deletions.
//   note            recorded and surfaced; nothing is withheld.
//
// There is deliberately no action that stops a sync. A defect in one row is
// not a reason to stop telling a trader what the other forty-two did.
//
// WHAT KEEPS THIS HONEST. A withheld figure must be withheld EVERYWHERE or the
// page contradicts itself -- which is the exact failure this product has been
// fixing all week in another form. So `withheld()` is the one predicate, read
// by the statistics, the equity walk and the weekly email alike, and the count
// travels with every total so a screen can say "42 of 43 trades, 1 withheld"
// rather than quietly showing a smaller number.

export type Severity = "critical" | "warning" | "info";
export type Action = "withhold_row" | "keep_deleted" | "note";

export type Finding = {
  /** Stable identifier for the KIND of problem. Dedupe key, never prose. */
  code: string;
  severity: Severity;
  action: Action;
  /**
   * What the finding is about: a trade_key for a row-scoped finding, or a
   * name like "trade records" for an account-scoped one. Part of the dedupe
   * key, so the same problem on the same subject is one finding over time.
   */
  subject: string;
  /** One sentence a person can act on. No jargon, no code identifiers. */
  message: string;
  /** The numbers behind the sentence, for the audit trail. */
  detail: Record<string, unknown>;
};

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/**
 * A defined-risk spread reporting a loss past what its strikes can lose.
 *
 * The invariant every attribution defect so far has broken, and the reason is
 * always the same: an exercise or assignment moves real shares, the result on
 * those shares is attributed back to the spread that caused it, and when two
 * spreads share a strike the whole share loss can land on one of them. The
 * ACCOUNT total stays right -- the dollars are real and are merely filed on
 * the wrong row -- which is why nothing else ever caught it.
 *
 * Takes the breaches `tradeReconstruction` already computes (the arithmetic
 * lives there, with the strikes) and turns each into a finding about one row.
 */
export function impossibleResultFindings(breaches: any[]): Finding[] {
  return (breaches || []).map((b) => ({
    code: "impossible_loss",
    severity: "critical" as Severity,
    action: "withhold_row" as Action,
    subject: String(b.trade_key || `${b.short_symbol}/${b.long_symbol}`),
    message:
      `This spread computes a loss of ${money(b.realized_pl)}, but its strikes ` +
      `cannot lose more than ${money(b.max_loss)}. The figure is withheld ` +
      `until we can explain the difference; the trade itself is unaffected.`,
    detail: {
      short_symbol: b.short_symbol,
      long_symbol: b.long_symbol,
      close_date: b.close_date,
      computed_realized_pl: b.realized_pl,
      arithmetic_floor: b.max_loss,
      excess: Number((b.realized_pl - b.max_loss).toFixed(2))
    }
  }));
}

/**
 * A sync that wants to remove most of what is stored.
 *
 * Still the right thing to notice -- a truncated broker feed, an outage
 * returning a short page, a credential that has stopped working all look like
 * "the account has no trades any more". What changes is the remedy: the rows
 * stay, the rest of the sync proceeds, and somebody is told. The old refusal
 * threw away a good update to protect the rows, and then the account went
 * stale as well.
 */
export const MAX_AUTO_DELETE_SHARE = 0.25;
export const MAX_AUTO_DELETE_FLOOR = 5;

export function massDeleteFinding(
  kind: string,
  removing: number,
  stored: number
): Finding | null {
  if (removing <= MAX_AUTO_DELETE_FLOOR) return null;
  if (stored === 0 || removing / stored <= MAX_AUTO_DELETE_SHARE) return null;
  return {
    code: "mass_delete_held",
    severity: "critical",
    action: "keep_deleted",
    subject: kind,
    message:
      `The broker's answer would have removed ${removing} of ${stored} stored ` +
      `${kind} in one refresh. They have been kept rather than deleted, and ` +
      `nothing else about the refresh was affected. This usually means the ` +
      `account's connection to the broker has stopped returning its history.`,
    detail: {
      kind,
      would_remove: removing,
      stored,
      share: Number((removing / stored).toFixed(4)),
      threshold: MAX_AUTO_DELETE_SHARE
    }
  };
}

/**
 * A share lot the reconstruction could not attribute to any option.
 *
 * Not withheld and not an error: `dailyPortfolio` already counts these and
 * Analysis already shows the difference they make. It is here so that the
 * count is on the record beside everything else, instead of being a term in
 * one page's arithmetic that nobody is watching.
 */
export function orphanedStockFinding(orphaned: any[]): Finding | null {
  const rows = orphaned || [];
  if (!rows.length) return null;
  const total = rows.reduce((s, l) => s + (Number(l?.realized_pl) || 0), 0);
  return {
    code: "orphaned_stock",
    severity: "info",
    action: "note",
    subject: "share lots",
    message:
      `${rows.length} share ${rows.length === 1 ? "lot" : "lots"} worth ` +
      `${money(total)} could not be attributed to the option that moved them, ` +
      `so they are counted in the account total but sit on no individual trade.`,
    detail: { lots: rows.length, realized_pl: Number(total.toFixed(2)) }
  };
}

// ---------------------------------------------------------------------------
// Running them, and acting on what they say
// ---------------------------------------------------------------------------

/**
 * Every check, in one pass, over one account's freshly reconstructed set.
 *
 * Adding a check means adding it here and nowhere else -- the actions, the
 * persistence and the surfacing are all driven off the returned findings.
 */
export function auditAccount(input: {
  breaches?: any[];
  orphaned?: any[];
  deletions?: { kind: string; removing: number; stored: number }[];
}): Finding[] {
  const findings: Finding[] = [
    ...impossibleResultFindings(input.breaches || [])
  ];
  for (const d of input.deletions || []) {
    const f = massDeleteFinding(d.kind, d.removing, d.stored);
    if (f) findings.push(f);
  }
  const orphan = orphanedStockFinding(input.orphaned || []);
  if (orphan) findings.push(orphan);
  return findings;
}

/** The trade_keys whose figures this run has decided not to stand behind. */
export function withheldKeys(findings: Finding[]): Set<string> {
  return new Set(
    findings.filter((f) => f.action === "withhold_row").map((f) => f.subject)
  );
}

/** Whether a sync is allowed to delete the rows it wanted to delete. */
export function deletionsHeld(findings: Finding[], kind: string): boolean {
  return findings.some((f) => f.action === "keep_deleted" && f.subject === kind);
}

/**
 * Stamp the withholding onto the rows themselves.
 *
 * On the row rather than only in a findings table, because every reader of
 * `trade_records` has to honour it and a reader that has to join another table
 * to find out whether a number is trustworthy is a reader that will one day
 * forget to. `integrity_code` null means clean; that is the whole predicate.
 */
export function applyFindings(records: any[], findings: Finding[]): any[] {
  const byKey = new Map<string, Finding>();
  for (const f of findings) {
    if (f.action === "withhold_row") byKey.set(f.subject, f);
  }
  return (records || []).map((r) => {
    const f = byKey.get(r.trade_key);
    return f
      ? { ...r, integrity_code: f.code, integrity_detail: f.detail }
      : { ...r, integrity_code: null, integrity_detail: null };
  });
}

/**
 * The one predicate every monetary reader shares.
 *
 * A withheld row is still a trade that happened and is still shown as one. It
 * is excluded from sums, statistics and the equity walk, and the count of what
 * was excluded travels beside every total -- a page that quietly reports a
 * smaller number is worse than one that reports a dash.
 */
export const withheld = (t: any): boolean => !!t?.integrity_code;
