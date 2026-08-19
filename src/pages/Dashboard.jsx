import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, KeyRound } from "lucide-react";
import MasterSummary from "@/components/dashboard/MasterSummary";
import AccountSummaryCard from "@/components/dashboard/AccountSummaryCard";
import BackupButton from "@/components/BackupButton";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await invokeFunction("syncAccounts", {});
      setData(res.data);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Syncing accounts…</span>
      </div>
    );
  }

  const accounts = data?.accounts || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Positions Monitor</h1>
          {data?.syncedAt && (
            <p className="text-xs text-slate-500 mt-0.5">Last synced {new Date(data.syncedAt).toLocaleTimeString()}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <BackupButton />
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-emerald-500" />
            Auto-refresh (60s)
          </label>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <KeyRound className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm max-w-sm">No trading accounts yet. Add your Alpaca API keys to start monitoring positions.</p>
          <Link to="/accounts" className="mt-1 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors">
            Add an account
          </Link>
        </div>
      ) : (
        <>
          <MasterSummary accounts={accounts} />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider pt-1">Per-account summary</h2>
          <div className="space-y-4">
            {accounts.map((a) => (
              <AccountSummaryCard key={a.id} account={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}