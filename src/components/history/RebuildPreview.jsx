import { fmtMoney } from "@/lib/format";

// What the next sync will produce, read against what is stored.
//
// The reconstruction rewrites history that real money produced, and its figures
// are the ones used to judge whether a strategy works. Trusting that blind is
// not reasonable, so this shows the whole result it would write — and, on
// request, the broker's own activity feed behind it — having written nothing.
// It is how the assignment and pairing defects were found.

const th = "px-2.5 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-2 whitespace-nowrap tabular-nums";

const Money = ({ value, bold }) => (
  <span className={`${bold ? "font-semibold" : ""} ${value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : ""}`}>
    {fmtMoney(value)}
  </span>
);

const legOf = (r) =>
  [r.short_symbol && `short ${fmtMoney(r.short_strike)}`, r.long_symbol && `long ${fmtMoney(r.long_strike)}`]
    .filter(Boolean)
    .join(" / ");

export default function RebuildPreview({ preview, onCancel, onExportRaw, busy }) {
  const { diff, totals, proposed } = preview;
  const delta = totals.proposedTotal - totals.storedTotal;
  const rows = [
    ["Recorded now", totals.storedTotal],
    ["Premium", totals.proposedPremium],
    ["Early close", totals.proposedEarlyClose],
    ["Shares", totals.proposedStock],
    ...(totals.proposedUnattributedStock ? [["Shares, no option", totals.proposedUnattributedStock]] : []),
    ["Total", totals.proposedTotal]
  ];

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Audit against the broker feed</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Read from {preview.activityCount} broker activities, and written nowhere. This is what the
          next automatic sync will produce, next to what is stored now.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        {rows.map(([label, value], i) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="text-base tabular-nums">
              <Money value={value} bold={label === "Total"} />
            </div>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Change to total</div>
          <div className="text-base tabular-nums"><Money value={delta} /></div>
        </div>
      </div>

      {totals.orphanedStockPL ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          {fmtMoney(totals.orphanedStockPL)} of share results could not be traced back to the option
          that produced them. That means an option was not reconstructed, not that the figure is
          missing from the totals — worth looking at the raw feed below.
        </div>
      ) : null}

      {totals.sharesStillHeld > 0 && (
        <p className="text-xs text-slate-500">
          {totals.sharesStillHeld} share lot{totals.sharesStillHeld === 1 ? "" : "s"} still held and therefore
          excluded from the figures above — unrealized is not a result.
        </p>
      )}

      {[
        ["Removed — recorded now, not reproducible from the broker feed", diff.removed, "border-rose-200 bg-rose-50"],
        ["Added — missing today", diff.created, "border-emerald-200 bg-emerald-50"]
      ].map(([label, list, tone]) =>
        list.length === 0 ? null : (
          <div key={label} className={`overflow-hidden rounded-lg border ${tone}`}>
            <div className="px-3 py-2 text-[11px] font-medium text-slate-700">
              {label} ({list.length})
            </div>
            <table className="w-full bg-white text-sm text-slate-700">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left">
                  <th className={th}>Ticker</th>
                  <th className={th}>Legs</th>
                  <th className={th}>Closed</th>
                  <th className={th}>Result</th>
                  <th className={`${th} text-right`}>P/L</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.trade_key} className="border-b border-slate-100 last:border-0">
                    <td className={`${td} font-medium text-slate-900`}>{r.ticker}</td>
                    <td className={`${td} text-slate-500`}>{legOf(r)}</td>
                    <td className={`${td} text-slate-500`}>{r.close_date}</td>
                    <td className={`${td} text-slate-500`}>{r.close_reason}{r.unpaired ? " · unpaired" : ""}</td>
                    <td className={`${td} text-right`}><Money value={r.realized_pl} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {diff.changed.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
          <div className="px-3 py-2 text-[11px] font-medium text-slate-700">
            Changed — same position, different figure ({diff.changed.length})
          </div>
          <table className="w-full bg-white text-sm text-slate-700">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left">
                <th className={th}>Ticker</th>
                <th className={th}>Legs</th>
                <th className={th}>Closed</th>
                <th className={`${th} text-right`}>Now</th>
                <th className={`${th} text-right`}>After</th>
              </tr>
            </thead>
            <tbody>
              {diff.changed.map(({ before, after }) => (
                <tr key={after.trade_key} className="border-b border-slate-100 last:border-0">
                  <td className={`${td} font-medium text-slate-900`}>{after.ticker}</td>
                  <td className={`${td} text-slate-500`}>{legOf(after)}</td>
                  <td className={`${td} text-slate-500`}>{after.close_date}</td>
                  <td className={`${td} text-right`}><Money value={before.realized_pl} /></td>
                  <td className={`${td} text-right`}><Money value={after.realized_pl} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proposed.stockLots.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="px-3 py-2 text-[11px] font-medium text-slate-700">
            Share lots this would create ({proposed.stockLots.length})
          </div>
          <table className="w-full bg-white text-sm text-slate-700">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left">
                <th className={th}>Ticker</th>
                <th className={`${th} text-right`}>Shares</th>
                <th className={th}>Acquired</th>
                <th className={th}>Disposed</th>
                <th className={`${th} text-right`}>P/L</th>
              </tr>
            </thead>
            <tbody>
              {proposed.stockLots.map((l) => (
                <tr key={l.lot_key} className="border-b border-slate-100 last:border-0">
                  <td className={`${td} font-medium text-slate-900`}>{l.ticker}</td>
                  <td className={`${td} text-right`}>{Number(l.qty)}</td>
                  <td className={`${td} text-slate-500`}>
                    {l.acquired_date ? `${l.acquired_date} @ ${fmtMoney(l.acquired_price)} (${l.acquired_source})` : "unknown basis"}
                  </td>
                  <td className={`${td} text-slate-500`}>
                    {l.disposed_date ? `${l.disposed_date} @ ${fmtMoney(l.disposed_price)} (${l.disposed_source})` : "still held"}
                  </td>
                  <td className={`${td} text-right`}>
                    {l.realized_pl == null ? <span className="text-slate-400">open</span> : <Money value={l.realized_pl} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
        {/* Nothing to commit. The reconstruction is deterministic over the
            whole broker feed, so the next automatic sync writes exactly what is
            proposed here — this reads, it does not decide. */}
        <button onClick={onCancel} className="text-sm text-slate-500 transition-colors hover:text-slate-900">
          Close
        </button>
        {onExportRaw && (
          <button
            onClick={onExportRaw}
            disabled={busy}
            className="text-sm text-slate-500 underline transition-colors hover:text-slate-900 disabled:opacity-50"
            title="The broker's unmodified activity feed plus this proposed result, as JSON"
          >
            Download raw broker activity
          </button>
        )}
        <span className="text-xs text-slate-400">Current records are copied to a backup table first.</span>
      </div>
    </div>
  );
}
