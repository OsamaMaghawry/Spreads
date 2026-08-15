import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, ArrowLeft, BarChart3 } from "lucide-react";
import { computeStats } from "@/lib/analytics";
import StatCards from "@/components/analysis/StatCards";
import EquityCurveChart from "@/components/analysis/EquityCurveChart";
import BreakdownTable from "@/components/analysis/BreakdownTable";
import StrategyComparison from "@/components/analysis/StrategyComparison";
import StrategyTabs from "@/components/history/StrategyTabs";
import ExportPdfButton from "@/components/analysis/ExportPdfButton";
import DateRangeFilter from "@/components/analysis/DateRangeFilter";

export default function AccountAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [equity, setEquity] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const reportRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [hist, sync] = await Promise.all([
        base44.functions.invoke("tradeHistory", { accountId: id }),
        base44.functions.invoke("syncAccounts", {}).catch(() => null)
      ]);
      setData(hist.data);
      const acct = sync?.data?.accounts?.find((a) => a.id === id);
      setEquity(acct?.equity || 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  const { stats, comparison } = useMemo(() => {
    const subset = strategy === "all" ? trades : trades.filter((t) => (t.strategy || "unknown") === strategy);
    const share = trades.length ? subset.length / trades.length : 0;
    const s = computeStats(subset, equity * (strategy === "all" ? 1 : share));
    const rows = [
      { label: "All strategies", trades },
      { label: "Spreads", trades: trades.filter((t) => t.strategy === "spreads") },
      { label: "Wheel", trades: trades.filter((t) => t.strategy === "wheel") }
    ]
      .map((r) => {
        const eq = equity * (trades.length ? r.trades.length / trades.length : 0);
        return { label: r.label, stats: computeStats(r.trades, r.label === "All strategies" ? equity : eq) };
      })
      .filter((r) => r.stats);
    return { stats: s, comparison: rows };
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
              subtitle={`${stats.firstDate} → ${stats.lastDate} · ${strategy === "all" ? "All strategies" : strategy} · generated ${new Date().toLocaleDateString()}`}
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
          {comparison.length > 1 && <StrategyComparison rows={comparison} />}
          <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />
          <div ref={reportRef} className="space-y-5 bg-white">
            <StatCards stats={stats} />
            <EquityCurveChart curve={stats.curve} />
            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownTable title="By month" keyLabel="Month" keyField="month" rows={stats.byMonth} />
              <BreakdownTable title="By ticker" keyLabel="Ticker" keyField="ticker" rows={stats.byTicker} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}