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
import { lotFromOption } from "./writeGuards.ts";
import {
  auditAccount,
  applyFindings,
  dedupeFindings,
  applyLotFindings,
  withheldLotSummary,
  massDeleteFinding,
  writesHeld,
  vanished,
  lotIdentity,
  type Finding
} from "./integrity.ts";

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
export async function writeResults(
  admin, accountId, userId, records, stockLots, breaches = [], orphanedStockPL = 0,
  lotOwners: Map<string, Set<string>> | null = null
) {
  // THE AUDIT PASS, in place of the refusal that used to live here.
  //
  // This function used to throw on the first impossible result, which left the
  // account's stored history exactly as it was -- and on an account that had
  // never synced, "exactly as it was" is nothing at all. One XLY row whose
  // computed loss exceeded its strikes by $64 cost the owner every trade on
  // that account, a blank Analysis page and an empty weekly email.
  //
  // The check was right; the remedy was not. The breach now withholds THAT
  // ROW's figures and the other forty-two are written normally. See
  // _shared/integrity.ts for the actions and why there is no longer one that
  // stops a sync.
  const findings = auditAccount({ breaches, orphanedStockPL });
  const flagged = applyFindings(records, findings);

  // THE SAME WITHHOLDING, ON THE OTHER TABLE THE SAME MONEY LIVES IN.
  //
  // The impossible-loss defect IS a share result attributed to the wrong
  // option row, so flagging only `trade_records` left the disputed dollars
  // published in `stock_lots` -- on the lots table, in the share walk, and in
  // the equity chart's own reading of the ledger. `lotOwners` is the
  // reconstruction's own record of which trade row received each lot's money,
  // so this withholds exactly the disposals the withheld rows were paid from.
  const flaggedLots = applyLotFindings(stockLots, flagged, lotOwners);

  // The finding says how much of it is share money, because "this spread is
  // $64 past its floor" and "and $189 of closed-share result moved with it"
  // are different sizes of problem to whoever reads the trail.
  //
  // Attributed PER FINDING rather than the whole total onto each: with two
  // withheld rows, giving both the account-wide sum makes each look twice the
  // size it is.
  const enriched = findings.map((f) => {
    if (f.action !== "withhold_row") return f;
    const mine = withheldLotSummary(
      flaggedLots.filter((l: any) => (l.integrity_detail?.owners || []).includes(f.subject))
    );
    return mine.lots
      ? { ...f, detail: { ...f.detail, withheld_share_lots: mine.lots, withheld_share_pl: mine.realized } }
      : f;
  });

  return writeResultsInner(admin, accountId, userId, flagged, flaggedLots, enriched);
}


export async function writeResultsInner(
  admin, accountId, userId, records, stockLots, findings: Finding[] = []
) {
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
        // A row that stops being withheld, or starts, has changed even when
        // every figure on it is identical -- and this is the one comparison
        // that decides whether the clearing write happens at all. Without it a
        // corrected check leaves the row hidden from every total while the
        // audit trail records the finding as resolved: the trail says fixed,
        // the money is still missing.
        (e.integrity_code || null) !== (r.integrity_code || null) ||
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

  // ONE KIND'S STORED ROWS FROZEN, RATHER THAN THE SYNC REFUSED.
  //
  // A reconstruction that wants to remove most of what is stored is still much
  // more likely to be a defect than a correction -- a truncated broker feed, an
  // outage returning a short page, a credential that has stopped working all
  // look exactly like "this account has no trades any more". That judgement
  // was right and has not changed.
  //
  // What changed is what happens next. This used to throw, which threw away a
  // perfectly good update to protect the rows and left the account stale on top
  // of it.
  //
  // THE VERSION IN BETWEEN WAS WORSE THAN EITHER, and the bench caught it
  // before it left staging. It held only the DELETIONS and let `toCreate`
  // write, on the reasoning that keeping rows can only be safer. It is not:
  // `stale` is defined a few lines above as rows whose IDENTITY changed as well
  // as rows that vanished, so the replacement arrives under a NEW key. Holding
  // the delete while writing the create stores the same closed trade twice,
  // both copies with `integrity_code` null because a `mass_delete_held`
  // finding's subject is the string "trade records" and matches no row. It
  // reproduced at exactly double the true P/L. A stale account is wrong and
  // self-consistent; a double-counted account is wrong and looks right.
  //
  // We cannot tell a truncated feed from a re-keying from here, so that kind's
  // stored rows do not move AT ALL -- no delete, no insert, no rewrite. What
  // makes this different from the old refusal is its blast radius: it costs one
  // KIND of record, and the share ledger, the equity series, the sync timestamp
  // and the audit note all still proceed. The account keeps the history it had
  // rather than being emptied, which is the whole complaint this answers.
  // WHAT VANISHED, NOT WHAT WAS RE-KEYED, and measured over the SAME
  // population on both sides of the ratio.
  //
  // Two separate defects lived in the four numbers this used to pass:
  //
  //   - `staleLots.length` counted re-keys. Disposing of a held lot changes
  //     its `lot_key`, so an ordinary wheel week reads as "6 of 6 lots
  //     removed" and froze the whole account, permanently and silently.
  //
  //   - `stale.length / existing.length` compared a WINDOW against the WHOLE
  //     ACCOUNT. On an empty broker feed `stale` is 0 by construction, so the
  //     guard could not fire at all on the very case it was written for; on a
  //     truncated feed 9 real deletions inside an 11-row window read as 9/40
  //     and passed.
  //
  // The deletion sets below are unchanged -- a re-keyed row must still go, or
  // its replacement duplicates it. Only the EVIDENCE is counted differently.
  const inWindow = existing.filter((r: any) => (r.close_date || "") >= oldestClose);
  const deletionFindings = [
    massDeleteFinding(
      "trade records",
      vanished(stale, records, (r: any) => r.trade_key),
      inWindow.length
    ),
    massDeleteFinding(
      "share lots",
      vanished(staleLots, stockLots, lotIdentity),
      optionLots.length
    )
  ].filter(Boolean) as Finding[];
  const allFindings = [...findings, ...deletionFindings];

  // FROZEN TOGETHER, NOT INDEPENDENTLY.
  //
  // A trade row and the share lots attributed to it carry two halves of one
  // claim, and the bench found that deciding them on separate thresholds
  // splits it. Freeze trades alone and the `integrity_code` this pass computed
  // never lands on the row -- so the row publishes the disputed money while the
  // lot beside it shows a dash, and the trail records a withholding that had no
  // effect. Freeze lots alone and it runs the other way, with the equity walk
  // feeding those dollars into `shares_booked` while its trade query excludes
  // the row.
  //
  // Either finding therefore freezes both. It costs a little more staleness in
  // the rarer case; it cannot produce two tables disagreeing about the same
  // dollars, which is the thing this whole layer exists to prevent.
  const anyFrozen =
    writesHeld(allFindings, "trade records") || writesHeld(allFindings, "share lots");
  const tradesFrozen = anyFrozen;
  const lotsFrozen = anyFrozen;

  const deleteTrades = tradesFrozen ? [] : stale;
  const createTrades = tradesFrozen ? [] : toCreate;
  const updateTrades = tradesFrozen ? [] : toUpdate;
  const deleteLots = lotsFrozen ? [] : staleLots;
  const upsertLots = lotsFrozen ? [] : stockLots;

  const freshLotByKey: any = {};
  stockLots.forEach((l: any) => { freshLotByKey[l.lot_key] = l; });
  // The chain ids belong in here. They are what attributes a lot's result to
  // an option, so a lot whose chain changed is a lot whose money moved to a
  // different trade -- a change worth a snapshot even when every price on it
  // is identical.
  const changedFields = (before: any, after: any) =>
    ["qty", "acquired_date", "acquired_price", "acquired_source",
     "disposed_date", "disposed_price", "disposed_source", "realized_pl",
     "acquired_chain_id", "disposed_chain_id", "chain_id",
     // A lot that stops being withheld, or starts, is a lot whose money moved
     // in or out of every total -- the same reason `integrity_code` is in the
     // trade diff. Without it a corrected check leaves the lot hidden while
     // the trail records the finding resolved.
     "integrity_code"]
      .some((f) => String(before[f] ?? "") !== String(after[f] ?? ""));
  // Built from the lots actually being written, so a frozen pass does not
  // snapshot a before-image of writes that never happened.
  const upsertLotByKey: any = {};
  upsertLots.forEach((l: any) => { upsertLotByKey[l.lot_key] = l; });
  const updatedLotsBefore = existingLots.filter(
    (l: any) => upsertLotByKey[l.lot_key] && changedFields(l, upsertLotByKey[l.lot_key])
  );

  // Rewrites in place have no cap -- the mass-delete finding counts deletions
  // -- and an uncapped rewrite that tells nobody is how a whole account's figures
  // change with no trace outside the snapshot. Capping it would fail the first
  // sync of any account whose rows predate this code, which is every account
  // today, so this says so rather than refusing: the snapshot holds the before
  // image and this is the line that sends someone to look for it.
  if (updateTrades.length > 0 || updatedLotsBefore.length > 0) {
    console.error(
      `tradeHistory rewrite: account=${accountId} trades=${updateTrades.length}/${existing.length} ` +
        `lots=${updatedLotsBefore.length}/${optionLots.length} removed=${deleteTrades.length}`
    );
  }

  await snapshot(admin, accountId, userId, "sync", {
    deleted: deleteTrades,
    updatedBefore: updateTrades.map((r: any) => existingByKey[r.trade_key]),
    deletedLots: deleteLots,
    updatedLotsBefore
  });

  for (const r of deleteTrades) {
    const { error } = await admin.from("trade_records").delete().eq("id", (r as any).id);
    if (error) throw new Error(error.message);
  }
  if (createTrades.length > 0) {
    const { error } = await admin
      .from("trade_records")
      .insert(createTrades.map((r: any) => ({ ...r, user_id: userId })));
    if (error) throw new Error(error.message);
  }
  for (const r of updateTrades) {
    const { id, ...fields } = r as any;
    const { error } = await admin.from("trade_records").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  }

  for (const l of deleteLots) {
    const { error } = await admin.from("stock_lots").delete().eq("id", (l as any).id);
    if (error) throw new Error(error.message);
  }
  if (upsertLots.length > 0) {
    const { error } = await admin
      .from("stock_lots")
      .upsert(upsertLots.map((l: any) => ({ ...l, user_id: userId })), {
        onConflict: "account_id,lot_key"
      });
    if (error) throw new Error(error.message);
  }

  // A FROZEN PASS DOES NOT GET TO SAY IT SYNCED.
  //
  // This used to stamp `trades_synced_at` and clear `trades_sync_error`
  // unconditionally, so an account whose writes were held read as current and
  // healthy on every screen -- the staleness gate then skipped it as fresh, and
  // the cron reported ok. The one signal that would have surfaced a freeze was
  // being erased by the freeze itself.
  await admin
    .from("trading_accounts")
    .update(
      anyFrozen
        ? {
            trades_sync_error:
              `Held: ${allFindings.filter((f) => f.action === "hold_writes").map((f) => f.subject).join(" and ")}` +
              ` looked wrong enough to leave alone. Stored history is unchanged.`
          }
        : { trades_synced_at: new Date().toISOString(), trades_sync_error: null }
    )
    .eq("id", accountId);

  // THE AUDIT TRAIL, written last and on every pass including a clean one.
  //
  // On a clean pass this resolves whatever the last pass found, which is the
  // half that makes the trail readable: findings close themselves when the
  // thing stops being true, so what is open is what is actually wrong today
  // rather than a board of stale warnings nobody reads any more.
  //
  // Deliberately NOT allowed to fail the sync. The records are already
  // written and correct at this point; losing the audit note is bad, and
  // throwing away a good sync because we could not write a note about it is
  // exactly the posture this whole change exists to undo.
  //
  // A FROZEN PASS RECORDS ONLY WHAT IT DID. The row-level withholdings this
  // pass computed never landed -- the writes were held -- so recording them
  // would put a withholding in the trail that had no effect on any figure, and
  // worse, RESOLVING the ones it no longer produces would close a finding whose
  // flag is still on a row nobody cleared. The trail must describe the stored
  // state, not the state a pass wished for.
  const trail = anyFrozen
    ? allFindings.filter((f) => f.action === "hold_writes")
    : allFindings;
  try {
    const { error } = await admin.rpc("record_integrity_findings", {
      p_account_id: accountId,
      p_user_id: userId,
      p_findings: dedupeFindings(trail),
      // Nothing resolves on a frozen pass: the flags on the stored rows were
      // not touched, so their findings are still in force.
      p_resolve_missing: !anyFrozen
    });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    console.error(`integrity findings not recorded for ${accountId}: ${e?.message || e}`);
  }

  return {
    created: createTrades.length,
    updated: updateTrades.length,
    removed: deleteTrades.length,
    removedLots: deleteLots.length,
    // What the pass found, so the caller -- a page, or the cron's result --
    // can say it out loud instead of the account quietly being different.
    findings: allFindings.map((f) => ({
      code: f.code, severity: f.severity, action: f.action,
      subject: f.subject, message: f.message
    })),
    withheld: allFindings.filter((f) => f.action === "withhold_row").length,
    writesHeld: allFindings.filter((f) => f.action === "hold_writes").map((f) => f.subject)
  };
}
