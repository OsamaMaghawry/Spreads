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

export default function AccountAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [equity, setEquity] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState("all");
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
    const rows = [{ label: "All strategies", trades }]
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
              subtitle={`${stats.firstDate} → ${stats.lastDate}${range.from || range.to ? " (filtered)" : ""} · ${strategy === "all" ? "All strategies" : strategyLabel(strategy)} · equity ${equity ? `$${equity.toLocaleString()}` : "n/a"} · generated ${new Date().toLocaleString()}`}
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
                {provisionalCount === 1 ? " its result is" : " their results are"} not final and
                {provisionalCount === 1 ? " is" : " are"} included in every figure above.</>
              )}{" "}
              Reconcile against your broker&rsquo;s Form 1099-B before using any figure for a return.
            </div>
          </div>
        </>
      )}
    </div>
  );
}