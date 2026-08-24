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

const SLICE_DAYS = 14;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Repopulates the cache for the next `days` days from the provider.
 *
 * Fetched in short slices walking forward from today rather than as one
 * 90-day request. A single wide request came back holding only the far tail
 * of the window — 500 rows three months out, nothing in the near term — which
 * is the half that actually matters, since a position can only be held
 * through an announcement inside its own expiry. Slicing means the nearest
 * dates are requested and written first, so neither a provider-side cap nor
 * an interrupted run can leave the near term empty.
 *
 * No auth/admin gating here — that's the caller's job. A throw must never
 * reach a caller that isn't awaiting it: unawaited callers attach `.catch()`
 * and hand the promise to `EdgeRuntime.waitUntil` so the runtime does not
 * tear the isolate down mid-write.
 */
export async function refreshEarningsWindow(
  admin,
  days = 90
): Promise<{ from: string; to: string; upserted: number }> {
  const startMs = Date.now();
  const from = ymd(startMs);
  const to = ymd(startMs + days * 86400000);

  let upserted = 0;
  for (let offset = 0; offset < days; offset += SLICE_DAYS) {
    const sliceFrom = ymd(startMs + offset * 86400000);
    const sliceTo = ymd(startMs + Math.min(offset + SLICE_DAYS - 1, days) * 86400000);

    const events = await fetchProviderWindow(sliceFrom, sliceTo);
    // Still chunked: a slice is normally one upsert, but a heavy earnings
    // fortnight must not become one oversized payload.
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
  }
  return { from, to, upserted };
}

/** Hours since the calendar was last written, or null if never. */
async function hoursSinceRefresh(admin): Promise<number | null> {
  const { data, error } = await admin
    .from("earnings_calendar")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (Date.now() - new Date(data.fetched_at).getTime()) / 3600000;
}

/**
 * Whether the cache can still be trusted for scans reaching to `throughDate`.
 *
 * `missing` means there is nothing cached for the window at all, so a warning
 * could not be raised even if one were due — worth waiting for. `stale` means
 * dates are cached but were fetched over a day ago, so they are usable now and
 * worth refreshing behind the response. Checking coverage of the window rather
 * than "is the table empty" is deliberate: an empty-table test stops firing
 * the moment any row lands, even a row three months from the dates in view.
 */
export async function earningsCoverage(
  admin,
  throughDate: string
): Promise<{ missing: boolean; stale: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin
    .from("earnings_calendar")
    .select("*", { count: "exact", head: true })
    .gte("report_date", today)
    .lte("report_date", throughDate);

  const age = await hoursSinceRefresh(admin);
  return { missing: !count, stale: age === null || age > 24 };
}
