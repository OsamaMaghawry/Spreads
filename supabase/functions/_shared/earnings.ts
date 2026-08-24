// Scheduled earnings dates, and the risk lookup the scanner and order paths use.
//
// Alpaca does not publish an earnings calendar — its corporate actions API
// covers dividends, mergers, spinoffs and splits only — so dates come from a
// third-party provider and are cached in public.earnings_calendar.
//
// The provider is deliberately behind one function. Swapping Finnhub for
// another source means rewriting `fetchProviderWindow` and nothing else.

const FINNHUB = "https://finnhub.io/api/v1/calendar/earnings";

export interface EarningsEvent {
  symbol: string;
  reportDate: string;      // YYYY-MM-DD
  session: string | null;  // bmo | amc | dmh | null
}

/** Everything the provider knows about the window, normalised. */
export async function fetchProviderWindow(from: string, to: string): Promise<EarningsEvent[]> {
  const token = Deno.env.get("EARNINGS_API_KEY");
  if (!token) throw new Error("EARNINGS_API_KEY is not set — earnings alerts are disabled.");

  const res = await fetch(`${FINNHUB}?from=${from}&to=${to}&token=${token}`);
  if (!res.ok) throw new Error(`Earnings provider returned ${res.status}`);

  const body = await res.json();
  return (body.earningsCalendar || [])
    .filter((e) => e.symbol && e.date)
    .map((e) => ({
      symbol: String(e.symbol).toUpperCase(),
      reportDate: e.date,
      session: e.hour || null
    }));
}

/**
 * Which of `symbols` report on or before `throughDate`, from the cache.
 *
 * Returns a map keyed by symbol holding the *soonest* report in the window,
 * which is the one that matters: a position is exposed to the first
 * announcement it lives through, not the last.
 */
export async function earningsThrough(
  admin,
  symbols: string[],
  throughDate: string
): Promise<Record<string, EarningsEvent>> {
  if (symbols.length === 0) return {};

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("earnings_calendar")
    .select("symbol, report_date, session")
    .in("symbol", symbols)
    .gte("report_date", today)
    .lte("report_date", throughDate)
    .order("report_date", { ascending: true });

  // A missing calendar must never fail a scan or block an order. Absence of a
  // warning is not a promise there is no announcement, and the UI says so.
  if (error || !data) return {};

  const soonest: Record<string, EarningsEvent> = {};
  for (const row of data) {
    if (soonest[row.symbol]) continue;          // ordered ascending, first wins
    soonest[row.symbol] = {
      symbol: row.symbol,
      reportDate: row.report_date,
      session: row.session
    };
  }
  return soonest;
}

/** Calendar days from today to `date`, floored at zero. */
export function daysUntil(date: string): number {
  const ms = new Date(`${date}T00:00:00Z`).getTime() - Date.now();
  return Math.max(Math.ceil(ms / 86400000), 0);
}

/**
 * Repopulates the cache for the next `days` days from the provider.
 *
 * No auth/admin gating here — that's the caller's job. `refreshEarnings`
 * gates it behind an admin JWT for on-demand use; `scanEntries` and
 * `openPosition` call this unawaited to warm an empty cache in the
 * background, so a throw here must never propagate to a request that isn't
 * awaiting it — callers doing that must attach their own `.catch()`.
 */
export async function refreshEarningsWindow(
  admin,
  days = 90
): Promise<{ from: string; to: string; upserted: number }> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const events = await fetchProviderWindow(from, to);
  let upserted = 0;
  for (let i = 0; i < events.length; i += 500) {
    const rows = events.slice(i, i + 500).map((e) => ({
      symbol: e.symbol,
      report_date: e.reportDate,
      session: e.session,
      fetched_at: new Date().toISOString()
    }));
    const { error } = await admin
      .from("earnings_calendar")
      .upsert(rows, { onConflict: "symbol,report_date" });
    if (error) throw new Error(error.message);
    upserted += rows.length;
  }
  return { from, to, upserted };
}

/** True if the earnings cache has never been populated — the trigger for a
 *  lazy background refresh, not a staleness check. */
export async function earningsCacheIsEmpty(admin): Promise<boolean> {
  const { count } = await admin
    .from("earnings_calendar")
    .select("*", { count: "exact", head: true });
  return !count;
}
