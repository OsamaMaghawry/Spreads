import { loadAccount } from "./alpaca.ts";
import { scanCandidates } from "./optionScan.ts";
import { heldShares } from "./heldShares.ts";
import { judgeOnLivePrices } from "./watchRules.ts";
import {
  earningsThrough, daysUntil, earningsCoverage, earningsCovered,
  refreshEarningsThrough, refreshEarningsWindow
} from "./earnings.ts";
import { inBackground, awaitUpTo } from "./background.ts";

// The entry scan behind both the Scanner (scanEntries) and the Claude connector
// (mcp): validation, the account's own cover for covered calls, the sweep, and
// the earnings annotation. One implementation, so a candidate Claude is shown
// is the candidate the Scanner would show for the same filters.
//
// Moved here unchanged from scanEntries/index.ts; the caller has already
// verified who is asking and passes their id.

// Longest a scan will wait on a cold earnings cache before answering with
// whatever is already there. A missing warning is recoverable — the next scan
// has the data — but a scan that hangs on a slow provider is not.
const COLD_CACHE_BUDGET_MS = 4000;

const reply = (body: any, status = 200) => ({ status, body });

export async function scanEntriesFor(admin: any, userId: string, body: any) {
  const { accountId, tickers, strategy } = body;
  if (!accountId || !Array.isArray(tickers) || tickers.length === 0 || !strategy) {
    return reply({ error: "accountId, tickers[] and strategy are required" }, 400);
  }
  if (!["put_spread", "call_spread", "iron_condor", "cash_secured_put", "covered_call"].includes(strategy)) {
    return reply({ error: "Unsupported strategy" }, 400);
  }

  const account = await loadAccount(admin, accountId, userId);

  // A covered call is written on shares the account already holds, so its
  // universe is the account, not the request. A cash-secured put scans the
  // requested tickers like a spread does.
  let params = body;
  // Held tickers whose cover already stands behind a call sold, with the
  // sentence saying so. Their setups are shown, flagged -- see scanCover.
  let inUse: Record<string, string> = {};
  if (strategy === "covered_call") {
    const held = await heldShares(admin, account);
    const scan = held.scan;
    if (scan.tickers.length === 0) {
      return reply({
        ok: false, candidates: [], skipped: [],
        reason: "Nothing to write a call against — no 100 shares and no long call in this account."
      });
    }
    inUse = scan.inUse;
    params = {
      ...body,
      tickers: scan.tickers,
      sharesByTicker: scan.sharesByTicker,
      basisByTicker: held.basis,
      longCoverByTicker: scan.longCoverByTicker
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

  for (const c of result.candidates || []) {
    if (inUse[c.ticker]) c.coverInUse = inUse[c.ticker];
  }
  return reply(result);
}
