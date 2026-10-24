// Events on the terminal chart: a company's earnings reports, and the US
// economic releases that move the whole market.
//
// The owner, 24 Oct 2026: "I want to add to the chart earnings sign or
// something. key major announcements, CPI, PMI, FOMC etc... Having the option
// to add them or hide them."
//
// The economic calendar below is the agencies' own published schedule, copied
// here with the source of each line, because none of them offers it in a form
// the app can read on its own (the BLS refuses automated requests outright).
// Dates after a government shutdown are the revised ones the agency announced,
// not the original schedule. Times are New York time. Nothing here is a
// forecast or a reading; it says when, not what.
//
// Sources, read 24 Oct 2026:
//   FOMC: federalreserve.gov/monetarypolicy/fomccalendars.htm (decisions at
//     2:00 p.m. on the second day; minutes three weeks later, 2:00 p.m.)
//   CPI, jobs, PPI: bls.gov/schedule and bls.gov/bls/2025-lapse-revised-release-dates.htm
//   GDP, PCE: BEA release calendar (bea.gov/news/schedule, its .ics feed)
//   Retail sales: Census economic indicator calendar (census.gov/economic-indicators)
//   ISM PMI: ISM's rule, first (manufacturing) and third (services) business
//     day at 10:00 a.m., with ISM's own January holiday (ismworld.org)
// The list runs to the end of 2026 (FOMC, GDP and PCE further); it needs the
// next year's schedules added each winter, when the agencies publish them.

export const EVENT_KINDS = [
  { id: "earnings", label: "E", name: "Earnings", color: "#2563eb" },
  { id: "fomc", label: "FOMC", name: "Fed rate decision and minutes", color: "#b45309" },
  { id: "cpi", label: "CPI", name: "Consumer prices (CPI)", color: "#be123c" },
  { id: "jobs", label: "NFP", name: "Jobs report (payrolls)", color: "#7c3aed" },
  { id: "pmi", label: "PMI", name: "ISM manufacturing and services PMI", color: "#0f766e" },
  { id: "ppi", label: "PPI", name: "Producer prices (PPI)", color: "#db2777" },
  { id: "pce", label: "PCE", name: "PCE inflation (personal income and outlays)", color: "#c2410c" },
  { id: "gdp", label: "GDP", name: "GDP, first estimate", color: "#0369a1" },
  { id: "retail", label: "RS", name: "Retail sales", color: "#4d7c0f" }
];
const KIND = Object.fromEntries(EVENT_KINDS.map((k) => [k.id, k]));
// On until hidden: what the owner named, plus the jobs report.
export const DEFAULT_SHOWN = ["earnings", "fomc", "cpi", "jobs", "pmi"];

// [release date, what it covers]
const SCHEDULE = {
  fomcDecision: {
    time: "14:00",
    dates: [
      ["2024-01-31"], ["2024-03-20", "with projections"], ["2024-05-01"], ["2024-06-12", "with projections"],
      ["2024-07-31"], ["2024-09-18", "with projections"], ["2024-11-07"], ["2024-12-18", "with projections"],
      ["2025-01-29"], ["2025-03-19", "with projections"], ["2025-05-07"], ["2025-06-18", "with projections"],
      ["2025-07-30"], ["2025-09-17", "with projections"], ["2025-10-29"], ["2025-12-10", "with projections"],
      ["2026-01-28"], ["2026-03-18", "with projections"], ["2026-04-29"], ["2026-06-17", "with projections"],
      ["2026-07-29"], ["2026-09-16", "with projections"], ["2026-10-28"], ["2026-12-09", "with projections"],
      ["2027-01-27"], ["2027-03-17", "with projections"], ["2027-04-28"], ["2027-06-09", "with projections"],
      ["2027-07-28"], ["2027-09-15", "with projections"], ["2027-10-27"], ["2027-12-08", "with projections"]
    ]
  },
  fomcMinutes: {
    time: "14:00",
    dates: [
      ["2025-02-19", "January meeting"], ["2025-04-09", "March meeting"], ["2025-05-28", "May meeting"], ["2025-07-09", "June meeting"],
      ["2025-08-20", "July meeting"], ["2025-10-08", "September meeting"], ["2025-11-19", "October meeting"], ["2025-12-30", "December meeting"],
      ["2026-02-18", "January meeting"], ["2026-04-08", "March meeting"], ["2026-05-20", "April meeting"], ["2026-07-08", "June meeting"],
      ["2026-08-19", "July meeting"], ["2026-10-07", "September meeting"]
    ]
  },
  cpi: {
    time: "08:30",
    dates: [
      ["2025-01-15", "Dec 2024"], ["2025-02-12", "Jan 2025"], ["2025-03-12", "Feb 2025"], ["2025-04-10", "Mar 2025"],
      ["2025-05-13", "Apr 2025"], ["2025-06-11", "May 2025"], ["2025-07-15", "Jun 2025"], ["2025-08-12", "Jul 2025"],
      ["2025-09-11", "Aug 2025"], ["2025-10-24", "Sep 2025, delayed by the shutdown"], ["2025-12-18", "Nov 2025 (October was not published)"],
      ["2026-01-13", "Dec 2025"], ["2026-02-13", "Jan 2026, moved by the funding lapse"], ["2026-03-11", "Feb 2026"], ["2026-04-10", "Mar 2026"],
      ["2026-05-12", "Apr 2026"], ["2026-06-10", "May 2026"], ["2026-07-14", "Jun 2026"], ["2026-08-12", "Jul 2026"],
      ["2026-09-11", "Aug 2026"], ["2026-10-14", "Sep 2026"], ["2026-11-10", "Oct 2026"], ["2026-12-10", "Nov 2026"]
    ]
  },
  jobs: {
    time: "08:30",
    dates: [
      ["2025-01-10", "Dec 2024"], ["2025-02-07", "Jan 2025"], ["2025-03-07", "Feb 2025"], ["2025-04-04", "Mar 2025"],
      ["2025-05-02", "Apr 2025"], ["2025-06-06", "May 2025"], ["2025-07-03", "Jun 2025"], ["2025-08-01", "Jul 2025"],
      ["2025-09-05", "Aug 2025"], ["2025-11-20", "Sep 2025, delayed by the shutdown"], ["2025-12-16", "Oct and Nov 2025"],
      ["2026-01-09", "Dec 2025"], ["2026-02-11", "Jan 2026, moved by the funding lapse"], ["2026-03-06", "Feb 2026"], ["2026-04-03", "Mar 2026"],
      ["2026-05-08", "Apr 2026"], ["2026-06-05", "May 2026"], ["2026-07-02", "Jun 2026"], ["2026-08-07", "Jul 2026"],
      ["2026-09-04", "Aug 2026"], ["2026-10-02", "Sep 2026"], ["2026-11-06", "Oct 2026"], ["2026-12-04", "Nov 2026"]
    ]
  },
  ppi: {
    time: "08:30",
    dates: [
      ["2025-01-14", "Dec 2024"], ["2025-02-13", "Jan 2025"], ["2025-03-13", "Feb 2025"], ["2025-04-11", "Mar 2025"],
      ["2025-05-15", "Apr 2025"], ["2025-06-12", "May 2025"], ["2025-07-16", "Jun 2025"], ["2025-08-14", "Jul 2025"],
      ["2025-09-10", "Aug 2025"], ["2025-11-25", "Sep 2025, delayed by the shutdown"],
      ["2026-01-14", "Oct and Nov 2025"], ["2026-01-30", "Dec 2025"], ["2026-02-27", "Jan 2026"], ["2026-03-18", "Feb 2026"],
      ["2026-04-14", "Mar 2026"], ["2026-05-13", "Apr 2026"], ["2026-06-11", "May 2026"], ["2026-07-15", "Jun 2026"],
      ["2026-08-13", "Jul 2026"], ["2026-09-10", "Aug 2026"], ["2026-10-15", "Sep 2026"], ["2026-11-13", "Oct 2026"],
      ["2026-12-15", "Nov 2026"]
    ]
  },
  pce: {
    time: "08:30",
    dates: [
      ["2025-01-31", "Dec 2024"], ["2025-02-28", "Jan 2025"], ["2025-03-28", "Feb 2025"], ["2025-04-30", "Mar 2025", "10:00"],
      ["2025-05-30", "Apr 2025"], ["2025-06-27", "May 2025"], ["2025-07-31", "Jun 2025"], ["2025-08-29", "Jul 2025"],
      ["2025-09-26", "Aug 2025"], ["2025-12-05", "Sep 2025, delayed by the shutdown", "10:00"], ["2026-01-22", "Oct and Nov 2025", "10:00"],
      ["2026-02-20", "Dec 2025"], ["2026-03-13", "Jan 2026"], ["2026-04-09", "Feb 2026"], ["2026-04-30", "Mar 2026"],
      ["2026-05-28", "Apr 2026"], ["2026-06-25", "May 2026"], ["2026-07-30", "Jun 2026"], ["2026-08-26", "Jul 2026"],
      ["2026-09-30", "Aug 2026"], ["2026-10-29", "Sep 2026"], ["2026-11-25", "Oct 2026"], ["2026-12-23", "Nov 2026"],
      ["2027-01-28", "Dec 2026"], ["2027-02-25", "Jan 2027"], ["2027-03-31", "Feb 2027"], ["2027-04-29", "Mar 2027"]
    ]
  },
  gdp: {
    time: "08:30",
    dates: [
      ["2025-01-30", "Q4 2024"], ["2025-04-30", "Q1 2025"], ["2025-07-30", "Q2 2025"], ["2025-12-23", "Q3 2025, delayed by the shutdown"],
      ["2026-02-20", "Q4 2025"], ["2026-04-30", "Q1 2026"], ["2026-07-30", "Q2 2026"], ["2026-10-29", "Q3 2026"],
      ["2027-01-28", "Q4 2026"], ["2027-04-29", "Q1 2027"]
    ]
  },
  retail: {
    time: "08:30",
    dates: [
      ["2025-01-16", "Dec 2024"], ["2025-02-14", "Jan 2025"], ["2025-03-17", "Feb 2025"], ["2025-04-16", "Mar 2025"],
      ["2025-05-15", "Apr 2025"], ["2025-06-17", "May 2025"], ["2025-07-17", "Jun 2025"], ["2025-08-15", "Jul 2025"],
      ["2025-09-16", "Aug 2025"], ["2025-11-25", "Sep 2025, delayed by the shutdown"], ["2025-12-16", "Oct 2025"],
      ["2026-01-14", "Nov 2025"], ["2026-02-10", "Dec 2025"], ["2026-03-06", "Jan 2026"], ["2026-04-01", "Feb 2026"],
      ["2026-04-21", "Mar 2026"], ["2026-05-14", "Apr 2026"], ["2026-06-17", "May 2026"], ["2026-07-16", "Jun 2026"],
      ["2026-08-14", "Jul 2026"], ["2026-09-16", "Aug 2026"], ["2026-10-15", "Sep 2026"], ["2026-11-17", "Oct 2026"],
      ["2026-12-16", "Nov 2026"], ["2027-01-15", "Dec 2026"], ["2027-02-17", "Jan 2027"], ["2027-03-16", "Feb 2027"],
      ["2027-04-16", "Mar 2027"]
    ]
  }
};
export const ECON_THROUGH = "2026-12-31";

/** A New York wall-clock time on a date ("2026-10-28", "14:00"), as UTC seconds. */
export function nyTime(date, hhmm = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  // New York is four hours behind UTC in summer and five in winter: try four,
  // and keep it if that moment does read as this wall-clock time there.
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, hh + off, mm) / 1000;
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t * 1000));
    if (p === `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) return t;
  }
  return Date.UTC(y, m - 1, d, hh + 5, mm) / 1000;
}

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// The holidays that can fall in the first days of a month: New Year's Day,
// ISM's own 2 January, Independence Day (as observed) and Labor Day. Nothing
// else lands early enough to move a PMI release.
function earlyHoliday(y, m, d, weekday) {
  if (m === 1 && (d === 1 || d === 2)) return true;
  if (m === 7 && (d === 4 || (d === 3 && weekday === 5) || (d === 5 && weekday === 1))) return true;
  if (m === 9 && weekday === 1 && d <= 7) return true;
  return false;
}

/** ISM's release days for a month: [manufacturing, services] as dates. */
export function ismDays(year, month) {
  const days = [];
  for (let d = 1; days.length < 3 && d <= 10; d++) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (weekday === 0 || weekday === 6 || earlyHoliday(year, month, d, weekday)) continue;
    days.push(ymd(year, month, d));
  }
  return [days[0], days[2]];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Every economic release on the calendar, oldest first. */
export function econEvents() {
  const out = [];
  const add = (kind, title, date, time, detail) => out.push({
    id: `${kind}:${title}:${date}`, kind, title, date, clock: time, time: nyTime(date, time), detail: detail || ""
  });
  for (const [date, note] of SCHEDULE.fomcDecision.dates) add("fomc", "FOMC rate decision", date, SCHEDULE.fomcDecision.time, note ? `Statement ${note}; press conference 2:30 p.m.` : "Statement; press conference 2:30 p.m.");
  for (const [date, note] of SCHEDULE.fomcMinutes.dates) add("fomc", "FOMC minutes", date, SCHEDULE.fomcMinutes.time, `Minutes of the ${note}`);
  const monthly = [["cpi", "CPI"], ["jobs", "Jobs report"], ["ppi", "PPI"], ["pce", "PCE (personal income and outlays)"], ["gdp", "GDP, first estimate"], ["retail", "Retail sales"]];
  for (const [kind, title] of monthly) {
    for (const [date, period, time] of SCHEDULE[kind].dates) add(kind, title, date, time || SCHEDULE[kind].time, period);
  }
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const [mfg, svc] = ismDays(y, m);
      const covers = `${MONTHS[(m + 10) % 12]} ${m === 1 ? y - 1 : y}`;
      add("pmi", "ISM manufacturing PMI", mfg, "10:00", covers);
      add("pmi", "ISM services PMI", svc, "10:00", covers);
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

// ---------- earnings ----------

const SESSION_CLOCK = { bmo: "08:00", amc: "16:05", dmh: "12:00" };
export const SESSION_WORDS = { bmo: "before the open", amc: "after the close", dmh: "during market hours" };

const money = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${v.toFixed(2)}`);

/**
 * A report from functions/terminal (action "events") as a chart event. A
 * past report carries the moment its results were filed with the SEC; an
 * upcoming one has only a date and, usually, before the open or after the
 * close, so it is placed at that part of the day.
 */
export function earningsEvent(r) {
  const time = Number.isFinite(r.at) ? r.at : nyTime(r.date, SESSION_CLOCK[r.session] || "12:00");
  const lines = [];
  if (r.epsActual !== null && r.epsActual !== undefined) {
    const surprise = r.epsEstimate ? (r.epsActual - r.epsEstimate) / Math.abs(r.epsEstimate) : null;
    lines.push(`EPS ${r.epsActual.toFixed(2)}${r.epsEstimate !== null && r.epsEstimate !== undefined ? ` vs ${r.epsEstimate.toFixed(2)} expected` : ""}${surprise !== null ? ` (${surprise >= 0 ? "+" : ""}${(surprise * 100).toFixed(1)}%)` : ""}`);
  } else if (r.epsEstimate !== null && r.epsEstimate !== undefined) {
    lines.push(`EPS expected ${r.epsEstimate.toFixed(2)}`);
  }
  if (money(r.revenueActual)) lines.push(`Revenue ${money(r.revenueActual)}${money(r.revenueEstimate) ? ` vs ${money(r.revenueEstimate)} expected` : ""}`);
  else if (money(r.revenueEstimate)) lines.push(`Revenue expected ${money(r.revenueEstimate)}`);
  return {
    id: `earnings:${r.date}`, kind: "earnings", title: r.upcoming ? "Earnings (scheduled)" : "Earnings",
    date: r.date, time, upcoming: !!r.upcoming,
    clock: r.session ? SESSION_WORDS[r.session] : "", period: r.period || "", detail: lines.join(" · ")
  };
}

// ---------- on the chart ----------

/**
 * Where an event sits among the candles, as a bar position: on the candle
 * whose time it falls in; in a gap (an 8:30 release on a regular-hours chart,
 * results after the close), on the next candle, where the market first
 * trades on it; after the last candle, in the space to the right at one bar
 * per step. Null when it comes before the first candle.
 */
export function eventSlot(times, t, step) {
  const n = times.length;
  if (!n || t < times[0]) return null;
  if (t >= times[n - 1] + step) return n - 1 + Math.max(1, Math.floor((t - times[n - 1]) / step));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return t < times[lo] + step ? lo : lo + 1;
}

/** The events to draw: the kinds shown, each with its slot and its badge. */
export function placeEvents(events, shown, times, step) {
  const on = new Set(shown);
  const out = [];
  for (const e of events) {
    if (!on.has(e.kind)) continue;
    const slot = eventSlot(times, e.time, step);
    if (slot === null) continue;
    const k = KIND[e.kind];
    out.push({ ...e, slot, label: k.label, color: k.color });
  }
  return out;
}

export const BADGE_H = 15;
const BADGE_GAP = 2;
const ROWS = 3;
export const badgeWidth = (label) => Math.max(BADGE_H, label.length * 6 + 8);

/**
 * Badges along the foot of the price pane, as TradingView draws them: one per
 * event, left to right; one that would overlap the badge before it goes up a
 * row, up to three rows; past that, a dot on the bottom row, so a crowded,
 * zoomed-out chart still shows something there.
 */
export function badgeLayout(placed, xOf, paneHeight) {
  const rowsEnd = Array(ROWS).fill(-Infinity);
  const out = [];
  const sorted = placed.map((e) => ({ e, x: xOf(e.slot) })).filter((p) => p.x !== null && Number.isFinite(p.x)).sort((a, b) => a.x - b.x);
  for (const { e, x } of sorted) {
    const w = badgeWidth(e.label);
    const left = x - w / 2;
    const row = rowsEnd.findIndex((end) => left >= end + BADGE_GAP);
    const base = paneHeight - 4 - BADGE_H;
    if (row === -1) {
      out.push({ event: e, x, y: base + BADGE_H / 2 - 3, w: 6, h: 6, dot: true });
      continue;
    }
    rowsEnd[row] = left + w;
    out.push({ event: e, x: left, y: base - row * (BADGE_H + BADGE_GAP), w, h: BADGE_H, dot: false });
  }
  return out;
}

/** The badge under the pointer, if any (a dot counts with a little room). */
export function badgeAt(badges, x, y) {
  for (let i = badges.length - 1; i >= 0; i--) {
    const b = badges[i];
    if (b.dot) {
      if (Math.abs(x - b.x) <= 5 && y >= b.y - 3 && y <= b.y + b.h + 3) return b;
    } else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return b;
    }
  }
  return null;
}

/** The kinds shown, as saved in this browser; unknown names dropped. */
export function cleanShown(list) {
  if (!Array.isArray(list)) return [...DEFAULT_SHOWN];
  const known = new Set(EVENT_KINDS.map((k) => k.id));
  return [...new Set(list.filter((k) => known.has(k)))];
}

/** The next event of each kind from now, for the events menu. */
export function nextOfEach(events, now = Date.now() / 1000) {
  const next = {};
  for (const e of events) {
    if (e.time < now - 60) continue;
    if (!next[e.kind] || e.time < next[e.kind].time) next[e.kind] = e;
  }
  return next;
}

/** "Wed 28 Oct, 14:00" in New York time, or the date alone. */
export function eventWhen(e) {
  const d = new Date(e.time * 1000);
  const day = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (e.kind === "earnings") return e.clock ? `${day}, ${e.clock}` : day;
  return `${day}, ${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} New York`;
}
