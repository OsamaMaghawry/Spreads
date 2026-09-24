import { useState } from "react";
import { ChevronDown, Flag } from "lucide-react";
import { fmtMoney } from "@/lib/format";

// FOUR FIGURES, AND THE CAVEAT SITS ON THE ONE IT CHANGES.
//
// The page used to open with three full-width notices -- an unattributed
// trade, the withdrawals, and what the current view counts -- stacked above
// every number they qualify. The owner, reading his own export: "Too much
// going on over there!" He was right, and the fault was placement rather than
// content. A reader meets a red banner about a figure they have not seen yet,
// cannot act on it, and scrolls past; by the time they reach the win rate the
// warning is a screen away and forgotten.
//
// So a caveat now belongs to a NUMBER, not to a page. The win rate wears the
// unattributed trade because that is the figure it moves; return on capital
// wears the transfers because that is the figure they move. A tile with
// something attached shows an amber flag, so which figures carry doubt is
// legible without reading a word.
//
// Opening a tile is the whole explanation: the arithmetic that produced the
// figure, then the caveat in full. Nothing is hidden that used to be shown --
// it is one tap away instead of one screen above, and the Method tab still
// carries every note in one place for anyone who wants them together.

const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
// A RETURN CARRIES ITS SIGN. Every money figure on this page comes through
// fmtMoney, which prints one; the percentages did not, so a positive return
// read "2.1%" beside a total reading "+$646.91" and a losing month would have
// been the only one of the pair that announced itself. A reader scanning four
// tiles should not have to work out which figures are allowed to be negative.
const signedPct = (v, d = 1) =>
  v === null || v === undefined || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const mult = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : `${v.toFixed(1)}×`);

function Tile({ label, value, caption, flagged, children }) {
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(children);
  return (
    <div
      className={[
        "rounded-xl border bg-white transition-colors",
        open ? "border-dm-accent ring-4 ring-dm-accent/10" : flagged ? "border-amber-300 bg-amber-50" : "border-dm-line",
        open ? "sm:col-span-2" : ""
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        className="w-full px-3.5 py-3 text-left disabled:cursor-default"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.09em] ${flagged ? "text-amber-700" : "text-dm-sub"}`}>
              {label}
              {flagged && <Flag className="h-3 w-3" aria-label="has a caveat" />}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-dm-text">{value}</div>
            {caption && <div className="mt-0.5 text-[11px] text-dm-sub">{caption}</div>}
          </div>
          {canOpen && (
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>
      {open && <div className="border-t border-dm-line px-3.5 py-3 text-[11.5px] leading-relaxed text-dm-sub">{children}</div>}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between py-0.5">
    <span>{k}</span>
    <span className="font-semibold tabular-nums text-dm-text">{v}</span>
  </div>
);

const Caveat = ({ children }) => (
  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
    {children}
  </div>
);

export default function StatTiles({ stats, withheld, transfersNote, setupCount }) {
  const n = withheld?.count || 0;
  const premium = stats.view === "premium";

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Tile
        label="Win rate"
        value={pct(stats.winRate, 0)}
        caption={
          stats.settledTrades
            ? `${stats.wins} of ${stats.settledTrades} measurable trade${stats.settledTrades === 1 ? "" : "s"}`
            : "no settled trades"
        }
        flagged={n > 0}
      >
        <Row k="Wins" v={stats.wins} />
        <Row k="Losses" v={stats.losses} />
        {stats.scratches > 0 && <Row k="Scratches" v={stats.scratches} />}
        <Row k="Measured over" v={`${stats.settledTrades} trades`} />
        {n > 0 && (
          <Caveat>
            <b className="font-semibold">
              {n} {n === 1 ? "trade is" : "trades are"} not counted here.
            </b>{" "}
            {n === 1 ? "Its result" : "Their results"} cannot be attributed to a position, so the money is in the
            total above but not in this rate. See <span className="font-medium">Method</span>.
          </Caveat>
        )}
      </Tile>

      <Tile
        label="Avg win / loss"
        value={mult(stats.payoffRatio)}
        caption={
          stats.avgWin !== null && stats.avgLoss !== null
            ? `${fmtMoney(stats.avgWin)} vs ${fmtMoney(Math.abs(stats.avgLoss))}`
            : "needs a win and a loss"
        }
      >
        <Row k="Average win" v={stats.avgWin === null ? "—" : fmtMoney(stats.avgWin)} />
        <Row k="Average loss" v={stats.avgLoss === null ? "—" : fmtMoney(Math.abs(stats.avgLoss))} />
        <Row k="Largest win" v={stats.largestWin === null ? "—" : fmtMoney(stats.largestWin)} />
        <Row k="Largest loss" v={stats.largestLoss === null ? "—" : fmtMoney(stats.largestLoss)} />
        <p className="mt-2">
          How many times bigger the average win is than the average loss. It says nothing about how often either
          happens — read it beside the win rate, never instead of it.
        </p>
      </Tile>

      <Tile
        label="Closed trades"
        value={stats.trades}
        caption={setupCount ? `${setupCount} setup${setupCount === 1 ? "" : "s"}` : `${stats.contracts} contracts`}
      >
        <Row k="Closed trades" v={stats.trades} />
        {setupCount > 0 && <Row k="Grouped into" v={`${setupCount} setups`} />}
        <Row k="Contracts" v={stats.contracts} />
        {stats.provisionalTrades > 0 && <Row k="Provisional" v={stats.provisionalTrades} />}
        <p className="mt-2">
          A setup is the position a trader actually held — a wheel's put, its assignment and the calls written after
          it are one setup, not four trades.
        </p>
      </Tile>

      <Tile
        label={premium ? "Return on risk" : "Return on capital"}
        value={signedPct(premium ? stats.returnOnRisk : stats.roe)}
        caption={transfersNote ? "weighted for transfers" : premium ? "against peak collateral" : "against capital at work"}
        flagged={Boolean(transfersNote)}
      >
        <Row k="Result" v={fmtMoney(stats.totalPL)} />
        <Row k="Against" v={premium ? "peak collateral" : "capital at work"} />
        <Row k="Over" v={`${stats.spanDays} days`} />
        {stats.annualizable ? (
          <Row k="Annualized" v={signedPct(stats.annualized)} />
        ) : (
          <p className="mt-2">
            Not annualized: that needs 30 closed trades and 90 days. Scaling a short window multiplies its noise
            rather than its result.
          </p>
        )}
        {transfersNote && <Caveat>{transfersNote}</Caveat>}
      </Tile>
    </div>
  );
}
