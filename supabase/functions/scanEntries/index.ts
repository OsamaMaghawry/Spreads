import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount } from "../_shared/alpaca.ts";
import { scanCandidates } from "../_shared/optionScan.ts";
import { heldShares } from "../_shared/heldShares.ts";
import { judgeOnLivePrices } from "../_shared/watchRules.ts";
import {
  earningsThrough, daysUntil, earningsCoverage,
  refreshEarningsThrough, refreshEarningsWindow
} from "../_shared/earnings.ts";
import { inBackground, awaitUpTo } from "../_shared/background.ts";

// Longest a scan will wait on a cold earnings cache before answering with
// whatever is already there. A missing warning is recoverable — the next scan
// has the data — but a scan that hangs on a slow provider is not.
const COLD_CACHE_BUDGET_MS = 4000;

// Sweeps multiple tickers across DTE / delta / width ranges and returns ranked
// setups, each flagged if the underlying reports earnings before it expires.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { accountId, tickers, strategy } = body;
    if (!accountId || !Array.isArray(tickers) || tickers.length === 0 || !strategy) {
      return jsonResponse({ error: "accountId, tickers[] and strategy are required" }, 400);
    }
    if (!["put_spread", "call_spread", "iron_condor", "cash_secured_put", "covered_call"].includes(strategy)) {
      return jsonResponse({ error: "Unsupported strategy" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);

    // A covered call is written on shares the account already holds, so its
    // universe is the account, not the request. A cash-secured put scans the
    // requested tickers like a spread does.
    let params = body;
    if (strategy === "covered_call") {
      const held = await heldShares(admin, account);
      if (held.tickers.length === 0) {
        return jsonResponse({ ok: false, candidates: [], skipped: [], reason: "This account holds no 100-share lots to write a covered call on." });
      }
      params = { ...body, tickers: held.tickers, sharesByTicker: held.shares, basisByTicker: held.basis };
    }
    // Options do not trade outside 09:30-16:00 ET, so outside the session
    // the chain is still quoted at the previous close while the stock has
    // moved on. The scan says that rather than reporting the two sources as
    // disagreeing, which reads as a fault.
    const result = await scanCandidates(account, { ...params, marketOpen: judgeOnLivePrices() });

    // Annotate rather than filter: an earnings release inside the holding
    // period is a risk the trader should see and decide on, not one the
    // software should quietly make for them.
    const candidates = result.candidates || [];
    if (candidates.length > 0) {
      const latestExpiry = candidates.reduce((a, c) => (c.expiry > a ? c.expiry : a), candidates[0].expiry);

      // Nothing cached for the dates in view means no warning could be raised
      // at all, so it is worth a bounded wait — but only for the dates this
      // scan can reach, which is days away, not the whole 90-day horizon. The
      // rest fills in behind the response.
      const { missing, stale } = await earningsCoverage(admin, latestExpiry);
      if (missing) {
        await awaitUpTo(refreshEarningsThrough(admin, latestExpiry), COLD_CACHE_BUDGET_MS);
        inBackground(refreshEarningsWindow(admin));
      } else if (stale) {
        inBackground(refreshEarningsWindow(admin));
      }

      const calendar = await earningsThrough(admin, [...new Set(candidates.map((c) => c.ticker))], latestExpiry);

      for (const c of candidates) {
        const event = calendar[c.ticker];
        // Only a report that lands on or before expiry is held through.
        if (event && event.reportDate <= c.expiry) {
          c.earnings = {
            date: event.reportDate,
            session: event.session,
            daysAway: daysUntil(event.reportDate)
          };
        }
      }
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
