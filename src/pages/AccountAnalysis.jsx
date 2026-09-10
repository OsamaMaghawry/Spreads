import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, ArrowLeft, BarChart3 } from "lucide-react";
import { STRATEGIES, strategyOf, strategyLabel } from "@/lib/strategies";
import { computeStats } from "@/lib/analytics";
import StatCards from "@/components/analysis/StatCards";
import EquityCurveChart from "@/components/analysis/EquityCurveChart";
import BreakdownTable from "@/components/analysis/BreakdownTable";
import StrategyComparison from "@/components/analysis/StrategyComparison";
import StrategyTabs from "@/components/history/StrategyTabs";
import ExportPdfButton from "@/components/analysis/ExportPdfButton";
import DateRangeFilter from "@/components/analysis/DateRangeFilter";
import CaptureBreakdown from "@/components/analysis/CaptureBreakdown";
import OpenBookPanel from "@/components/analysis/OpenBookPanel";
import ViewSwitch from "@/components/analysis/ViewSwitch";
import { openBook, premiumOnly, realizedShares } from "@/lib/openBook";

export default function AccountAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [equity, setEquity] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState("all");
  // Whole view is the DEFAULT. See ViewSwitch for why that is a statement
  // about what the wheel is, not a precaution.
  const [view, setView] = useState("whole");
  const [broker, setBroker] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [syncing, setSyncing] = useState(false);
  const reportRef = useRef(null);

  // Same as the history page: the function refreshes itself when what it holds
  // is stale, so there is nothing here to press.
  const load = useCallback(async () => {
    setError(null);
    try {
      const [hist, live] = await Promise.all([
        invokeFunction("tradeHistory", { accountId: id }),
        invokeFunction("syncAccounts", {}).catch(() => null)
      ]);
      if (hist.data?.error) throw new Error(hist.data.error);
      setData(hist.data);
      setSyncing(Boolean(hist.data?.syncing));
      const acct = live?.data?.accounts?.find((a) => a.id === id);
      setEquity(acct?.equity || 0);
      // The marks were already arriving and nothing read them. `brokerView`
      // carries the broker's own current price per position, and this page
      // already called syncAccounts on load -- so pricing the held shares
      // needs no new request, no second price source and no cron.
      setBroker(acct?.broker || []);
      return hist.data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let timer = null;
    load().then((res) => {
      if (res?.syncing) timer = setTimeout(() => load(), 12000);
    });
    return () => timer && clearTimeout(timer);
  }, [load]);

  const allTrades = data?.trades || [];
  const bounds = useMemo(() => {
    const dates = allTrades.map((t) => t.close_date).filter(Boolean).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [allTrades]);
  const trades = useMemo(
    () => allTrades.filter((t) => {
      const d = t.close_date || "";
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    }),
    [allTrades, range]
  );

  const { stats, comparison, subset, provisionalCount } = useMemo(() => {
    const subset = strategy === "all" ? trades : trades.filter((t) => strategyOf(t) === strategy);
    // Equity belongs to the account, not to a strategy, and it was being split
    // between them by *trade count*: cash-secured puts with 44 trades and
    // $1.36M of collateral got 44% of equity while spreads with 55 trades and
    // $20k got 56% — denominators inverted against the capital actually used,
    // with CAGR exponential in the invented number and the whole thing landing
    // in the exported report. There is no honest share to use, so a filtered
    // view withholds return on equity rather than inventing one. Return on
    // risk, which divides by collateral the strategy really tied up, still
    // answers the question for a single strategy.
    const s = computeStats(subset, strategy === "all" ? equity : 0);
    // Built from the shared category list, so a category added there appears
    // here without a second place needing to know the names.
    //
    // Only when looking at everything. Filtering to one strategy and then
    // printing a table of all of them contradicts the filter -- on screen it is
    // merely odd, but the PDF is the artifact that gets sent to someone, and a
    // report headed "Cash-secured puts" that lists every other strategy
    // underneath is not the report that was asked for. With one strategy
    // selected there is also nothing to compare it against.
    const rows =
      strategy !== "all"
        ? []
        : [{ label: "All strategies", trades }]
            .concat(
              STRATEGIES.map((s) => ({
                label: s.label,
                trades: trades.filter((t) => strategyOf(t) === s.key)
              })).filter((r) => r.trades.length > 0)
            )
            .map((r) => ({
              label: r.label,
              stats: computeStats(r.trades, r.label === "All strategies" ? equity : 0)
            }))
            .filter((r) => r.stats);
    return {
      stats: s,
      comparison: rows,
      subset,
      provisionalCount: subset.filter((t) => t.provisional).length
    };
  }, [trades, strategy, equity]);

  // The shares still held, and what the two views report.
  //
  // The book is NOT filtered by strategy or date: an open position is held
  // today whatever window is being read, and hiding it under a date filter
  // would recreate the defect this was built to fix.
  const book = useMemo(() => openBook(data?.stockLots, broker), [data, broker]);
  const premiumFigure = useMemo(() => premiumOnly(subset), [subset]);
  // The bridge between the two realized numbers on this page. Premium only is
  // -$1,686 while StatCards says Realized P/L -$1,244; the $442 difference is
  // the share result of lots already SOLD, and nothing on screen explained it.
  // Invisible on a book that has sold nothing, and it appears the moment one
  // wheel lot is closed.
  const soldSharesFigure = useMemo(() => realizedShares(subset), [subset]);
  // Realized (option legs AND shares already sold) plus the mark on what is
  // still held. Null -- never a substitute number -- when any lot is unpriced.
  //
  // AND ONLY WHEN THE TWO HALVES ANSWER THE SAME QUESTION. `stats.totalPL` is
  // filtered by the strategy tab and the date range; the book deliberately is
  // not, because an open position is held today whatever window is being read.
  // Adding an all-time figure to a windowed one produces a number that answers
  // nothing: on the covered-call tab it was reporting -$2,221 of covered-call
  // realized plus the mark on the entire equity book. The panel below stays
  // visible and unfiltered -- it is the ADDITION that is withheld, the same
  // discipline return on equity already applies under a strategy filter.
  const scoped = strategy === "all" && !range.from && !range.to;
  const wholeFigure =
    stats && scoped && book.unrealized !== null ? stats.totalPL + book.unrealized : null;
  const wholeUnknown = !stats || !scoped || (book.lots > 0 && book.unrealized === null);
  const wholeWithheldBecause = !scoped
    ? "filtered"
    : book.lots > 0 && book.unrealized === null
      ? "unpriced"
      : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Crunching performance…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link to={`/account/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to account
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">
            {data?.account ? `${data.account.name} — Analysis` : "Analysis"}
          </h1>
          {stats && (
            <p className="text-xs text-slate-500 mt-0.5">
              {stats.firstDate} → {stats.lastDate} · account equity {equity ? `$${equity.toLocaleString()}` : "unavailable"}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {syncing && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Updating from your broker…
            </span>
          )}
          <Link
            to={`/account/${id}/history`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
          >
            View trade history
          </Link>
          {stats && (
            <ExportPdfButton
              targetRef={reportRef}
              title={data?.account ? `${data.account.name} — Performance Analysis` : "Performance Analysis"}
              subtitle={`${stats.firstDate} → ${stats.lastDate}${range.from || range.to ? " (filtered)" : ""} · ${strategy === "all" ? "All strategies" : strategyLabel(strategy)} · ${view === "whole" ? "Whole view (options + shares)" : "Premium only (option legs)"} · equity ${equity ? `$${equity.toLocaleString()}` : "n/a"} · generated ${new Date().toLocaleString()}`}
              isPaper={!!data?.account?.is_paper}
            />
          )}
        </div>
      </div>

      <DateRangeFilter from={range.from} to={range.to} bounds={bounds} onChange={setRange} />

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm text-rose-700">{error}</div>
      ) : !stats ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <BarChart3 className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm max-w-sm">No closed trades to analyze yet.</p>
        </div>
      ) : (
        <>
          <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />
          <div ref={reportRef} className="space-y-5 bg-white">
            {/* Inside reportRef so it is captured in the export as well. A
                simulated account must not produce a document that reads like
                a record of real money. */}
            {data?.account?.is_paper && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
                Paper account &mdash; every figure below is simulated, not real money.
              </div>
            )}
            {/* The switch, and the book it governs. Both sit INSIDE reportRef:
                an export has to say which view produced it, or two PDFs of the
                same week disagree with nothing on either to explain why. */}
            {book.lots > 0 && (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <ViewSwitch
                  value={view}
                  onChange={setView}
                  whole={wholeFigure}
                  premium={premiumFigure}
                  wholeUnknown={wholeUnknown}
                />
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                  {/* The switch changes the HEADLINE and nothing else. Without
                      this line it reads like a global control while every
                      statistic below it stays realized-only whichever way it
                      is flipped. */}
                  <span className="block text-slate-400 mb-1">
                    Changes the headline only — the statistics below are realized.
                  </span>
                  {view === "whole" ? (
                    <>
                      <strong>Whole view</strong> — realized money plus the current mark on shares
                      still held. Answers “how is the strategy doing?”
                    </>
                  ) : (
                    <>
                      {/* The clause "and is the view to use against a 1099-B"
                          stood here and is deleted, not softened. Premium only
                          EXCLUDES share sales, which are the largest lines on a
                          wheel trader's 1099-B, and on an assigned put the
                          premium is not option income at all -- it reduces the
                          stock basis. It also contradicted the tax paragraph
                          200 pixels below, which already tells the reader to
                          reconcile against the broker's own 1099-B. One screen
                          must not carry two instructions about a tax filing. */}
                      <strong>Premium only</strong> — the option legs alone. Answers “what have I
                      actually banked from selling options?”
                      {Math.abs(soldSharesFigure) >= 0.005 && (
                        <>
                          {" "}Shares already sold added{" "}
                          <strong>{soldSharesFigure >= 0 ? "+" : ""}${Math.abs(soldSharesFigure).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{" "}
                          on top of this, which is why Realized P/L below differs.
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            )}
            {book.lots > 0 && <OpenBookPanel book={book} priced={view === "whole"} />}
            {comparison.length > 1 && <StrategyComparison rows={comparison} />}
            <StatCards stats={stats} />
            <CaptureBreakdown trades={subset} />
            <EquityCurveChart curve={stats.curve} />
            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownTable title="By month" keyLabel="Month" keyField="month" rows={stats.byMonth} />
              <BreakdownTable title="By ticker" keyLabel="Ticker" keyField="ticker" rows={stats.byTicker} />
            </div>

            {/* Inside reportRef on purpose. The site-wide disclaimer sits in
                Layout, outside the captured element, so the exported PDF left
                here carrying an account name, a date range and a table of
                monthly realized P/L — a document shaped exactly like a tax
                schedule, saying nothing about what it is. This is the page a
                user forwards to their accountant in March. */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">DeltaMint — economic performance report. Not a tax document.</span>{" "}
              Figures cover only positions an option opened or closed and exclude the rest of this
              account. Realized P/L here is not taxable gain or loss: wash sales, straddle rules,
              Section 1256 treatment and cost-basis adjustments on assignment are not applied.
              {provisionalCount > 0 && (
                <> {provisionalCount} position{provisionalCount === 1 ? "" : "s"} closed by assignment
                {provisionalCount === 1 ? " still has" : " still have"} shares held, so
                {provisionalCount === 1 ? " its result is" : " their results are"} not final. Anything
                that calls a trade a win or a loss &mdash; win rate, profit factor, expectancy, payoff,
                average and largest win and loss, per-trade return, the streaks, and the win-rate
                columns in the tables above &mdash; is measured without
                {provisionalCount === 1 ? " it" : " them"}. Anything that measures money booked &mdash;
                the totals, the equity curve, drawdown, and the per-day and per-month figures &mdash;
                counts {provisionalCount === 1 ? "it" : "them"} in full.</>
              )}{" "}
              Reconcile against your broker&rsquo;s Form 1099-B before using any figure for a return.
            </div>
          </div>
        </>
      )}
    </div>
  );
}