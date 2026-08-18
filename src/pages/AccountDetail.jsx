import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, ArrowLeft, History, BarChart3, Plus } from "lucide-react";
import AccountSection from "@/components/dashboard/AccountSection";
import CloseDialog from "@/components/close/CloseDialog";
import OpenPositionDialog from "@/components/open/OpenPositionDialog";

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [closing, setClosing] = useState(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await base44.functions.invoke("syncAccounts", {});
      setAccount((res.data?.accounts || []).find((a) => a.id === id) || null);
      setSyncedAt(res.data?.syncedAt || null);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading account…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Master dashboard
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">
            {account ? account.name : "Account not found"}
          </h1>
          {syncedAt && (
            <p className="text-xs text-slate-500 mt-0.5">Last synced {new Date(syncedAt).toLocaleTimeString()}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {account && (
            <button
              onClick={() => setOpening(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Open position
            </button>
          )}
          <Link
            to={`/account/${id}/analysis`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          >
            <BarChart3 className="w-4 h-4" /> Analysis
          </Link>
          <Link
            to={`/account/${id}/history`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          >
            <History className="w-4 h-4" /> Trade history
          </Link>
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

      {account ? (
        <AccountSection account={account} onCloseSpread={(acc, spread) => setClosing({ account: acc, spread })} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          This account no longer exists.{" "}
          <Link to="/accounts" className="text-emerald-700 hover:underline">Manage accounts</Link>
        </div>
      )}

      {opening && account && (
        <OpenPositionDialog
          account={account}
          onClose={() => setOpening(false)}
          onDone={() => { setOpening(false); load(); }}
        />
      )}

      {closing && (
        <CloseDialog
          account={closing.account}
          spread={closing.spread}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); load(); }}
        />
      )}
    </div>
  );
}