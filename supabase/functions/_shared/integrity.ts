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
//   hold_writes     the stored set for ONE KIND of record is left exactly as
//                   it is -- nothing deleted, nothing created, nothing
//                   rewritten -- while everything else in the sync proceeds.
//
//                   The first version of this held only the DELETIONS and let
//                   the fresh rows write, on the reasoning that keeping rows
//                   can only be safer. The bench found that it is not: `stale`
//                   includes rows whose IDENTITY changed, so the replacement
//                   arrives under a new key, and holding the delete while
//                   writing the create stores the same closed trade twice,
//                   both copies unflagged. It reproduced at double the true
//                   P/L. A stale account is wrong and self-consistent; a
//                   double-counted account is wrong and looks right, which is
//                   worse than the refusal this framework replaced.
//
//                   So when we cannot tell a truncated feed from a re-keying,
//                   that kind's stored rows do not move at all. Unlike the old
//                   refusal this costs only that kind: the share ledger, the
//                   equity series, the sync timestamp and the audit note all
//                   still proceed, and the account keeps the history it had
//                   instead of being emptied.
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
export type Action = "withhold_row" | "hold_writes" | "note";

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

/**
 * The identity a record keeps across a re-key.
 *
 * THE DEFECT THIS EXISTS FOR, and it was the most expensive thing in this
 * framework. `lot_key` is built from ticker, acquired date, acquired price,
 * DISPOSED DATE, DISPOSED PRICE and quantity -- so selling shares does not
 * update a lot, it creates a differently-keyed one. Six assigned lots called
 * away in one week is therefore "6 of 6 removed", which trips the mass-delete
 * threshold, which froze the whole account -- permanently, because the next
 * pass computes the same 6 of 6, and silently, because the screen still said
 * "synced just now". An ordinary wheel week. Strictly worse than the refusal
 * this framework replaced, which at least announced itself.
 *
 * A RE-KEY IS NOT A DELETION. The stored row does still get deleted -- its
 * replacement lives under a new key -- but it is not EVIDENCE that the broker
 * has stopped returning history, which is the only thing the threshold is
 * looking for. So the count that feeds the threshold is over identities that
 * VANISHED, not over keys that changed.
 */
export const lotIdentity = (l: any): string =>
  [l?.ticker, l?.acquired_date, l?.acquired_price, l?.qty].join("|");

/**
 * How many of a set genuinely disappeared, as opposed to being re-keyed.
 *
 * `stale` (what gets deleted) and `removing` (what the threshold judges) are
 * deliberately different numbers, and conflating them is what froze the
 * account.
 */
export function vanished(stale: any[], fresh: any[], identity: (x: any) => string): number {
  const alive = new Set((fresh || []).map(identity));
  return (stale || []).filter((r) => !alive.has(identity(r))).length;
}

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
    action: "hold_writes",
    subject: kind,
    message:
      `The broker's answer would have removed ${removing} of ${stored} stored ` +
      `${kind} in one refresh. That is more likely a broker problem than a ` +
      `correction, so the stored ${kind} were left exactly as they were and ` +
      `nothing from this refresh was written over them. The rest of the ` +
      `refresh was unaffected. This usually means the account's connection to ` +
      `the broker has stopped returning its history.`,
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
 * Share results the reconstruction could not attribute to any option.
 *
 * Not withheld and not an error: `dailyPortfolio` already counts these and
 * Analysis already shows the difference they make. It is here so that the
 * figure is on the record beside everything else, instead of being a term in
 * one page's arithmetic that nobody is watching.
 *
 * TAKES THE SUM, NOT A LIST OF LOTS. The first version took an array and was
 * therefore dead code: `reconstruct()` returns `orphanedStockPL`, a single
 * number, so the finding could only ever fire in a test fixture while the
 * commit describing it claimed production coverage. Caught by the bench, and
 * worth stating because a check that cannot fire is worse than no check --
 * it reads on the page as an assurance.
 */
export function orphanedStockFinding(orphanedPL: number | null | undefined): Finding | null {
  const total = Number(orphanedPL);
  if (!Number.isFinite(total) || Math.abs(total) < 0.005) return null;
  return {
    code: "orphaned_stock",
    severity: "info",
    action: "note",
    subject: "share lots",
    message:
      `${money(total)} of share results could not be attributed to the option ` +
      `that moved the shares, so it is counted in the account total but sits ` +
      `on no individual trade.`,
    detail: { realized_pl: Number(total.toFixed(2)) }
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
  orphanedStockPL?: number | null;
  deletions?: { kind: string; removing: number; stored: number }[];
}): Finding[] {
  const findings: Finding[] = [
    ...impossibleResultFindings(input.breaches || [])
  ];
  for (const d of input.deletions || []) {
    const f = massDeleteFinding(d.kind, d.removing, d.stored);
    if (f) findings.push(f);
  }
  const orphan = orphanedStockFinding(input.orphanedStockPL);
  if (orphan) findings.push(orphan);
  return findings;
}

/**
 * Two findings may never share (code, subject) in one pass.
 *
 * Postgres raises 21000 -- "ON CONFLICT DO UPDATE command cannot affect row a
 * second time" -- and `record_integrity_findings` is called inside a try/catch
 * that logs and continues, so the whole audit trail for that pass would go dark
 * with one line in a log nobody is reading. Unreachable while trade_keys are
 * unique; one pass over the array is cheaper than depending on that staying
 * true. Last wins, matching the RPC's own upsert.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const f of findings || []) byKey.set(`${f.code}\u0000${f.subject}`, f);
  return [...byKey.values()];
}

/** The trade_keys whose figures this run has decided not to stand behind. */
export function withheldKeys(findings: Finding[]): Set<string> {
  return new Set(
    findings.filter((f) => f.action === "withhold_row").map((f) => f.subject)
  );
}

/**
 * Whether this kind's stored rows are frozen for this pass.
 *
 * True means write NOTHING of that kind -- no delete, no insert, no update.
 * Half-applying it is the defect this replaced: holding the deletions alone
 * lets a re-keyed row land beside the row it was meant to replace.
 */
export function writesHeld(findings: Finding[], kind: string): boolean {
  return findings.some((f) => f.action === "hold_writes" && f.subject === kind);
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
 * Stamp the same withholding onto the share lots that carry the disputed money.
 *
 * THE SHARE HALF, which the first version of this framework had no answer for.
 * Its own doc comment says the impossible-loss defect is an assignment or
 * exercise misattributing a SHARE result onto the wrong option row -- and then
 * only `trade_records` carried a flag, so the money at the heart of the defect
 * stayed published on the lots table, in the share walk and in the equity
 * chart's own reading of the ledger.
 *
 * MATCHED ON OWNERSHIP, NOT ON CHAIN. The first attempt matched a lot to a
 * withheld trade by chain id and was wrong in both directions. `chain_id`
 * prefers the ACQUIRING chain, so a lot assigned in on a questioned chain and
 * called away on a clean one was flagged while the trade publishing its result
 * was not; and a chain owns a LIST of trade rows, so one withheld row withheld
 * its clean siblings' lots too. `attributeStockPL` already decides which row
 * receives each lot's money -- through `ownersOf`, the splitter, and the
 * long-leg-exercise exception -- and `lotOwners` is that decision, recorded.
 * Re-deriving it here is the second implementation `orphanedShares`' own
 * comment warns against.
 *
 * ANY owner being withheld withholds the lot. A lot split across a withheld
 * row and a clean one has an attribution we have said we cannot stand behind;
 * publishing the part that landed on the clean row would be publishing a share
 * of the same disputed split.
 *
 * ONLY DISPOSED LOTS, and the distinction is the point rather than a shortcut.
 * What is in doubt is the ATTRIBUTION of a realised share result -- which trade
 * a closed lot's gain or loss belongs to. A lot still HELD has no attribution
 * question: its quantity is the broker's, its mark is a real closing price, and
 * withholding it would remove a fact nobody disputes from the open book and the
 * account's own value.
 *
 * Not a separate action in the taxonomy: this IS `withhold_row`, applied to the
 * other table the same money lives in. A trade's figures and the share results
 * attributed to that trade are one claim, and splitting them into two actions
 * would let a future caller apply half of it.
 */
export function applyLotFindings(
  lots: any[],
  records: any[],
  lotOwners: Map<string, Set<string>> | null | undefined,
  code = "impossible_loss"
) {
  const withheldTrades = new Set<string>();
  for (const r of records || []) {
    if (r?.integrity_code && r.trade_key) withheldTrades.add(String(r.trade_key));
  }
  return (lots || []).map((l) => {
    const owners = lotOwners?.get?.(l?.lot_key) || null;
    const disputed =
      !!l?.disposed_date &&
      withheldTrades.size > 0 &&
      !!owners &&
      [...owners].some((k) => withheldTrades.has(k));
    return disputed
      ? {
          ...l,
          integrity_code: code,
          integrity_detail: {
            reason: "attributed to a trade whose result its own strikes cannot reach",
            owners: [...(owners as Set<string>)]
          }
        }
      : { ...l, integrity_code: null, integrity_detail: null };
  });
}

/** What the withheld lots came to, for the finding that explains them. */
export function withheldLotSummary(lots: any[]) {
  const flagged = (lots || []).filter((l) => l?.integrity_code);
  return {
    lots: flagged.length,
    realized: Number(
      flagged.reduce((a, l) => a + (Number(l.realized_pl) || 0), 0).toFixed(2)
    )
  };
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

// ---------------------------------------------------------------------------
// The stored series, checked against a number we did not compute
// ---------------------------------------------------------------------------
//
// WHY THESE EXIST, and it is the more important half of the 12 September
// incident. The option-book defect was not found by a test, an agent or a
// check. It was found by the account owner reading his own broker statement:
//
//   *"How I just earned, like, six hundred ... this rebound should be at
//   least two thousand. It doesn't make any sense to me."*
//
// He was right. His account had gone up $2,706.64 that week and the product
// said $624.91. What makes that miss structural rather than unlucky is that
// every check this product had was CLOSED-LOOP: the walk's tests compare its
// output against arithmetic derived from fixtures the same author wrote, the
// impossible-result check compares a row against its own strikes, and
// `integrity.ts` above compares the reconstruction against itself. In all of
// them both sides of the comparison descend from inputs the product chose, so
// a defect in WHICH INPUTS GET CHOSEN is invisible to every one.
//
// And the independent witness was sitting in the same row the whole time.
// `account_equity_daily` stores the broker's own `equity` beside our
// `performance`, and `cash_flows` stores the deposits that legitimately
// separate them. Nothing had ever compared the two.
//
// Both checks emit `note`, never `withhold_row` or `hold_writes`. Blanking a
// chart over a residual is the refuse-to-ship failure this whole framework was
// written to replace; the job here is to tell someone, not to take the screen
// away.

/**
 * The codes these checks own.
 *
 * `record_integrity_findings` resolves anything for the account that the pass
 * did not report, so two writers sharing one account would resolve each
 * other's findings on every run. Each pass therefore names the codes it is
 * responsible for and the resolve half is scoped to those. See migration 0048.
 */
export const SERIES_FINDING_CODES = ["empty_option_book", "equity_divergence"] as const;

type SeriesRow = {
  day: string;
  equity?: number | string | null;
  options_open?: number | string | null;
  performance?: number | string | null;
  unpriced?: string[] | null;
};

/** A leg's life, for the span test. Built from the records, not from the walk. */
type LegSpan = { symbol: string; from: string | null; to: string | null; expiry: string | null };

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * A day that claims an empty option book while a contract was on it.
 *
 * THE EXACT SIGNATURE OF THE 12 SEPTEMBER DEFECT, with no threshold and no
 * prices in it. `options_open = 0` and `unpriced = []` together are an
 * assertion: the account held no option legs that day and nothing was missing.
 * `spans` is built from `trade_records` -- the same table the walk's closed
 * legs come from, read independently -- so if the caller ever again fails to
 * hand the walk the legs it should have, the two disagree and this fires.
 *
 * On Alton's 4 September row it fires immediately: two records (TSLA 362.5P
 * and 367.5P, opened the 3rd, settled the 7th) span that day, and the row says
 * the book was empty. It would have fired on every expiry Friday on every
 * account for as long as the table has existed -- which is exactly the
 * population that made the defect systematic rather than rare.
 */
export function emptyOptionBookFindings(rows: SeriesRow[], spans: LegSpan[]): Finding[] {
  const live = (spans || []).filter((s) => s?.symbol);
  if (!live.length) return [];
  const out: Finding[] = [];
  for (const r of rows || []) {
    if (!r?.day) continue;
    if (n(r.options_open) !== 0) continue;
    if ((r.unpriced || []).length) continue;
    // Same two rules the walk uses, so a disagreement here is a real
    // disagreement and not two spellings of the same boundary.
    const onBook = live.filter(
      (s) =>
        (!s.from || s.from <= r.day) &&
        (!s.to || s.to > r.day) &&
        (!s.expiry || s.expiry >= r.day)
    );
    if (!onBook.length) continue;
    out.push({
      code: "empty_option_book",
      severity: "critical",
      action: "note",
      subject: r.day,
      message:
        `The stored day-by-day series records no option positions on ${r.day}, ` +
        `and nothing missing, while the trade records show ${onBook.length} ` +
        `option leg${onBook.length === 1 ? "" : "s"} on the book that day. ` +
        `That day's performance figure is understated by whatever they were worth.`,
      detail: { day: r.day, legs: onBook.length, symbols: onBook.map((s) => s.symbol).slice(0, 8) }
    });
  }
  return out;
}

// Provisional, and deliberately labelled so. `performance` is blind to
// interest, dividends and fees by construction -- `fetchBrokerData` never asks
// for them -- while the broker's `equity` carries all three, so there is a
// permanent floor under this residual that nobody has measured yet. Set these
// from a quiet week on a real account, not from a guess; until then they are
// wide enough that only a defect of the 12 September size trips them.
export const DIVERGENCE_NOTE = { dollars: 100, share: 0.0025 };
export const DIVERGENCE_WARNING = { dollars: 500, share: 0.01 };

/**
 * What the broker says the week did, against what we say it did.
 *
 * The general net, where `emptyOptionBookFindings` is the exact one. It knows
 * nothing about options, shares or reconstruction, which is the point: it
 * would have caught a defect nobody had imagined, in any of those three, as
 * long as it moved the line away from the account's own value.
 *
 * `flows` is the net of deposits and withdrawals inside the window, and it is
 * REQUIRED rather than optional: equity moves when money is transferred in and
 * `performance` correctly does not, so without the transfers a $700 deposit is
 * indistinguishable from a $700 defect. Null flows produce no finding at all
 * -- "we could not read the transfers" is not evidence of anything.
 */
export function divergenceFinding(
  rows: SeriesRow[],
  flows: number | null,
  label = "the last week"
): Finding | null {
  const usable = (rows || []).filter((r) => r?.day && n(r.equity) !== null && n(r.performance) !== null);
  if (usable.length < 2 || flows === null) return null;
  const sorted = usable.slice().sort((a, b) => a.day.localeCompare(b.day));
  const open = sorted[0];
  const close = sorted[sorted.length - 1];
  const brokerMove = (n(close.equity) as number) - (n(open.equity) as number) - flows;
  const ourMove = (n(close.performance) as number) - (n(open.performance) as number);
  const residual = brokerMove - ourMove;
  const size = Math.abs(n(close.equity) as number);
  const abs = Math.abs(residual);

  const over = (t: { dollars: number; share: number }) =>
    abs > Math.max(t.dollars, size * t.share);
  if (!over(DIVERGENCE_NOTE)) return null;
  const severity: Severity = over(DIVERGENCE_WARNING) ? "warning" : "info";

  return {
    code: "equity_divergence",
    severity,
    action: "note",
    subject: `${open.day}..${close.day}`,
    message:
      `Over ${label} the broker's own account value moved ${money(brokerMove)} once ` +
      `deposits and withdrawals are taken out, and this product's performance line ` +
      `moved ${money(ourMove)}. The ${money(abs)} between them is not explained.`,
    detail: {
      from: open.day,
      to: close.day,
      brokerMoveNetOfFlows: Number(brokerMove.toFixed(2)),
      performanceMove: Number(ourMove.toFixed(2)),
      residual: Number(residual.toFixed(2)),
      flows,
      shareOfEquity: size ? Number((abs / size).toFixed(4)) : null
    }
  };
}
