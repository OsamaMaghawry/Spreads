import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount } from "../_shared/alpaca.ts";
import { scanCandidates } from "../_shared/optionScan.ts";
import { heldShares } from "../_shared/heldShares.ts";
import { judgeOnLivePrices } from "../_shared/watchRules.ts";
import {
  earningsThrough, daysUntil, earningsCoverage, earningsCovered,
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
    // Tickers held but left out because their cover is already behind a call
    // sold. Returned with every covered-call answer so the screen can name
    // them; see freeCallCover.
    let committed: any[] = [];
    if (strategy === "covered_call") {
      const held = await heldShares(admin, account);
      // FREE cover, not held cover. A long call the account owns can cover a
      // call written against it, and shares or longs already standing behind a
      // short call cannot cover a second one -- see freeCallCover. Reading raw
      // holdings here is what hid the owner's IBIT long call and re-offered
      // TSLA shares already committed to a short 390C.
      if (held.coverTickers.length === 0) {
        return jsonResponse({
          ok: false, candidates: [], skipped: [], committed: held.committed,
          reason: "Nothing free to write a call against — no 100 shares and no long call that isn't already covering one."
        });
      }
      committed = held.committed;
      params = {
        ...body,
        tickers: held.coverTickers,
        sharesByTicker: held.sharesFree,
        basisByTicker: held.basis,
        longCoverByTicker: held.longsFree
      };
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

      const tickers = [...new Set(candidates.map((c) => c.ticker))];
      const calendar = await earningsThrough(admin, tickers, latestExpiry);
      // Which of these the calendar knows at all, so a name it has never heard
      // of is marked UNKNOWN rather than passing as quiet. See earningsCovered.
      const covered = await earningsCovered(admin, tickers);

      for (const c of candidates) {
        const event = calendar[c.ticker];
        // Only a report that lands on or before expiry is held through.
        if (event && event.reportDate <= c.expiry) {
          c.earnings = {
            date: event.reportDate,
            session: event.session,
            daysAway: daysUntil(event.reportDate)
          };
        } else if (!covered.has(c.ticker)) {
          // No warning AND no coverage. The screen must not render this the
          // same as a checked, clear name -- that is the difference between
          // "nothing is due" and "nobody looked".
          c.earningsUnknown = true;
        }
      }
    }

    return jsonResponse(committed.length ? { ...result, committed } : result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
