// History is frozen. A rebuild may add days; it may not change the past.
//
// THE DEFECT THIS EXISTS FOR. `account_equity_daily` is rebuilt from scratch
// on every rebuild -- a year of bars, every trade, every lot, walked again --
// and the result is written over whatever was stored. On 16 September the
// nightly rebuild met one option leg it could not date, and wrote `null` over
// 52 days of a live account's history. The weekly email had gone out four
// days earlier from the good series; the Analysis page read the blanked one.
// Nothing compared the new series to the old, and nothing kept what the email
// had said. The owner:
//
//   *"how can I guarantee this doesn't change in the future. because last
//   time it looked okay and it changed next week."*
//
// Nothing guaranteed it. This is the guarantee, in two parts:
//
//   1. `freezeSeries`  A stored day older than the last few sessions is FROZEN.
//                      If a rebuild computes a different figure for it -- more
//                      than a cent away, or a blank where a value was -- the
//                      stored row is kept, the computed one is not written,
//                      and the difference is recorded and mailed. Filling a
//                      blank with a value is allowed: that is a repair, not a
//                      change. An operator who means to rewrite the past says
//                      so (`rewriteHistory`), and the rewrite is recorded too.
//
//   2. `digestDrift`   Every weekly email stores the figures it rendered
//                      (`weekly_digest_sends.figures`, migration 0054). After
//                      each rebuild those figures are recomputed from the
//                      series as it now stands and compared. A sent number
//                      that the product would no longer print is mailed to the
//                      owner, with both values.
//
// Both are pure. The I/O -- reading the stored series, writing the kept rows,
// reading the sends, recording findings, sending mail -- lives in
// equityHistory/index.ts and is tested by running it against staging.
//
// WHY THE LAST FEW SESSIONS ARE NOT FROZEN. Today's row moves while the market
// does, and a trade the sync picks up a day late legitimately changes the day
// or two before it. Five sessions is a week: long enough that ordinary late
// data lands inside it, short enough that a week-old email's figures are
// already behind the line.

import type { Finding } from "./integrity.ts";

export const FREEZE_AFTER_SESSIONS = 5;
export const FREEZE_TOLERANCE = 0.01;

// The columns a frozen day is held on. `equity` is the broker's own figure and
// the SQL upsert already refuses to blank it, so only a CHANGE counts there;
// the derived columns are overwritten unconditionally by the upsert, so both a
// change and a blank count.
const DERIVED = ["performance", "premium_cum", "shares_booked", "shares_open", "options_open"] as const;
const BROKER = ["equity"] as const;

export type SeriesRow = { day: string; [k: string]: unknown };

export type Drift = {
  day: string;
  column: string;
  stored: number;
  computed: number | null;
  kind: "blanked" | "changed";
};

export type Freeze = {
  /** The rows the rebuild may write: new days, recent days, and frozen days that did not move. */
  rows: SeriesRow[];
  /** Every frozen figure the rebuild tried to change. */
  drift: Drift[];
  /** The days whose stored row was kept instead of the computed one. */
  held: string[];
  /** Days strictly before this are frozen; null when the series is too short to freeze anything. */
  frozenBefore: string | null;
  /** True when the caller asked for the past to be rewritten and it was. */
  rewritten: boolean;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function freezeSeries(
  stored: SeriesRow[],
  computed: SeriesRow[],
  opts: { sessions?: number; tolerance?: number; rewriteHistory?: boolean } = {}
): Freeze {
  const sessions = opts.sessions ?? FREEZE_AFTER_SESSIONS;
  const tolerance = opts.tolerance ?? FREEZE_TOLERANCE;
  const byDay = new Map<string, SeriesRow>();
  for (const r of stored || []) if (r?.day) byDay.set(String(r.day), r);
  const days = [...byDay.keys()].sort();
  const frozenBefore = days.length > sessions ? days[days.length - sessions] : null;

  const rows: SeriesRow[] = [];
  const drift: Drift[] = [];
  const held: string[] = [];

  for (const r of computed || []) {
    const day = String(r?.day || "");
    const prev = frozenBefore && day < frozenBefore ? byDay.get(day) : undefined;
    if (!prev) { rows.push(r); continue; }

    const rowDrift: Drift[] = [];
    for (const c of DERIVED) {
      const a = num(prev[c]);
      const b = num(r[c]);
      // A stored blank may become a value: that is a repair. The 16 September
      // repair itself was exactly this shape, 52 nulls becoming numbers.
      if (a === null) continue;
      if (b === null) rowDrift.push({ day, column: c, stored: round2(a), computed: null, kind: "blanked" });
      else if (Math.abs(a - b) > tolerance) rowDrift.push({ day, column: c, stored: round2(a), computed: round2(b), kind: "changed" });
    }
    for (const c of BROKER) {
      const a = num(prev[c]);
      const b = num(r[c]);
      if (a === null || b === null) continue;
      if (Math.abs(a - b) > tolerance) rowDrift.push({ day, column: c, stored: round2(a), computed: round2(b), kind: "changed" });
    }

    if (!rowDrift.length) { rows.push(r); continue; }
    drift.push(...rowDrift);
    if (opts.rewriteHistory) rows.push(r);
    else held.push(day);
  }

  return { rows, drift, held, frozenBefore, rewritten: Boolean(opts.rewriteHistory) && drift.length > 0 };
}

// ---------------------------------------------------------------------------
// A sent digest, against the series as it now stands
// ---------------------------------------------------------------------------

/** The figures a digest stores that come from the daily series alone. */
export const DIGEST_SERIES_FIELDS = [
  "performance", "premiumLine", "sharesBooked", "sharesMark", "optionsMark", "equityChange", "equityEnd"
] as const;

export type DigestDrift = { field: string; sent: number | string | null; now: number | string | null };

/**
 * Which of a sent digest's figures the product would no longer print.
 *
 * @param figures  weekly_digest_sends.figures as stored at send time
 * @param week     accountWeek(...) recomputed now over the same window
 */
export function digestDrift(figures: any, week: any, tolerance = 0.005): DigestDrift[] {
  const out: DigestDrift[] = [];
  if (!figures || !week) return out;
  for (const f of DIGEST_SERIES_FIELDS) {
    const sent = num(figures[f]);
    const now = num(week[f]);
    if (sent === null && now === null) continue;
    if (sent === null || now === null || Math.abs(sent - now) > tolerance) {
      out.push({ field: f, sent: sent === null ? null : round2(sent), now: now === null ? null : round2(now) });
    }
  }
  // The two closes the week was measured between. A different pair means the
  // series gained or lost a day around the window, which moves every figure.
  for (const f of ["measuredFrom", "measuredTo"] as const) {
    const sent = figures[f] ?? null;
    const now = week[f] ?? null;
    if ((sent || null) !== (now || null)) out.push({ field: f, sent, now });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Findings, and the mail
// ---------------------------------------------------------------------------

export const HISTORY_FINDING_CODES = ["history_frozen", "history_rewritten", "digest_drift"] as const;

const money = (n: number | null) =>
  n === null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

/** The finding for a rebuild that tried to change frozen days. One per account. */
export function historyFinding(freeze: Freeze): Finding | null {
  if (!freeze.drift.length) return null;
  const days = [...new Set(freeze.drift.map((d) => d.day))].sort();
  const sample = freeze.drift.slice(0, 20);
  // A stable subject and a signature in the detail: the finding stays open
  // while the same days keep drifting, and the mail goes out only when the
  // set of days changes. Without the signature every nightly run would be a
  // fresh alarm about the same thing.
  const signature = days.join(",");
  if (freeze.rewritten) {
    return {
      code: "history_rewritten",
      severity: "warning",
      action: "note",
      subject: "day-by-day series",
      message:
        `An operator asked for the stored day-by-day history to be rewritten, and ${days.length} ` +
        `past day${days.length === 1 ? "" : "s"} changed (${days[0]} to ${days[days.length - 1]}).`,
      detail: { days: days.length, from: days[0], to: days[days.length - 1], sample, signature }
    };
  }
  return {
    code: "history_frozen",
    severity: "critical",
    action: "hold_writes",
    subject: "day-by-day series",
    message:
      `A rebuild computed different figures for ${days.length} stored past day${days.length === 1 ? "" : "s"} ` +
      `(${days[0]} to ${days[days.length - 1]}). The stored history was kept and the new figures were not ` +
      `written. Something about the inputs to those days changed, and someone has to decide which version is right.`,
    detail: {
      days: days.length,
      from: days[0],
      to: days[days.length - 1],
      frozenBefore: freeze.frozenBefore,
      blanked: freeze.drift.filter((d) => d.kind === "blanked").length,
      changed: freeze.drift.filter((d) => d.kind === "changed").length,
      sample,
      signature
    }
  };
}

/** The finding for a sent digest whose figures the series no longer supports. One per send. */
export function digestDriftFinding(
  send: { week_start: string; mode: string; sent_at?: string | null },
  drift: DigestDrift[]
): Finding | null {
  if (!drift.length) return null;
  const signature = drift.map((d) => `${d.field}:${d.sent}>${d.now}`).join(";");
  const first = drift[0];
  return {
    code: "digest_drift",
    severity: "critical",
    action: "note",
    subject: `${send.week_start}/${send.mode}`,
    message:
      `The weekly email for the week of ${send.week_start} said ${first.field} was ` +
      `${typeof first.sent === "number" ? money(first.sent) : String(first.sent)}; the stored series now gives ` +
      `${typeof first.now === "number" ? money(first.now) : String(first.now)}` +
      `${drift.length > 1 ? `, and ${drift.length - 1} more figure${drift.length > 2 ? "s" : ""} moved` : ""}. ` +
      `What was mailed and what the page shows no longer agree.`,
    detail: { weekStart: send.week_start, mode: send.mode, sentAt: send.sent_at ?? null, drift, signature }
  };
}

/** The mail for the findings that are NEW this run. Plain, factual, two values per line. */
export function driftEmail(accountName: string, findings: Finding[]): { subject: string; text: string; html: string } {
  const frozen = findings.filter((f) => f.code === "history_frozen");
  const rewritten = findings.filter((f) => f.code === "history_rewritten");
  const digests = findings.filter((f) => f.code === "digest_drift");
  const subject =
    frozen.length ? `DeltaMint: stored history held for ${accountName}`
      : digests.length ? `DeltaMint: a sent weekly email no longer matches ${accountName}`
        : `DeltaMint: stored history rewritten for ${accountName}`;

  const lines: string[] = [`Account: ${accountName}`, ""];
  for (const f of [...frozen, ...rewritten]) {
    lines.push(f.message, "");
    for (const d of (f.detail.sample as Drift[]) || []) {
      lines.push(`  ${d.day}  ${d.column}  stored ${money(d.stored)}  computed ${money(d.computed)}  (${d.kind})`);
    }
    if ((f.detail.days as number) > 20) lines.push(`  ... ${(f.detail.days as number) - 20} more days not listed`);
    lines.push("");
  }
  for (const f of digests) {
    lines.push(f.message, "");
    for (const d of (f.detail.drift as DigestDrift[]) || []) {
      const fmt = (v: number | string | null) => (typeof v === "number" ? money(v) : String(v ?? "—"));
      lines.push(`  ${d.field}  sent ${fmt(d.sent)}  now ${fmt(d.now)}`);
    }
    lines.push("");
  }
  lines.push(
    "Nothing was changed by this message. The stored history is as it was; the figures above are what a rebuild wanted to write, or what an email said.",
    "To rewrite the past on purpose, run the scheduled rebuild with rewriteHistory: true for this account."
  );
  const text = lines.join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;">${esc(text)}</pre>`;
  return { subject, text, html };
}
