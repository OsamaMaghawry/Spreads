import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { fmtMoney } from "@/lib/format";

// What the audit pass found, per account — the reader `integrity_findings`
// never had.
//
// The table shipped with one writer and no readers anywhere in the product:
// not the admin panel, not the digest, not the cron's own result. So the
// framework's loudest actions — a trade whose figures we will not stand
// behind, an account whose writes were frozen — were invisible to the user,
// to the operator, and to the job that caused them. A warning light nobody is
// wired to is not an audit, and this panel is the wire.
//
// Loads its own data, like Blog and Settings, so the overview query does not
// wait on it and it does not wait on the overview query.

const SEVERITY = {
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-slate-50 text-slate-600 border-slate-200"
};

// What was actually DONE about it, in the operator's words rather than the
// enum's. The action is the part that decides whether a user is looking at a
// wrong number today.
const ACTION = {
  withhold_row: "Figures withheld on this trade",
  hold_writes: "Writes frozen — stored history left as it was",
  note: "Recorded only"
};

const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—");

export default function IntegrityPanel() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    invokeFunction("adminData", { action: "integrity" })
      .then((r) => {
        if (r.data?.error) throw new Error(r.data.error);
        setRows(r.data?.findings || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>;
  }
  if (!rows) return <div className="py-16 text-center text-sm text-dm-sub">Loading…</div>;

  const open = rows.filter((r) => !r.resolved_at);
  const resolved = rows.filter((r) => r.resolved_at);
  const shown = showResolved ? rows : open;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-heading text-lg font-bold tracking-[-0.02em] text-dm-text">
          {open.length === 0 ? "Nothing open" : `${open.length} open`}
        </h2>
        <p className="text-xs text-dm-sub">
          Findings close themselves when a later sync stops producing them, so what is open is what is
          wrong today. {resolved.length > 0 && `${resolved.length} resolved.`}
        </p>
        {resolved.length > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
          >
            {showResolved ? "Open only" : "Include resolved"}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-dm-sub">
          No account has a figure we are declining to publish.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <div
              key={f.id}
              className={`rounded-xl border bg-white p-4 space-y-2 ${
                f.resolved_at ? "border-slate-200 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${SEVERITY[f.severity] || SEVERITY.info}`}>
                  {f.severity}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {f.accountName || f.account_id}
                </span>
                {f.isPaper && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                    paper
                  </span>
                )}
                {f.resolved_at && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    resolved {when(f.resolved_at)}
                  </span>
                )}
              </div>

              {/* The sentence the check itself wrote. It is written for a person
                  and carries its own numbers, so it is shown rather than
                  re-summarised here. */}
              <p className="text-sm text-slate-700 leading-relaxed">{f.message}</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dm-sub">
                <span className="font-medium text-slate-600">{ACTION[f.action] || f.action}</span>
                <span>First seen {when(f.first_seen_at)}</span>
                <span>Last seen {when(f.last_seen_at)}</span>
                {/* Passes, not days — the sync runs roughly hourly, so this
                    counts how many times it has been re-observed rather than
                    how long it has been true. Said, so nobody reads it as
                    "96 days". */}
                <span>Seen on {f.seen_count} {f.seen_count === 1 ? "pass" : "passes"}</span>
              </div>

              {/* The subject is a trade_key or a record kind. Long, and the
                  thing an operator pastes into a query, so it gets its own
                  scrollable line rather than wrapping into the prose. */}
              <div className="overflow-x-auto">
                <code className="text-[11px] text-slate-500 whitespace-nowrap">{f.subject}</code>
              </div>

              {/* The numbers behind the sentence. Only the ones a reader would
                  act on: what was computed, what the structure allows, and how
                  much share result moved with it. */}
              {f.detail && Object.keys(f.detail).length > 0 && (
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs pt-1 border-t border-slate-100">
                  {f.detail.computed_realized_pl !== undefined && (
                    <Fact label="Computed" value={fmtMoney(f.detail.computed_realized_pl)} />
                  )}
                  {f.detail.arithmetic_floor !== undefined && (
                    <Fact label="Structural floor" value={fmtMoney(f.detail.arithmetic_floor)} />
                  )}
                  {f.detail.excess !== undefined && (
                    <Fact label="Past the floor by" value={fmtMoney(f.detail.excess)} />
                  )}
                  {f.detail.withheld_share_pl !== undefined && (
                    <Fact
                      label={`Share result (${f.detail.withheld_share_lots} ${f.detail.withheld_share_lots === 1 ? "lot" : "lots"})`}
                      value={fmtMoney(f.detail.withheld_share_pl)}
                    />
                  )}
                  {f.detail.would_remove !== undefined && (
                    <Fact label="Would have removed" value={`${f.detail.would_remove} of ${f.detail.stored}`} />
                  )}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-dm-sub">{label}</dt>
      <dd className="font-semibold text-slate-900 tabular-nums">{value}</dd>
    </div>
  );
}
