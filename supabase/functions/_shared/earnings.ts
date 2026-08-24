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

// A week per request. Measured against the live provider, a fortnight in peak
// season returns exactly 1500 rows — its result cap, silently truncating the
// rest. Halving the slice keeps the busiest week (~750) clear of that ceiling,
// and 13 requests still sit far inside the per-minute rate limit.
const SLICE_DAYS = 7;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  ymd(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000);

/**
 * Repopulates the cache for an explicit date range, in short slices.
 *
 * The provider truncates a wide request and returns the *newest* matches
 * first: asking for 90 days yields its result cap dated three months out,
 * with the near term — the only part a scan can actually hold a position
 * through — cut off entirely. Measured directly: a 24 Aug → 22 Nov request
 * returns 1500 rows starting 5 Nov, while 24 Aug → 6 Sep returns 322 rows
 * starting 24 Aug. So the range is walked in fortnight slices, nearest
 * first, keeping every request well inside the cap.
 *
 * No auth/admin gating here — that's the caller's job. A throw must never
 * reach a caller that isn't awaiting it; unawaited callers route through
 * `inBackground`/`awaitUpTo`, which swallow and keep the isolate alive.
 */
export async function refreshEarningsRange(
  admin,
  from: string,
  to: string
): Promise<{ from: string; to: string; upserted: number }> {
  let upserted = 0;
  for (let sliceFrom = from; sliceFrom <= to; sliceFrom = addDays(sliceFrom, SLICE_DAYS)) {
    const sliceEnd = addDays(sliceFrom, SLICE_DAYS - 1);
    const sliceTo = sliceEnd > to ? to : sliceEnd;

    const events = await fetchProviderWindow(sliceFrom, sliceTo);

    // The provider lists some symbols twice for one date — a restatement, or
    // the same report filed under two quarters. Postgres rejects an upsert
    // whose conflict key repeats within a single statement ("cannot affect
    // row a second time"), which fails the whole slice, so the payload is
    // reduced to one row per (symbol, date) before it is written. Later wins:
    // a correction arrives after the entry it corrects.
    const deduped = [...new Map(
      events.map((e) => [`${e.symbol}|${e.reportDate}`, e])
    ).values()];

    // Still chunked: a slice is normally one upsert, but a heavy earnings
    // fortnight must not become one oversized payload.
    for (let i = 0; i < deduped.length; i += 500) {
      const rows = deduped.slice(i, i + 500).map((e) => ({
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

/** Repopulates the cache for the next `days` days from today. */
export function refreshEarningsWindow(admin, days = 90) {
  const today = ymd(Date.now());
  return refreshEarningsRange(admin, today, addDays(today, days));
}

/** Repopulates only as far out as `throughDate` — the dates a scan in view needs. */
export function refreshEarningsThrough(admin, throughDate: string) {
  return refreshEarningsRange(admin, ymd(Date.now()), throughDate);
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
