import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, ArrowLeft, History, BarChart3 } from "lucide-react";
import TradeHistoryTable from "@/components/history/TradeHistoryTable";
import StrategyTabs from "@/components/history/StrategyTabs";

export default function AccountHistory() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [strategy, setStrategy] = useState("all");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("tradeHistory", { accountId: id });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading trade history…</span>
      </div>
    );
  }

  const trades = data?.trades || [];
  const visible = strategy === "all" ? trades : trades.filter((t) => (t.strategy || "unknown") === strategy);

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
          {data?.syncedAt && (
            <p className="text-xs text-slate-500 mt-0.5">Last synced {new Date(data.syncedAt).toLocaleTimeString()}</p>
          )}
        </div>
        <Link
          to={`/account/${id}/analysis`}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          <BarChart3 className="w-4 h-4" /> Analysis
        </Link>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Sync from Alpaca
        </button>
      </div>

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm text-rose-700">{error}</div>
      ) : trades.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <History className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm max-w-sm">
            No closed spreads found yet. Once a spread is closed or expires, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />
          <TradeHistoryTable trades={visible} />
        </>
      )}
    </div>
  );
}