import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, ArrowLeft, History, BarChart3, FileSearch } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { sumBy, strategyOf } from "@/lib/strategies";
import TradeHistoryTable from "@/components/history/TradeHistoryTable";
import StockLotsTable from "@/components/history/StockLotsTable";
import RebuildPreview from "@/components/history/RebuildPreview";
import StrategyTabs from "@/components/history/StrategyTabs";
import useIsAdmin from "@/lib/useIsAdmin";

export default function AccountHistory() {
  const { id } = useParams();
  const { isAdmin } = useIsAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [strategy, setStrategy] = useState("all");
  const [preview, setPreview] = useState(null);

  // No sync button. The function serves what it has and refreshes itself when
  // that is stale, the same way the dashboard has always worked. When a refresh
  // outruns the server's wait it says so, and we come back for the result once
  // rather than making the reader press anything.
  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await invokeFunction("tradeHistory", { accountId: id });
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
      setPreview(null);
      return res.data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id]);

  // Reads the broker feed and reconstructs it without writing anything, so the
  // stored figures can be checked against their source.
  const runPreview = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await invokeFunction("tradeHistory", { accountId: id, preview: true });
      if (res.data?.error) throw new Error(res.data.error);
      setPreview(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  // The broker's own activity feed, unmodified, next to what this code made of
  // it. For checking the inputs rather than only the conclusion — and for
  // handing to someone else to check, without sharing API credentials.
  const exportRaw = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await invokeFunction("tradeHistory", { accountId: id, preview: true, includeRaw: true });
      if (res.data?.error) throw new Error(res.data.error);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `deltamint-activity-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    let timer = null;
    load().then((res) => {
      if (res?.syncing) timer = setTimeout(() => load(), 12000);
    });
    return () => timer && clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading trade history…</span>
      </div>
    );
  }

  const trades = data?.trades || [];
  const stockLots = data?.stockLots || [];
  const visible = strategy === "all" ? trades : trades.filter((t) => strategyOf(t) === strategy);

  // The three parts a result is made of, and the total they add up to.
  //
  // Each record's total already contains the share result attributed to it, so
  // adding the stock_lots table on top would count the shares twice — which is
  // what the old "Premium + Shares = Combined" row did the moment shares
  // started being attributed.
  const premiumPL = sumBy(trades, "premium_pl");
  const earlyClosePL = sumBy(trades, "early_close_pl");
  const stockPL = sumBy(trades, "stock_pl");
  const totalPL = premiumPL + earlyClosePL + stockPL;
  const unpairedCount = trades.filter((t) => t.unpaired).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link to={`/account/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to account
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">
            {data?.account ? `${data.account.name} — Trade History` : "Trade History"}
          </h1>
          {(refreshing || data?.syncing) ? (
            <p className="text-xs text-slate-500 mt-0.5">Updating from your broker…</p>
          ) : data?.syncedAt ? (
            <p className="text-xs text-slate-500 mt-0.5">Updated {new Date(data.syncedAt).toLocaleTimeString()}</p>
          ) : null}
        </div>
        <Link
          to={`/account/${id}/analysis`}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          <BarChart3 className="w-4 h-4" /> Analysis
        </Link>
        {/* Reading the broker's own feed beside what this code made of it. It
            is how the reconstruction defects were found and it writes nothing,
            but it is an operator's tool, not something a reader needs to
            understand — so only an admin sees it. */}
        {isAdmin && (
          <button
            onClick={runPreview}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <FileSearch className="h-4 w-4" /> {refreshing && !preview ? "Checking…" : "Audit against broker feed"}
          </button>
        )}
      </div>

      {preview && (
        <RebuildPreview
          preview={preview}
          busy={refreshing}
          onCancel={() => setPreview(null)}
          onExportRaw={exportRaw}
        />
      )}

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm text-rose-700">{error}</div>
      ) : trades.length === 0 && stockLots.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <History className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm max-w-sm">
            No closed spreads found yet. Once a spread is closed or expires, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            {[
              ["Premium", premiumPL],
              ["Early close", earlyClosePL],
              ["From assignment", stockPL],
              ["Total", totalPL]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`text-lg font-semibold tabular-nums ${
                  value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-slate-900"
                }`}>
                  {fmtMoney(value)}
                </div>
              </div>
            ))}
          </div>

          {unpairedCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {unpairedCount} leg{unpairedCount === 1 ? "" : "s"} could not be matched to a counterpart and
              {unpairedCount === 1 ? " is" : " are"} flagged below. Worth checking against your broker — these
              used to be silently booked as naked positions or dropped entirely.
            </div>
          )}

          {trades.length > 0 && (
            <>
              <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />
              <TradeHistoryTable trades={visible} />
            </>
          )}
          <StockLotsTable lots={stockLots} />
        </>
      )}
    </div>
  );
}