import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { readChainFor } from "../_shared/chainRead.ts";
import { earningsThrough, earningsCovered, earningsCoverage, refreshEarningsWindow } from "../_shared/earnings.ts";
import { inBackground } from "../_shared/background.ts";

// The option chain for one underlying, as a ladder, with what the account
// holds of it. The work is in _shared/chainRead.ts, shared with the Claude
// connector.
//
// Plus the underlying's NEXT earnings report. Tickets built from the chain --
// the chain's own, and Protect and Repair on the dashboard -- showed no
// earnings warning at all, because nothing here carried a date. The owner:
// "The ticket for the repair or protect has no earning alerts. It should have
// if the fix has earning during the way." The ticket decides whether the date
// falls before its own expiry (a calendar's far leg can be months past the
// expiry this chain was read on), so this returns the date, not a verdict.
// Same cache and the same "not covered is unknown, not clear" rule as the
// scanner (entryScan.ts).

// How far ahead the next report is looked for, and how far the calendar is
// actually kept: refreshEarningsWindow fills 90 days. A ticket expiring past
// that cannot be called clear -- the report may simply not be cached yet -- so
// the date the cache reaches travels with the answer and the ticket marks
// anything beyond it unknown.
const EARNINGS_HORIZON_DAYS = 400;
const EARNINGS_CACHED_DAYS = 90;

async function nextEarnings(admin, ticker: string) {
  try {
    const horizon = new Date(Date.now() + EARNINGS_HORIZON_DAYS * 86400000).toISOString().slice(0, 10);
    const [calendar, covered, coverage] = await Promise.all([
      earningsThrough(admin, [ticker], horizon),
      earningsCovered(admin, [ticker]),
      earningsCoverage(admin, horizon).catch(() => null)
    ]);
    if (coverage?.missing || coverage?.stale) inBackground(refreshEarningsWindow(admin));
    const event = calendar[ticker];
    return {
      nextEarnings: event ? { date: event.reportDate, session: event.session } : null,
      earningsUnknown: !event && !covered.has(ticker),
      earningsCheckedThrough: new Date(Date.now() + EARNINGS_CACHED_DAYS * 86400000).toISOString().slice(0, 10)
    };
  } catch {
    // A calendar that cannot be read never fails the chain. Unknown, not clear.
    return { nextEarnings: null, earningsUnknown: true, earningsCheckedThrough: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const r = await readChainFor(admin, user.id, await req.json());
    if (r.status === 200 && r.body?.ticker) {
      Object.assign(r.body, await nextEarnings(admin, String(r.body.ticker).toUpperCase()));
    }
    return jsonResponse(r.body, r.status);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
