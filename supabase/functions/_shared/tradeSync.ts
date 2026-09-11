// The trade-history sync, as a module rather than a page handler.
//
// MOVED VERBATIM from tradeHistory/index.ts. Not one line of the bodies below
// changed; only `async function` became `export async function` so a second
// caller can reach them.
//
// WHY IT MOVED. The owner, 11 Sep: *"Everything should be synced automatically
// whether the user opened the account or not. It's a trading account. It should
// be always updated as long as it is connected."* He is right, and the reason
// it was not is structural rather than a decision anybody made: every line that
// knows how to pull the broker feed and rebuild closed trades lived inside the
// function that serves the Trade History page, so the only thing that could
// ever trigger a sync was a person opening that page. A scheduled job had
// nothing to call.
//
// Now `tradeHistory` (a person looking) and `syncTrades` (the cron) are two
// callers of one implementation. The alternative was to give `tradeHistory` a
// second authentication path for the scheduler, which is a wider change to the
// money path than moving code that does not change.

import { alpacaFetch } from "./alpaca.ts";
import { refuseMassDelete, lotFromOption } from "./writeGuards.ts";

export async function fetchTrades(admin, accountId, ordered = true) {
  let query = admin.from("trade_records").select("*").eq("account_id", accountId);
  if (ordered) query = query.order("close_date", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchStockLots(admin, accountId) {
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
export async function snapshot(
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
export async function listSnapshots(admin, accountId) {
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
export async function readSnapshot(admin, accountId, snapshotId) {
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
export async function fetchBrokerData(account, base) {
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
export async function writeResults(admin, accountId, userId, records, stockLots, breaches = []) {
  // A spread reporting a loss beyond its own arithmetic maximum is not a
  // figure to store and explain later. The sync fails, the page says the
  // refresh failed, and the stored history is left exactly as it was --
  // the same posture as refuseMassDelete, for the same reason.
  if (breaches.length > 0) {
    const first = breaches[0];
    throw new Error(
      `Refusing to store an impossible result: ${first.short_symbol}/${first.long_symbol} closed ` +
        `${first.close_date} computes to ${first.realized_pl.toFixed(2)} against a maximum loss of ` +
        `${first.max_loss.toFixed(2)}${breaches.length > 1 ? ` (and ${breaches.length - 1} more)` : ""}. ` +
        `Nothing was changed.`
    );
  }
  return writeResultsInner(admin, accountId, userId, records, stockLots);
}

export async function writeResultsInner(admin, accountId, userId, records, stockLots) {
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
  // The chain ids belong in here. They are what attributes a lot's result to
  // an option, so a lot whose chain changed is a lot whose money moved to a
  // different trade -- a change worth a snapshot even when every price on it
  // is identical.
  const changedFields = (before: any, after: any) =>
    ["qty", "acquired_date", "acquired_price", "acquired_source",
     "disposed_date", "disposed_price", "disposed_source", "realized_pl",
     "acquired_chain_id", "disposed_chain_id", "chain_id"]
      .some((f) => String(before[f] ?? "") !== String(after[f] ?? ""));
  const updatedLotsBefore = existingLots.filter(
    (l: any) => freshLotByKey[l.lot_key] && changedFields(l, freshLotByKey[l.lot_key])
  );

  // Rewrites in place have no cap -- refuseMassDelete counts deletions -- and
  // an uncapped rewrite that tells nobody is how a whole account's figures
  // change with no trace outside the snapshot. Capping it would fail the first
  // sync of any account whose rows predate this code, which is every account
  // today, so this says so rather than refusing: the snapshot holds the before
  // image and this is the line that sends someone to look for it.
  if (toUpdate.length > 0 || updatedLotsBefore.length > 0) {
    console.error(
      `tradeHistory rewrite: account=${accountId} trades=${toUpdate.length}/${existing.length} ` +
        `lots=${updatedLotsBefore.length}/${optionLots.length} removed=${stale.length}`
    );
  }

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
