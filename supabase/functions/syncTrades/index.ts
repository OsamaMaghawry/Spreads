import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { tradingBase } from "../_shared/alpaca.ts";
import { loadAllAccounts } from "../_shared/accounts.ts";
import { paperOnlyMode } from "../_shared/settings.ts";
import { reconstruct } from "../_shared/tradeReconstruction.ts";
import { fetchBrokerData, writeResults } from "../_shared/tradeSync.ts";

// Keeping every connected account's history current, without anybody looking.
//
// The owner, 11 Sep: *"Everything should be synced automatically whether the
// user opened the account or not. It's a trading account. It should be always
// updated as long as it is connected."*
//
// He is right, and what existed was pull-when-you-look: `tradeHistory` refreshed
// itself when a person opened the Trade History or Analysis page and its stored
// copy was older than fifteen minutes. Nothing else ever triggered a sync. So
// an account nobody opened for two weeks showed history two weeks old — on
// production, the live account's last sync was 31 Aug while staging, which gets
// opened, was current to 10 Sep. Same broker account, twenty-four trades apart,
// and the only difference was who had clicked.
//
// Nothing was lost by that — the feed is the broker's and a sync rebuilds the
// whole account from it — but "correct once you look at it" is not a property a
// trading record should have. Alerts already run on a schedule; the record of
// what was traded should not be the thing that waits to be asked.
//
// CALLED BY pg_cron over the service role, the same shape as positionWatch:
// `trigger_trade_sync()` reads the vault secrets and posts here. No user token
// is involved, which is why this function never calls `requireUser` and never
// accepts an account id from the caller — it works the whole table, and the
// only thing a request body can change is how hard it tries.

// One account's failure is not the batch's. A revoked key, a rate limit, a
// broker outage on one connection must not stop the other accounts syncing —
// and the reason lands on the account row, where the owner of that account can
// see it, rather than only in a log nobody reads.
async function syncOne(admin, account) {
  const started = Date.now();
  try {
    await admin
      .from("trading_accounts")
      .update({ trades_sync_attempted_at: new Date().toISOString() })
      .eq("id", account.id);

    const { orderStrategy, activities } = await fetchBrokerData(account, tradingBase(account));
    const { records, stockLots, breaches } = reconstruct(activities, orderStrategy, account.id);
    await writeResults(admin, account.id, account.user_id, records, stockLots, breaches);

    await admin
      .from("trading_accounts")
      .update({ trades_synced_at: new Date().toISOString(), trades_sync_error: null })
      .eq("id", account.id);

    return { account: account.id, ok: true, trades: records.length, ms: Date.now() - started };
  } catch (e) {
    const message = e?.message || String(e);
    console.error(`syncTrades failed for ${account.id}: ${message}`);
    await admin
      .from("trading_accounts")
      .update({ trades_sync_error: message })
      .eq("id", account.id)
      .then(() => {}, () => {});
    return { account: account.id, ok: false, error: message, ms: Date.now() - started };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { maxAgeMinutes = 0 } = await req.json().catch(() => ({}));
    const admin = adminClient();
    // Live accounts are not synced while the product is paper-only: storing a
    // real-money account's history is exactly what that switch exists to stop.
    // See PAPER_ONLY in _shared/settings.ts.
    const paperOnly = await paperOnlyMode(admin);
    const accounts = await loadAllAccounts(admin, { paperOnly });

    // `maxAgeMinutes` lets a frequent job skip accounts already fresh, so the
    // hourly run does not re-pull a hundred requests per account for one that
    // a person opened two minutes ago. Zero means "sync everything", which is
    // what the daily settlement run wants.
    const cutoff = maxAgeMinutes > 0 ? Date.now() - maxAgeMinutes * 60000 : null;
    const due = accounts.filter((a) => {
      if (cutoff === null) return true;
      const at = a.trades_synced_at ? Date.parse(a.trades_synced_at) : 0;
      return !at || at < cutoff;
    });

    // SEQUENTIAL, deliberately. `fetchBrokerData` makes roughly a hundred
    // requests for one account; running every account at once is the shape that
    // gets an API key rate-limited, and a rate limit here would show up as a
    // sync error on accounts that are perfectly healthy.
    const results = [];
    for (const account of due) results.push(await syncOne(admin, account));

    const failed = results.filter((r) => !r.ok);
    return jsonResponse({
      accounts: accounts.length,
      attempted: due.length,
      skippedFresh: accounts.length - due.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
