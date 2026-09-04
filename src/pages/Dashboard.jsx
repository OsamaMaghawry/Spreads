import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, KeyRound } from "lucide-react";
import MasterSummary from "@/components/dashboard/MasterSummary";
import AccountSummaryCard from "@/components/dashboard/AccountSummaryCard";
import useLiveSync from "@/lib/useLiveSync";
import StaleDataNotice from "@/components/common/StaleDataNotice";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staleReason, setStaleReason] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await invokeFunction("syncAccounts", {});
      // A good view is never replaced by an empty one.
      //
      // This used to be `setData(res.data)` unconditionally, so any refresh
      // that came back without accounts -- a cold start, a dropped connection,
      // a 500 from the broker -- wrote undefined over a working dashboard and
      // rendered "No trading accounts yet. Link a brokerage account" on top of
      // accounts that were connected the entire time. It cleared on the next
      // successful poll, which is exactly why it looked like a flicker.
      if (Array.isArray(res?.data?.accounts)) {
        setData(res.data);
        setStaleReason(null);
      } else {
        setStaleReason(res?.data?.error || "The last refresh did not come back");
      }
    } catch (e) {
      setStaleReason(e?.message || "The last refresh did not come back");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refreshes continuously in the background rather than on an advertised
  // sixty-second timer. See lib/useLiveSync.js.
  const { refreshing, refresh } = useLiveSync(load);

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
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <StaleDataNotice message={staleReason} since={data?.syncedAt} />

      {accounts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <KeyRound className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm max-w-sm">No trading accounts yet. Link a brokerage account to start monitoring positions.</p>
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