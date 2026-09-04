import { useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, ArrowLeft, History, BarChart3, Plus } from "lucide-react";
import AccountSection from "@/components/dashboard/AccountSection";
import CloseDialog from "@/components/close/CloseDialog";
import OpenPositionDialog from "@/components/open/OpenPositionDialog";
import useLiveSync from "@/lib/useLiveSync";
import StaleDataNotice from "@/components/common/StaleDataNotice";

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(null);
  const [opening, setOpening] = useState(false);
  const [staleReason, setStaleReason] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await invokeFunction("syncAccounts", {});
      const list = res?.data?.accounts;
      // Only a refresh that actually answered may change what is on screen.
      //
      // `|| null` used to run on every failure, so one dropped request replaced
      // a live account with "Account not found" -- the whole page emptying for
      // a second and coming back. An account is gone when the user deletes it,
      // not when a poll times out. A refresh that did not answer leaves the
      // last good view in place and says so.
      if (Array.isArray(list)) {
        const found = list.find((a) => a.id === id);
        // Present in a good response but not in the list: genuinely gone.
        setAccount(found || null);
        setSyncedAt(res.data?.syncedAt || null);
        setStaleReason(null);
      } else {
        setStaleReason(res?.data?.error || "The last refresh did not come back");
      }
    } catch (e) {
      setStaleReason(e?.message || "The last refresh did not come back");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refreshes continuously in the background rather than on an advertised
  // sixty-second timer. See lib/useLiveSync.js.
  const { refreshing, refresh } = useLiveSync(load);

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
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <StaleDataNotice message={staleReason} since={syncedAt} />

      {account ? (
        <AccountSection
          account={account}
          onCloseSpread={(acc, spread) => setClosing({ account: acc, spread })}
          onOrdersChanged={load}
        />
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