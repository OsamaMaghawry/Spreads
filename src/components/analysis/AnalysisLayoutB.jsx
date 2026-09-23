import { useState } from "react";
import StatTiles from "./StatTiles";
import MethodNotes, { methodNotes } from "./MethodNotes";
import EquityCurveChart from "./EquityCurveChart";
import ViewSwitch from "./ViewSwitch";
import WindowParts from "./WindowParts";
import OpenBookPanel from "./OpenBookPanel";
import OpenOptionsPanel from "./OpenOptionsPanel";
import SetupBreakdown from "./SetupBreakdown";
import StrategyComparison from "./StrategyComparison";
import CaptureBreakdown from "./CaptureBreakdown";
import BreakdownTable from "./BreakdownTable";
import { fmtMoney } from "@/lib/format";

// CHART FIRST, METHOD LAST.
//
// The page this replaces rendered fourteen blocks in one column, and the
// headline figures were the ninth of them: three full-width notices, then four
// position panels, and only then a number. The owner: "I started to feel it's
// chaotic, overwhelming and unorganized ... start with the chart above and
// anything would follow. The diagnosis make it at the bottom as a note."
//
// Nothing is removed. The same panels, the same figures, the same disclosures,
// re-ordered so that the answer is first and the qualifications are reachable
// rather than unavoidable:
//
//   result + chart  ->  four tiles  ->  one tab at a time  ->  method
//
// WHY TABS AND NOT A LONGER PAGE. Analysis has grown a panel roughly every
// fortnight and every one of them was appended, because appending is what a
// single column invites. Tabs make the cost of a new panel visible: it has to
// belong to one of five named places, and if it belongs to none of them that
// is a question worth asking before it ships rather than after.
//
// The notices are not hidden by this. Each one is also attached to the figure
// it moves (see StatTiles), the Method tab carries the count so the page
// always admits how many there are, and the same notes close the page as a
// footer for anyone reading straight down.

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "positions", label: "Positions" },
  { key: "strategies", label: "Strategies" },
  { key: "trades", label: "Trades" },
  { key: "method", label: "Method" }
];

export default function AnalysisLayoutB({
  isPaper,
  withheldLine,
  transfersNote,
  viewNote,
  view,
  onViewChange,
  hasOpen,
  viewFigure,
  viewFigureLabel,
  viewMarked,
  stats,
  withheldFigure,
  setupCount,
  curve,
  chartMode,
  onChartMode,
  hasValueSeries,
  chartFallbackReason,
  windowEnd,
  chartReconcileNote,
  parts,
  book,
  optionBook,
  positionSetups,
  comparison,
  splitCount,
  subset,
  disclosure
}) {
  const [tab, setTab] = useState("summary");
  const notes = methodNotes({ withheldLine, transfersNote, viewNote });
  const total = stats.view === "premium" ? "Option-leg P/L" : stats.includesUnrealized ? "Total" : "Realized";
  const positive = stats.totalPL >= 0;

  return (
    <div className="space-y-4 bg-white">
      {/* Kept at the very top and kept unconditional: a simulated account must
          never produce a page — or an exported PDF, which is a raster of this
          DOM — that reads like a record of real money. */}
      {isPaper && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
          Paper account &mdash; every figure below is simulated, not real money.
        </div>
      )}

      {/* ---- the answer, then the chart it came from ---- */}
      <div className="rounded-xl border border-dm-line bg-white px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-dm-sub">
              {total} &middot; {stats.view === "premium" ? "premium only" : "whole view"}
            </div>
            <div
              className={`mt-1 font-heading text-[40px] font-bold leading-none tabular-nums ${
                positive ? "text-dm-positive" : "text-dm-negative"
              }`}
            >
              {fmtMoney(stats.totalPL)}
            </div>
          </div>
          <div className="pb-1 text-[11.5px] leading-snug text-dm-sub">
            {stats.trades} closed trade{stats.trades === 1 ? "" : "s"}
            <br />
            over {stats.spanDays} day{stats.spanDays === 1 ? "" : "s"}
          </div>
          {/* The switch belongs beside the figure it redefines, not in a panel
              of its own two screens away. */}
          {hasOpen && (
            <div className="ml-auto pb-0.5">
              <ViewSwitch
                value={view}
                onChange={onViewChange}
                figure={viewFigure}
                figureLabel={viewFigureLabel}
                marked={viewMarked}
              />
            </div>
          )}
        </div>

        <div className="mt-3">
          <EquityCurveChart
            curve={curve}
            view={view}
            mode={chartMode}
            onModeChange={onChartMode}
            hasValueSeries={hasValueSeries}
            fallbackReason={chartFallbackReason}
            windowEnd={windowEnd}
            reconcileNote={chartReconcileNote}
          />
        </div>
      </div>

      {/* ---- four figures, each carrying its own caveat ---- */}
      <StatTiles
        stats={stats}
        withheld={withheldFigure}
        transfersNote={transfersNote}
        setupCount={setupCount}
      />

      {/* ---- one thing at a time ---- */}
      <div>
        <div className="flex gap-0.5 overflow-x-auto border-b border-dm-line" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[12.5px] transition-colors ${
                tab === t.key
                  ? "border-dm-accent font-semibold text-dm-accent"
                  : "border-transparent text-dm-sub hover:text-dm-text"
              }`}
            >
              {t.label}
              {t.key === "method" && notes.length > 0 && (
                <span className="ml-1.5 rounded bg-amber-600 px-1.5 py-px font-mono text-[9px] font-semibold text-white">
                  {notes.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          {tab === "summary" && (
            <>
              {parts && <WindowParts parts={parts} />}
              <CaptureBreakdown trades={subset} />
            </>
          )}

          {tab === "positions" && (
            <>
              {book.lots > 0 && <OpenBookPanel book={book} priced={view === "whole"} />}
              <OpenOptionsPanel book={optionBook} priced={view === "whole"} />
              {book.lots === 0 && optionBook.count === 0 && (
                <p className="rounded-xl border border-dm-line bg-white px-4 py-8 text-center text-sm text-dm-sub">
                  Nothing open. Every position in this window is closed, so the figures above are settled money.
                </p>
              )}
            </>
          )}

          {tab === "strategies" &&
            (comparison.length > 1 ? (
              <StrategyComparison rows={comparison} splitCount={splitCount} />
            ) : (
              <p className="rounded-xl border border-dm-line bg-white px-4 py-8 text-center text-sm text-dm-sub">
                One strategy in this window — there is nothing to compare it against.
              </p>
            ))}

          {tab === "trades" && (
            <>
              <SetupBreakdown setups={positionSetups} />
              <div className="grid gap-4 lg:grid-cols-2">
                <BreakdownTable
                  title={view === "premium" ? "By month — option legs" : "By month"}
                  keyLabel="Month"
                  keyField="month"
                  rows={stats.byMonth}
                />
                <BreakdownTable
                  title={view === "premium" ? "By ticker — option legs" : "By ticker"}
                  keyLabel="Ticker"
                  keyField="ticker"
                  rows={stats.byTicker}
                />
              </div>
            </>
          )}

          {tab === "method" && (
            <MethodNotes notes={notes}>
              {notes.length === 0 && (
                <p className="rounded-xl border border-dm-line bg-white px-4 py-8 text-center text-sm text-dm-sub">
                  Nothing qualifies these figures. Every closed trade in this window is attributed to a position,
                  and no money moved in or out of the account.
                </p>
              )}
              {disclosure}
            </MethodNotes>
          )}
        </div>
      </div>

      {/* ---- and the same notes close the page ----
          For the reader who never touches a tab, and for the PDF, which is a
          raster of this DOM: the export must not be able to lose a disclosure
          just because it was behind a tab that was not open when the button
          was pressed. */}
      {tab !== "method" && (
        <div className="space-y-2.5 border-t border-dm-line pt-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-dm-sub">How this is measured</div>
          <MethodNotes notes={notes}>{disclosure}</MethodNotes>
        </div>
      )}
    </div>
  );
}
