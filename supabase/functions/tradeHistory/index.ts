import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";
import { awaitUpTo } from "../_shared/background.ts";
import { reconstruct } from "../_shared/tradeReconstruction.ts";
import { refuseMassDelete, lotFromOption } from "../_shared/writeGuards.ts";
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

async function fetchTrades(admin, accountId, ordered = true) {
  let query = admin.from("trade_records").select("*").eq("account_id", accountId);
  if (ordered) query = query.order("close_date", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchStockLots(admin, accountId) {
  const { data, error } = await admin
    .from("stock_lots")
    .select("*")
    .eq("account_id", accountId)
    .order("acquired_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Everything the write is about to destroy, copied out first, as one row.
//
// This used to insert into `trade_records_backup`, a table created with `like
// trade_records` before the P/L component columns existed -- so the insert
// failed with 42703 on every attempt and the table has never held a row. It
// now writes jsonb, which cannot go stale when a column is added, and it
// covers updates as well as deletes: rewriting a row's figures in place
// destroys the old ones exactly as thoroughly as removing the row.
//
// Throwing here stops the write. That is the point: no snapshot, no deletion.
async function snapshot(
  admin,
  accountId,
  userId,
  reason,
  { deleted, updatedBefore, deletedLots, updatedLotsBefore = [] }
) {
  if (
    deleted.length === 0 &&
    updatedBefore.length === 0 &&
    deletedLots.length === 0 &&
    updatedLotsBefore.length === 0
  ) {
    return;
  }
  const { error } = await admin.from("history_snapshots").insert({
    account_id: accountId,
    user_id: userId,
    reason,
    deleted_trades: deleted,
    updated_trades_before: updatedBefore,
    deleted_lots: deletedLots,
    // Share lots are upserted in place on (account_id, lot_key), so a lot
    // keeps its key while its basis, disposal price and result are replaced.
    // Without this the one case that leaves no trace at all was the one the
    // snapshot did not cover.
    updated_lots_before: updatedLotsBefore
  });
  if (error) throw new Error(`Snapshot failed, nothing written: ${error.message}`);
}


// The snapshots taken before writes, listed newest first.
//
// The table had one insert and no readers: rows were being copied out before
// every destructive sync and nothing could ever look at them, which is a
// backup only in the sense that the data is somewhere. Listing is metadata
// only -- how many rows a snapshot holds, not the rows -- so an operator can
// find the one they want before pulling it.
async function listSnapshots(admin, accountId) {
  const { data, error } = await admin
    .from("history_snapshots")
    .select("id, taken_at, reason, deleted_trades, updated_trades_before, deleted_lots, updated_lots_before")
    .eq("account_id", accountId)
    .order("taken_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data || []).map((s: any) => ({
    id: s.id,
    taken_at: s.taken_at,
    reason: s.reason,
    deletedTrades: (s.deleted_trades || []).length,
    updatedTrades: (s.updated_trades_before || []).length,
    deletedLots: (s.deleted_lots || []).length,
    updatedLots: (s.updated_lots_before || []).length
  }));
}

// One snapshot in full, for download. Scoped to the account the caller already
// proved they own.
async function readSnapshot(admin, accountId, snapshotId) {
  const { data, error } = await admin
    .from("history_snapshots")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", snapshotId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data;
}

// The broker feed, in full. Two loops, both bounded, both stopping early on a
// short page.
async function fetchBrokerData(account, base) {
  const spreadsPrefix = (account.spreads_client_prefix || "").trim();
  const wheelPrefix = (account.wheel_client_prefix || "").trim();

  // Closed orders exist here for one reason: reading a strategy prefix off
  // client_order_id. With no prefix configured every order resolves to
  // "unknown", so the twelve pages buy nothing and are skipped — a third of the
  // requests this function makes, for an answer already known.
  const orderStrategy: Record<string, string> = {};
  if (spreadsPrefix || wheelPrefix) {
    const strategyOf = (clientOrderId) => {
      const c = clientOrderId || "";
      if (spreadsPrefix && c.startsWith(spreadsPrefix)) return "spreads";
      if (wheelPrefix && c.startsWith(wheelPrefix)) return "wheel";
      return "unknown";
    };
    let until = null;
    for (let i = 0; i < 12; i++) {
      const url = `${base}/orders?status=closed&limit=500&direction=desc&nested=true` +
        (until ? `&until=${encodeURIComponent(until)}` : "");
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      page.forEach((o: any) => {
        const strat = strategyOf(o.client_order_id);
        orderStrategy[o.id] = strat;
        (o.legs || []).forEach((l: any) => { orderStrategy[l.id] = strat; });
      });
      until = page[page.length - 1].submitted_at;
      if (page.length < 500) break;
    }
  }

  // Activities, newest first. The cap used to be 20 pages, and an account with
  // years of ordinary investing exhausted it long before reaching the option
  // history — so purchases fell off the end, their sales could not find the
  // lots they belonged to, and shares sold years ago were reported as still
  // held. The feed is read to its end now; the staleness gate is what keeps
  // that from being expensive.
  let activities: any[] = [];
  let pageToken = null;
  for (let i = 0; i < 100; i++) {
    const url = `${base}/account/activities?activity_types=FILL,OPEXP,OPASN,OPEXC&direction=desc&page_size=100` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
    const page = await alpacaFetch(url, account);
    if (!Array.isArray(page) || page.length === 0) break;
    activities = activities.concat(page);
    if (page.length < 100) break;
    pageToken = page[page.length - 1].id;
  }

  // Cash settlements, fetched separately and allowed to fail.
  //
  // OPCSH is what an index option pays instead of delivering shares, and the
  // reconciliation that compares it against what the position says it must
  // have paid is worth having: Alpaca's paper index settlement has a reported
  // defect crediting out-of-the-money shorts. But this is the only activity
  // type here whose name could not be checked against documentation from this
  // environment, and a type the API rejects would take the whole activity
  // request down with it -- every account's history, for a comparison that is
  // an audit aid. So it travels in its own request, and a failure costs the
  // comparison and nothing else.
  let settlementFeed = "ok";
  try {
    let token = null;
    for (let i = 0; i < 20; i++) {
      const url = `${base}/account/activities?activity_types=OPCSH&direction=desc&page_size=100` +
        (token ? `&page_token=${encodeURIComponent(token)}` : "");
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      // By id, so that adding OPCSH to the main request one day cannot double
      // every settlement silently. Cheap here, invisible if it ever matters.
      const already = new Set(activities.map((a: any) => a.id));
      activities = activities.concat(page.filter((a: any) => !already.has(a.id)));
      if (page.length < 100) break;
      token = page[page.length - 1].id;
    }
  } catch {
    // Recorded, not raised: the caller says so rather than showing an audit
    // that silently had nothing to check.
    settlementFeed = "unavailable";
  }

  return { orderStrategy, activities, settlementFeed };
}

// Reconcile what the broker says against what is stored. The reconstruction is
// deterministic over the whole feed, so the fresh set is authoritative.
async function writeResults(admin, accountId, userId, records, stockLots) {
  const existing = await fetchTrades(admin, accountId, false);
  const existingByKey: any = {};
  existing.forEach((r: any) => { existingByKey[r.trade_key] = r; });
  const freshKeys = new Set(records.map((r: any) => r.trade_key));
  const oldestClose = records.reduce(
    (m: string, r: any) => (r.close_date && r.close_date < m ? r.close_date : m),
    "9999-99-99"
  );

  const toCreate = records.filter((r: any) => !existingByKey[r.trade_key]);
  const toUpdate = records
    .filter((r: any) => {
      const e = existingByKey[r.trade_key];
      // Each component, not only the total: a row whose premium and share
      // results moved in opposite directions has the same total and is still a
      // different row.
      return e && (
        e.qty !== r.qty ||
        e.strategy !== r.strategy ||
        e.realized_pl !== r.realized_pl ||
        Number(e.premium_pl) !== r.premium_pl ||
        Number(e.early_close_pl) !== r.early_close_pl ||
        Number(e.stock_pl) !== r.stock_pl ||
        e.close_reason !== r.close_reason ||
        e.unpaired !== r.unpaired ||
        // A row that stops being provisional has changed, even when every
        // figure on it is identical: its shares were disposed of and its
        // result is final now.
        !!e.provisional !== !!r.provisional ||
        e.chain_id !== r.chain_id
      );
    })
    .map((r: any) => ({ id: existingByKey[r.trade_key].id, ...r }));

  // Stale inside the window just recomputed: mis-paired rows, and rows whose
  // identity changed because their strategy did.
  const stale = existing.filter(
    (r: any) => !freshKeys.has(r.trade_key) && (r.close_date || "") >= oldestClose
  );

  // Share lots the reconstruction is entitled to remove: option-touched only,
  // and only those it no longer derives.
  const existingLots = await fetchStockLots(admin, accountId);
  const freshLotKeys = new Set(stockLots.map((l: any) => l.lot_key));
  const optionLots = existingLots.filter(lotFromOption);
  const staleLots = optionLots.filter((l: any) => !freshLotKeys.has(l.lot_key));

  // Both refusals are checked before anything is written, so a sync that trips
  // either one leaves the account exactly as it found it.
  const refusal =
    refuseMassDelete("trade records", stale.length, existing.length) ||
    refuseMassDelete("share lots", staleLots.length, optionLots.length);
  if (refusal) throw new Error(refusal);

  const freshLotByKey: any = {};
  stockLots.forEach((l: any) => { freshLotByKey[l.lot_key] = l; });
  const changedFields = (before: any, after: any) =>
    ["qty", "acquired_date", "acquired_price", "acquired_source",
     "disposed_date", "disposed_price", "disposed_source", "realized_pl"]
      .some((f) => String(before[f] ?? "") !== String(after[f] ?? ""));
  const updatedLotsBefore = existingLots.filter(
    (l: any) => freshLotByKey[l.lot_key] && changedFields(l, freshLotByKey[l.lot_key])
  );

  await snapshot(admin, accountId, userId, "sync", {
    deleted: stale,
    updatedBefore: toUpdate.map((r: any) => existingByKey[r.trade_key]),
    deletedLots: staleLots,
    updatedLotsBefore
  });

  for (const r of stale) {
    const { error } = await admin.from("trade_records").delete().eq("id", (r as any).id);
    if (error) throw new Error(error.message);
  }
  if (toCreate.length > 0) {
    const { error } = await admin
      .from("trade_records")
      .insert(toCreate.map((r: any) => ({ ...r, user_id: userId })));
    if (error) throw new Error(error.message);
  }
  for (const r of toUpdate) {
    const { id, ...fields } = r as any;
    const { error } = await admin.from("trade_records").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  }

  for (const l of staleLots) {
    const { error } = await admin.from("stock_lots").delete().eq("id", (l as any).id);
    if (error) throw new Error(error.message);
  }
  if (stockLots.length > 0) {
    const { error } = await admin
      .from("stock_lots")
      .upsert(stockLots.map((l: any) => ({ ...l, user_id: userId })), {
        onConflict: "account_id,lot_key"
      });
    if (error) throw new Error(error.message);
  }

  await admin
    .from("trading_accounts")
    .update({ trades_synced_at: new Date().toISOString(), trades_sync_error: null })
    .eq("id", accountId);

  return {
    created: toCreate.length,
    updated: toUpdate.length,
    removed: stale.length,
    removedLots: staleLots.length
  };
}

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
      const { records, stockLots, orphanedStockPL, settlementChecks } =
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
        const { records, stockLots } = reconstruct(activities, orderStrategy, accountId);
        return writeResults(admin, accountId, user.id, records, stockLots);
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
