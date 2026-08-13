import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RefreshCw, ArrowLeft } from "lucide-react";
import AccountSection from "@/components/dashboard/AccountSection";
import CloseDialog from "@/components/close/CloseDialog";

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [closing, setClosing] = useState(null);

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
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Master dashboard
          </Link>
          <h1 className="text-xl font-semibold text-white tracking-tight mt-1">
            {account ? account.name : "Account not found"}
          </h1>
          {syncedAt && (
            <p className="text-xs text-slate-500 mt-0.5">Last synced {new Date(syncedAt).toLocaleTimeString()}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-emerald-500" />
            Auto-refresh (60s)
          </label>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {account ? (
        <AccountSection account={account} onCloseSpread={(acc, spread) => setClosing({ account: acc, spread })} />
      ) : (
        <div className="bg-[#111725] border border-white/[0.06] rounded-xl p-12 text-center text-sm text-slate-400">
          This account no longer exists.{" "}
          <Link to="/accounts" className="text-emerald-300 hover:underline">Manage accounts</Link>
        </div>
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