// A company's earnings reports for the terminal chart: when each past report
// came out, before the open or after the close, and what it said against what
// was expected; and the next one scheduled.
//
// The owner, 24 Oct 2026: "I want to add to the chart earnings sign or
// something." The cached calendar (public.earnings_calendar, earnings.ts)
// knows the next report but only reaches back to late August, and the
// provider's free tier gives a month of history. So the past comes from the
// SEC instead: a US company announcing results files a Form 8-K under Item
// 2.02, "Results of Operations and Financial Condition", the same day, and
// EDGAR stamps the moment it was accepted. That gives every report for years
// back, with its time of day, from the regulator rather than a vendor.
//
// Foreign companies file a 6-K instead and funds file no 8-K at all; for
// them only the cached calendar's dates show. Earnings-per-share figures, where
// shown, are the provider's (four most recent quarters on its free tier).
//
// Pure: functions/terminal adds the requests.

export type Report = {
  date: string;              // New York date of the release
  at: number | null;         // UTC seconds, when the filing time is known
  session: "bmo" | "amc" | "dmh" | null;
  upcoming: boolean;
  source: "sec" | "calendar";
  period?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short"
});
function nyParts(ms: number) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), offsetHours: p.timeZoneName === "EDT" ? 4 : 5 };
}

/**
 * The real moment an 8-K was accepted, from EDGAR's acceptanceDateTime.
 *
 * EDGAR writes that field as New York time pushed forward by New York's
 * offset a second time, and labels it UTC. Measured 24 Oct 2026: Apple's
 * results 8-Ks (released at 4:30 p.m.) read 00:30Z in summer and 02:30Z in
 * winter, and JPMorgan's (released before 7 a.m.) 14:30Z and 16:41Z; taken as
 * UTC those would be 8:30 p.m. and 10:30 a.m. Subtracting the offset once
 * more gives 4:30 p.m. and 6:30 a.m., and the same rule fits both seasons.
 */
export function secMoment(acceptance: string): number | null {
  const raw = Date.parse(acceptance);
  if (!Number.isFinite(raw)) return null;
  const { offsetHours } = nyParts(raw - 4 * 3600000);
  return Math.floor((raw - offsetHours * 3600000) / 1000);
}

/** Before the open, after the close, or during the session, by New York clock. */
export function sessionAt(sec: number): "bmo" | "amc" | "dmh" {
  const { minutes } = nyParts(sec * 1000);
  if (minutes < 9 * 60 + 30) return "bmo";
  if (minutes >= 16 * 60) return "amc";
  return "dmh";
}

/**
 * The results announcements in an EDGAR submissions file's filing list
 * ("filings.recent", or one of its older pages): 8-Ks, and amendments,
 * carrying Item 2.02. One per day, oldest first.
 */
export function secReports(filings: any): Report[] {
  const forms: string[] = filings?.form || [];
  const items: string[] = filings?.items || [];
  const accepted: string[] = filings?.acceptanceDateTime || [];
  const filed: string[] = filings?.filingDate || [];
  const byDate = new Map<string, Report>();
  for (let i = 0; i < forms.length; i++) {
    if (!/^8-K/.test(forms[i] || "") || !String(items[i] || "").split(",").includes("2.02")) continue;
    const at = secMoment(accepted[i]);
    const date = at !== null ? nyParts(at * 1000).date : filed[i];
    if (!date || byDate.has(date)) continue;
    byDate.set(date, { date, at, session: at !== null ? sessionAt(at) : null, upcoming: false, source: "sec" });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const days = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const quarterEnded = (period: string) => {
  const [y, m, d] = period.split("-").map(Number);
  return y && m ? `quarter ended ${MONTHS[m - 1]} ${d}, ${y}` : "";
};

/**
 * Past reports with the provider's figures attached: a quarter's results
 * belong to the first report within 100 days after the quarter ended
 * (companies report within weeks; the SEC's deadline is 40 to 45 days), and a
 * calendar row to the report within three days of its date.
 */
export function withFigures(reports: Report[], surprises: any[], calendar: any[]): Report[] {
  return reports.map((r) => {
    const out = { ...r };
    const q = (Array.isArray(surprises) ? surprises : [])
      .filter((s) => s?.period && days(r.date, s.period) > 0 && days(r.date, s.period) <= 100)
      .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];
    if (q) {
      out.period = quarterEnded(q.period);
      out.epsActual = num(q.actual);
      out.epsEstimate = num(q.estimate);
    }
    const c = (Array.isArray(calendar) ? calendar : []).find((e) => e?.date && Math.abs(days(r.date, e.date)) <= 3);
    if (c) {
      out.epsActual ??= num(c.epsActual);
      out.epsEstimate ??= num(c.epsEstimate);
      out.revenueActual = num(c.revenueActual);
      out.revenueEstimate = num(c.revenueEstimate);
    }
    return out;
  });
}

/**
 * Every report to draw, oldest first: the filed ones; any past date the
 * cached calendar holds that the SEC does not (a foreign filer); and the next
 * scheduled report, with its estimate when the provider has one.
 */
export function earningsTimeline(sec: Report[], cached: { report_date: string; session: string | null }[], calendar: any[], today: string): Report[] {
  const out = [...sec];
  const near = (date: string) => out.some((r) => Math.abs(days(r.date, date)) <= 3);
  const session = (s: unknown) => (s === "bmo" || s === "amc" || s === "dmh" ? s : null);
  for (const row of [...cached].sort((a, b) => a.report_date.localeCompare(b.report_date))) {
    if (near(row.report_date)) continue;
    const upcoming = row.report_date >= today;
    if (upcoming && out.some((r) => r.upcoming)) continue; // the next report only
    const c = (Array.isArray(calendar) ? calendar : []).find((e) => e?.date && Math.abs(days(row.report_date, e.date)) <= 3);
    out.push({
      date: row.report_date, at: null, session: session(row.session) ?? session(c?.hour), upcoming, source: "calendar",
      epsActual: upcoming ? null : num(c?.epsActual), epsEstimate: num(c?.epsEstimate),
      revenueActual: upcoming ? null : num(c?.revenueActual), revenueEstimate: num(c?.revenueEstimate)
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** EDGAR's ten-digit CIK, from the SEC's ticker list ({ "0": { cik_str, ticker, title }, ... }). */
export function cikMap(list: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of Object.values(list || {}) as any[]) {
    if (!row?.ticker || !row?.cik_str) continue;
    // EDGAR writes class shares with a dash (BRK-B); Alpaca with a dot (BRK.B).
    const ticker = String(row.ticker).toUpperCase().replace(/-/g, ".");
    if (!out.has(ticker)) out.set(ticker, String(row.cik_str).padStart(10, "0"));
  }
  return out;
}
