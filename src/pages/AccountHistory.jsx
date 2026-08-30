import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, ArrowLeft, History, BarChart3, FileSearch, Archive } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { sumBy, strategyOf } from "@/lib/strategies";
import TradeHistoryTable from "@/components/history/TradeHistoryTable";
import StockLotsTable from "@/components/history/StockLotsTable";
import RebuildPreview from "@/components/history/RebuildPreview";
import StrategyTabs from "@/components/history/StrategyTabs";
import useIsAdmin from "@/lib/useIsAdmin";
import { isAdjustedTrade } from "@/lib/occ";

export default function AccountHistory() {
  const { id } = useParams();
  const { isAdmin } = useIsAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [strategy, setStrategy] = useState("all");
  const [preview, setPreview] = useState(null);
  const [snapshots, setSnapshots] = useState(null);

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

  // What a sync destroyed before it destroyed it. The rows were being copied
  // out before every destructive write and nothing could read them back, which
  // is a backup only in the sense that the data is somewhere.
  const loadSnapshots = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await invokeFunction("tradeHistory", { accountId: id, snapshots: true });
      if (res.data?.error) throw new Error(res.data.error);
      setSnapshots(res.data.snapshots || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  const downloadSnapshot = useCallback(async (snapshotId) => {
    setError(null);
    try {
      const res = await invokeFunction("tradeHistory", { accountId: id, snapshotId });
      if (res.data?.error) throw new Error(res.data.error);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(res.data.snapshot, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `deltamint-snapshot-${snapshotId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
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
  // The total comes from realized_pl, not from adding the three parts.
  //
  // Rows written before the components existed carry null in all three, and
  // sumBy reads null as zero — so the header showed Total $0.00 above a table
  // whose own footer said −$992.00. The parts still sum to the whole on every
  // row the current code wrote; the header must not claim otherwise for rows
  // it did not.
  const totalPL = sumBy(trades, "realized_pl");
  const componentsMissing = trades.some((t) => t.premium_pl === null || t.premium_pl === undefined);
  const unpairedCount = trades.filter((t) => t.unpaired).length;
  const provisionalCount = trades.filter((t) => t.provisional).length;
  const adjustedCount = trades.filter(isAdjustedTrade).length;

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
          {/* A failed refresh outranks the timestamp: saying "Updated 14:03"
              under figures the failed sync never touched is the specific way
              this screen used to mislead. */}
          {(refreshing || data?.syncing) ? (
            <p className="text-xs text-slate-500 mt-0.5">Updating from your broker…</p>
          ) : data?.syncError ? (
            <p className="text-xs text-amber-700 mt-0.5">
              Could not refresh from your broker
              {data?.syncedAt ? ` — showing figures from ${new Date(data.syncedAt).toLocaleString()}` : " — nothing has been recorded yet"}
            </p>
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
        {isAdmin && (
          <button
            onClick={loadSnapshots}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Archive className="h-4 w-4" /> Snapshots
          </button>
        )}
      </div>

      {snapshots && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold text-slate-900">Before each sync</span>
            <button onClick={() => setSnapshots(null)} className="ml-auto text-slate-400 hover:text-slate-700">
              Close
            </button>
          </div>
          {snapshots.length === 0 ? (
            <p className="mt-2">
              No sync has removed or rewritten a stored row on this account.
            </p>
          ) : (
            <>
              <p className="mt-2">
                Rows as they stood immediately before a sync changed them. Putting them back is a
                procedure, not a button: the next sync recomputes the account and would overwrite a
                restore within the quarter hour. See docs/runbooks/restore-history.md.
              </p>
              <ul className="mt-2 space-y-1">
                {snapshots.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
                    <span className="text-slate-900">{new Date(s.taken_at).toLocaleString()}</span>
                    <span className="text-slate-500">{s.reason}</span>
                    <span>
                      {s.deletedTrades} removed · {s.updatedTrades} rewritten ·{" "}
                      {s.deletedLots + (s.updatedLots || 0)} lots
                    </span>
                    <button
                      onClick={() => downloadSnapshot(s.id)}
                      className="text-slate-500 underline hover:text-slate-900"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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

          {data?.account?.is_paper && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
              Paper account &mdash; every figure below is simulated, not real money.
            </div>
          )}

          {/* What these figures are, said where the figures are. The terms of
              service say the product gives no tax advice, but that page is not
              reachable from this one, and "Realized P/L" is a term of art a
              reader will carry straight to their return. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            These figures are an economic record of what your strategies produced. They are not a tax
            record and will not match your broker&rsquo;s 1099-B. Premium on an assigned position is shown
            on the assignment date; for tax it adjusts the basis or proceeds of the shares instead. Wash
            sales, straddle and offsetting-position rules, and holding-period adjustments are not
            calculated. Only positions an option opened or closed appear here. Your broker&rsquo;s records
            govern.
          </div>

          {provisionalCount > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              {provisionalCount} position{provisionalCount === 1 ? "" : "s"} closed by assignment
              {provisionalCount === 1 ? " still has" : " still have"} shares held, and
              {provisionalCount === 1 ? " its result" : " their results"} will change when those shares are
              sold &mdash; under the close date shown, not the date of the sale. Marked
              &ldquo;not final&rdquo; below and included in the totals above.
            </div>
          )}

          {adjustedCount > 0 && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              {adjustedCount} position{adjustedCount === 1 ? "" : "s"} use an adjusted contract, written before a
              corporate action changed what it delivers. Its figures here are worked out as 100 shares at the
              strike, which is no longer what it settles into &mdash; check {adjustedCount === 1 ? "it" : "them"} against
              your broker. Shares from {adjustedCount === 1 ? "it" : "them"} are listed under the adjusted symbol
              rather than the plain ticker, so they stay separate from your ordinary holdings in that stock.
            </div>
          )}

          {componentsMissing && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              Some rows predate the premium / early-close / assignment split, so those three figures cover
              only part of the book. The total is taken from each row&rsquo;s own result instead, so it
              covers every row shown here &mdash; which is not the same as covering every trade in the
              account, and neither figure is a substitute for your broker&rsquo;s records.
            </div>
          )}

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