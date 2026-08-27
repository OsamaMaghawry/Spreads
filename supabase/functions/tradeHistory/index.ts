import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";
import { reconstruct } from "../_shared/tradeReconstruction.ts";

// Fetches the account's activity from Alpaca and hands it to the pure
// reconstruction in _shared/tradeReconstruction.ts, which is where the pairing,
// assignment and share-ledger logic lives and where it is tested. Everything
// here is I/O: pull activities, write the results, reconcile what changed.

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

// A rebuild recomputes history that the previous, broken logic produced, so
// figures change. Every row is copied out first: the nightly pg_dump is a
// second net, but it should not be the only one when the destructive step is
// deliberate.
async function snapshotAndClear(admin, accountId) {
  const existing = await fetchTrades(admin, accountId, false);
  if (existing.length > 0) {
    const { error } = await admin.from("trade_records_backup").insert(existing);
    if (error) throw new Error(`Backup failed, nothing deleted: ${error.message}`);
  }
  for (const table of ["trade_records", "stock_lots"]) {
    const { error } = await admin.from(table).delete().eq("account_id", accountId);
    if (error) throw new Error(error.message);
  }
  return existing.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, sync = false, rebuild = false, preview = false, includeRaw = false } = await req.json();
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const base = tradingBase(account);

    const accountInfo = {
      id: account.id, name: account.name, is_paper: account.is_paper,
      spreads_client_prefix: (account.spreads_client_prefix || "").trim(),
      wheel_client_prefix: (account.wheel_client_prefix || "").trim()
    };

    // Read-only mode: serve stored trades without touching Alpaca. A preview
    // needs the live feed, so it goes down the sync path — it just never writes.
    if (!sync && !preview) {
      const [stored, lots] = await Promise.all([fetchTrades(admin, accountId), fetchStockLots(admin, accountId)]);
      return jsonResponse({ account: accountInfo, trades: stored, stockLots: lots, fromCache: true });
    }

    const spreadsPrefix = (account.spreads_client_prefix || "").trim();
    const wheelPrefix = (account.wheel_client_prefix || "").trim();
    const strategyOf = (clientOrderId) => {
      const c = clientOrderId || "";
      if (spreadsPrefix && c.startsWith(spreadsPrefix)) return "spreads";
      if (wheelPrefix && c.startsWith(wheelPrefix)) return "wheel";
      return "unknown";
    };

    // 1. Closed orders (newest first) -> strategy per order id, including mleg legs.
    const orderStrategy = {};
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

    // 2. Activities. OPASN and OPEXC were missing here, which is why an
    //    assigned spread produced no record at all — its lots never closed.
    //    FILL now also carries stock fills, which were previously discarded.
    let activities: any[] = [];
    let pageToken = null;
    for (let i = 0; i < 20; i++) {
      const url = `${base}/account/activities?activity_types=FILL,OPEXP,OPASN,OPEXC&direction=desc&page_size=100` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      activities = activities.concat(page);
      if (page.length < 100) break;
      pageToken = page[page.length - 1].id;
    }

    // 3. Reconstruct. Pure, and covered by tradeReconstruction.test.ts.
    const { records, stockLots } = reconstruct(activities, orderStrategy, accountId);

    // 3a. Dry run: compute everything, write nothing, and hand back the broker's
    //     own activities next to what this code made of them. A rebuild rewrites
    //     history that real money produced, so there has to be a way to audit the
    //     answer — and the source it came from — before anything is committed.
    if (preview) {
      const stored = await fetchTrades(admin, accountId, false);
      const storedByKey: any = {};
      stored.forEach((r: any) => { storedByKey[r.trade_key] = r; });
      const proposedKeys = new Set(records.map((r: any) => r.trade_key));
      const sum = (rows: any[], field = "realized_pl") =>
        rows.reduce((a: number, r: any) => a + (Number(r[field]) || 0), 0);

      return jsonResponse({
        account: accountInfo,
        preview: true,
        // Every option position that would exist after a rebuild, and every
        // share lot, exactly as they would be written.
        proposed: { records, stockLots },
        diff: {
          created: records.filter((r: any) => !storedByKey[r.trade_key]),
          removed: stored.filter((r: any) => !proposedKeys.has(r.trade_key)),
          changed: records
            .map((r: any) => ({ before: storedByKey[r.trade_key], after: r }))
            .filter((p: any) => p.before && Number(p.before.realized_pl) !== Number(p.after.realized_pl))
        },
        totals: {
          storedPremium: sum(stored),
          proposedPremium: sum(records),
          proposedStock: sum(stockLots),
          proposedCombined: sum(records) + sum(stockLots),
          sharesStillHeld: stockLots.filter((l: any) => !l.disposed_date).length
        },
        // The unmodified broker feed, so the inputs can be checked and not just
        // the conclusion. Off by default because it is large.
        activities: includeRaw ? activities : undefined,
        activityCount: activities.length
      });
    }

    const cleared = rebuild ? await snapshotAndClear(admin, accountId) : 0;

    // 4. Reconcile stored records with what Alpaca reports.
    const existing = await fetchTrades(admin, accountId, false);
    const existingByKey: any = {};
    existing.forEach((r: any) => { existingByKey[r.trade_key] = r; });
    const freshKeys = new Set(records.map((r: any) => r.trade_key));
    const oldestClose = records.reduce((m: string, r: any) => (r.close_date && r.close_date < m ? r.close_date : m), "9999-99-99");

    const toCreate = records.filter((r: any) => !existingByKey[r.trade_key]);
    const toUpdate = records
      .filter((r: any) => {
        const e = existingByKey[r.trade_key];
        return e && (
          e.qty !== r.qty ||
          e.strategy !== r.strategy ||
          e.realized_pl !== r.realized_pl ||
          e.close_reason !== r.close_reason ||
          e.unpaired !== r.unpaired ||
          e.chain_id !== r.chain_id
        );
      })
      .map((r: any) => ({ id: existingByKey[r.trade_key].id, ...r }));
    // Drop stale rows inside the window we just recomputed (e.g. previously mis-paired trades).
    const stale = existing.filter((r: any) => !freshKeys.has(r.trade_key) && (r.close_date || "") >= oldestClose);

    for (const r of stale) {
      const { error } = await admin.from("trade_records").delete().eq("id", (r as any).id);
      if (error) throw new Error(error.message);
    }
    if (toCreate.length > 0) {
      const { error } = await admin.from("trade_records").insert(toCreate.map((r: any) => ({ ...r, user_id: user.id })));
      if (error) throw new Error(error.message);
    }
    for (const r of toUpdate) {
      const { id, ...fields } = r as any;
      const { error } = await admin.from("trade_records").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    }

    // 5. Share lots are fully derived from the same activities, so the fresh
    //    set is authoritative: anything no longer derivable is removed, and the
    //    rest is upserted on its stable key.
    const existingLots = await fetchStockLots(admin, accountId);
    const freshLotKeys = new Set(stockLots.map((l: any) => l.lot_key));
    const staleLots = existingLots.filter((l: any) => !freshLotKeys.has(l.lot_key));
    for (const l of staleLots) {
      const { error } = await admin.from("stock_lots").delete().eq("id", (l as any).id);
      if (error) throw new Error(error.message);
    }
    if (stockLots.length > 0) {
      const { error } = await admin
        .from("stock_lots")
        .upsert(stockLots.map((l: any) => ({ ...l, user_id: user.id })), { onConflict: "account_id,lot_key" });
      if (error) throw new Error(error.message);
    }

    const [all, lots] = await Promise.all([fetchTrades(admin, accountId), fetchStockLots(admin, accountId)]);
    return jsonResponse({
      account: accountInfo,
      trades: all,
      stockLots: lots,
      stats: {
        created: toCreate.length,
        updated: toUpdate.length,
        removed: stale.length,
        stockLots: stockLots.length,
        rebuiltFrom: cleared
      },
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
