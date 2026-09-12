import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, loadAccount } from "../_shared/alpaca.ts";
import { awaitUpTo } from "../_shared/background.ts";
import { reconstruct } from "../_shared/tradeReconstruction.ts";
import { isAdminUser } from "../_shared/admin.ts";

// Closed trade history, rebuilt from the broker's activity feed.
//
// Everything here is I/O: pull activities, hand them to the pure
// reconstruction in _shared/tradeReconstruction.ts, write the results back.
//
// It syncs itself. There used to be a `sync` flag and a `rebuild` flag, which
// meant the page carried two buttons and the analysis page a third, while the
// dashboard had been refreshing itself every sixty seconds all along. Trade
// history was the only screen that made fetching the user's job, and it did it
// three ways. Now a call serves what is stored and refreshes first when that is
// stale — the reader decides nothing.
//
// `rebuild` is gone rather than automated: a sync already recomputes every
// record from the whole feed and reconciles what it finds, so "rebuild" was a
// second name for what a sync does. The part worth keeping — a snapshot before
// rows are deleted — now happens whenever rows would be deleted.

const STALE_AFTER_MS = 15 * 60 * 1000;

// Long enough for a normal sync to finish and return fresh data; short enough
// that a slow one does not hold the page. Whatever is still running past it
// keeps running (see awaitUpTo) rather than being killed mid-write.
const WAIT_FOR_SYNC_MS = 8000;

import {
  fetchTrades,
  fetchStockLots,
  snapshot,
  listSnapshots,
  readSnapshot,
  fetchBrokerData,
  writeResults
} from "../_shared/tradeSync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, preview = false, includeRaw = false, snapshots = false, snapshotId = null } =
      await req.json();
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const base = tradingBase(account);

    const accountInfo = { id: account.id, name: account.name, is_paper: account.is_paper };

    // What a sync destroyed, before it destroyed it. Admin-only on the server,
    // not merely in the interface: these payloads are the operator's copy of
    // rows a person has already been shown, and nothing in the product needs
    // to read them.
    //
    // Reading is all this does. Writing rows back in place is deliberately not
    // offered here: the next sync recomputes the whole account from the broker
    // feed and would overwrite a restore within the quarter hour, so a restore
    // button would promise something it cannot keep. The procedure that does
    // work -- pull the payload, stop the account syncing, put the rows back --
    // is written down in docs/runbooks/restore-history.md.
    if (snapshots || snapshotId) {
      const { isAdmin } = await isAdminUser(user, admin);
      if (!isAdmin) return jsonResponse({ error: "Not permitted" }, 403);
      if (snapshotId) {
        const found = await readSnapshot(admin, accountId, snapshotId);
        if (!found) return jsonResponse({ error: "Snapshot not found" }, 404);
        return jsonResponse({ account: accountInfo, snapshot: found });
      }
      return jsonResponse({ account: accountInfo, snapshots: await listSnapshots(admin, accountId) });
    }

    // Audit mode: compute everything, write nothing, and hand back the broker's
    // own activities beside what this code made of them. Admin-only in the UI —
    // it is the tool that found these defects, not a control a reader needs.
    if (preview) {
      const { orderStrategy, activities, settlementFeed } = await fetchBrokerData(account, base);
      const { records, stockLots, orphanedStockPL, settlementChecks, breaches } =
        reconstruct(activities, orderStrategy, accountId);
      const stored = await fetchTrades(admin, accountId, false);
      const storedByKey: any = {};
      stored.forEach((r: any) => { storedByKey[r.trade_key] = r; });
      const proposedKeys = new Set(records.map((r: any) => r.trade_key));
      const sum = (rows: any[], field = "realized_pl") =>
        rows.reduce((a: number, r: any) => a + (Number(r[field]) || 0), 0);

      return jsonResponse({
        account: accountInfo,
        preview: true,
        proposed: { records, stockLots },
        diff: {
          created: records.filter((r: any) => !storedByKey[r.trade_key]),
          removed: stored.filter((r: any) => !proposedKeys.has(r.trade_key)),
          changed: records
            .map((r: any) => ({ before: storedByKey[r.trade_key], after: r }))
            .filter((p: any) => p.before && Number(p.before.realized_pl) !== Number(p.after.realized_pl))
        },
        totals: {
          storedTotal: sum(stored),
          proposedPremium: sum(records, "premium_pl"),
          proposedEarlyClose: sum(records, "early_close_pl"),
          proposedStock: sum(records, "stock_pl"),
          proposedTotal: sum(records),
          // Non-zero means an option that produced shares was not itself
          // reconstructed. A defect to look at, not a figure to display.
          orphanedStockPL,
          // Records whose result is beyond what the position could lose. A
          // sync refuses to store these; the audit shows them so the defect
          // can be found rather than only blocked.
          breaches,
          // Cash settlements the broker reported, beside what the positions
          // say they must have paid. Anything other than "agrees" wants a
          // person: Alpaca's paper index settlement has a reported defect
          // crediting out-of-the-money shorts instead of expiring them.
          settlementChecks,
          settlementsDisagreeing: (settlementChecks || []).filter((c) => c.status !== "agrees").length,
          // "unavailable" means the broker refused the settlement feed, so an
          // empty check list is silence rather than agreement.
          settlementFeed,
          sharesStillHeld: stockLots.filter((l: any) => !l.disposed_date).length
        },
        activities: includeRaw ? activities : undefined,
        activityCount: activities.length
      });
    }

    const syncedAt = account.trades_synced_at ? Date.parse(account.trades_synced_at) : 0;
    const attemptedAt = account.trades_sync_attempted_at
      ? Date.parse(account.trades_sync_attempted_at)
      : 0;

    // `trades_synced_at` is written only on success, so a failing sync used to
    // leave it null and every single page load re-ran the whole broker sweep --
    // about 112 requests -- forever, silently. Backing off on the *attempt*
    // means a broken sync costs one sweep per interval instead of one per view.
    const dueForRetry = Date.now() - attemptedAt > STALE_AFTER_MS;
    const stale = (!syncedAt || Date.now() - syncedAt > STALE_AFTER_MS) && dueForRetry;

    let syncError: string | null = account.trades_sync_error || null;

    if (stale) {
      await admin
        .from("trading_accounts")
        .update({ trades_sync_attempted_at: new Date().toISOString() })
        .eq("id", accountId);

      const work = (async () => {
        const { orderStrategy, activities } = await fetchBrokerData(account, base);
        const { records, stockLots, breaches } = reconstruct(activities, orderStrategy, accountId);
        return writeResults(admin, accountId, user.id, records, stockLots, breaches, orphanedStockPL);
      })().catch(async (err) => {
        // The failure has to land somewhere a person can see. Previously it was
        // caught by inBackground's `work.catch(() => {})`, so a sync that wrote
        // nothing still answered 200 and said "up to date".
        syncError = err.message;
        console.error(`tradeHistory sync failed for ${accountId}: ${err.message}`);
        await admin
          .from("trading_accounts")
          .update({ trades_sync_error: err.message })
          .eq("id", accountId)
          .then(() => {}, () => {});
        return null;
      });

      // Wait for it, but only for a while. Registering the work first means a
      // timeout stops us blocking rather than abandoning a half-written sync.
      await awaitUpTo(work, WAIT_FOR_SYNC_MS);
    }

    const [trades, stockLots, { data: fresh }] = await Promise.all([
      fetchTrades(admin, accountId),
      fetchStockLots(admin, accountId),
      admin
        .from("trading_accounts")
        .select("trades_synced_at, trades_sync_error")
        .eq("id", accountId)
        .maybeSingle()
    ]);

    const finishedAt = fresh?.trades_synced_at || account.trades_synced_at || null;
    const failed = syncError || fresh?.trades_sync_error || null;
    return jsonResponse({
      account: accountInfo,
      trades,
      stockLots,
      syncedAt: finishedAt,
      // Why the figures below may be older than they should be. Null once a
      // sync succeeds; the page says so rather than implying it is current.
      syncError: failed,
      // True when the refresh outran the wait: the numbers below are the
      // previous ones, and the page should come back for the new set. A failed
      // sync is not "still running" -- coming back would only fail again.
      syncing: stale && !failed && (!finishedAt || Date.parse(finishedAt) <= syncedAt)
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
