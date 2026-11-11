// The trading day's four sessions (10 Nov 2026, the owner: "certain stocks are
// traded 24 hours. So I need to make sure that every time or every session I
// can filter correctly ... I need it accurate"), from Alpaca's trading
// calendar, so holidays and early closes come out right. New York time:
//
//   overnight    the last trading day's extended close (20:00; 17:00 after an
//                early close) to 04:00. 24-hour venues (Blue Ocean, Alpaca's
//                "boats" feed), not on the consolidated tape. It belongs to the
//                trading day it leads into.
//   pre-market   04:00 to the open (09:30); the opening auction is the
//                regular session's.
//   regular      the open to the close (16:00; 13:00 on an early close). Its
//                volume includes the closing auction's minute; its high, low and
//                last stop before that minute, whose late prints are not prices
//                of the session (10 Nov, JHX: 27.84 in it against a 29.05 close).
//   after hours  the minute after the close to the extended close (20:00;
//                17:00 after an early close).
//
// Each session's change is measured against a regular session's official
// close (Alpaca's daily close, the closing auction's price): the day before's
// for overnight, pre-market and regular; the same day's for after hours.
// Pure, shared by the server and the screen, and tested (src/lib/sessions.test.js).

export const SESSION_KINDS = ["overnight", "premarket", "regular", "afterhours"];

/** A New York clock time on a date, as UTC milliseconds (summer and winter time). */
export function nyMs(date, hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const guess = Date.parse(`${date}T00:00:00Z`) + (h + 4) * 3600000 + m * 60000;
  const hour = Number(new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return hour === h ? guess : guess + 3600000;
}

const hm = (v, fallback) => {
  const s = String(v ?? "").replace(":", "");
  return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : fallback;
};

/** Alpaca's calendar (date, open, close, session_open, session_close) made plain, oldest first. */
export function calendarDays(list) {
  return (Array.isArray(list) ? list : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.date || "")))
    .map((d) => ({
      date: d.date, open: hm(d.open, "09:30"), close: hm(d.close, "16:00"),
      sessionOpen: hm(d.session_open ?? d.sessionOpen, "04:00"), sessionClose: hm(d.session_close ?? d.sessionClose, "20:00")
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every session of every trading day: { kind, date, from, to } (UTC ms, `to` exclusive). */
export function sessionWindows(days) {
  const out = [];
  days.forEach((d, i) => {
    const p = days[i - 1];
    if (p) out.push({ kind: "overnight", date: d.date, from: nyMs(p.date, p.sessionClose), to: nyMs(d.date, d.sessionOpen) });
    out.push({ kind: "premarket", date: d.date, from: nyMs(d.date, d.sessionOpen), to: nyMs(d.date, d.open) });
    out.push({ kind: "regular", date: d.date, from: nyMs(d.date, d.open), to: nyMs(d.date, d.close) + 60000, close: nyMs(d.date, d.close) });
    out.push({ kind: "afterhours", date: d.date, from: nyMs(d.date, d.close) + 60000, to: nyMs(d.date, d.sessionClose) });
  });
  return out;
}

/** The trading day before `date` in the calendar, or null. */
export function prevDay(days, date) {
  const i = days.findIndex((d) => d.date === date);
  return i > 0 ? days[i - 1].date : null;
}

/**
 * At `now`: each kind's latest session to have begun (live while it runs),
 * with the trading day its change is measured from (`refDate`); which session
 * is running (`current`, null while every market is shut); and when each kind
 * next begins (`next`, UTC ms), so a screen knows when to read again.
 */
export function latestSessions(days, now) {
  const all = sessionWindows(days);
  const out = { current: all.find((w) => w.from <= now && now < w.to)?.kind || null, next: {} };
  for (const kind of SESSION_KINDS) {
    const s = all.filter((w) => w.kind === kind && w.from <= now).sort((a, b) => b.from - a.from)[0] || null;
    out[kind] = s ? { ...s, live: now < s.to, refDate: kind === "afterhours" ? s.date : prevDay(days, s.date) } : null;
    out.next[kind] = all.filter((w) => w.kind === kind && w.from > now).sort((a, b) => a.from - b.from)[0]?.from ?? null;
  }
  return out;
}

/**
 * A session's figures from its one-minute candles ({ t, h, l, c, v }): volume,
 * high, low and last within it, and the close its change is measured from.
 * For the regular session, high, low and last stop at `s.close` (the closing
 * auction's minute counts in its volume only) and, once it is over, its last
 * is the official close (`officialClose`).
 */
export function sessionStats(bars, s, ref, officialClose = null) {
  const list = (Array.isArray(bars) ? bars : [])
    .filter((b) => b && Number.isFinite(b.c) && Date.parse(b.t) >= s.from && Date.parse(b.t) < s.to)
    .sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const priced = s.kind === "regular" ? list.filter((b) => Date.parse(b.t) < s.close) : list;
  const volume = list.reduce((a, b) => a + (Number.isFinite(b.v) ? b.v : 0), 0);
  const last = s.kind === "regular" && !s.live && officialClose > 0 ? officialClose : priced.at(-1)?.c ?? null;
  return {
    v: volume,
    h: priced.length ? Math.max(...priced.map((b) => b.h)) : null,
    l: priced.length ? Math.min(...priced.map((b) => b.l)) : null,
    last,
    ref: ref > 0 ? ref : null
  };
}

/** "Tue 11/10" for a session's day, in labels. */
export function dayTag(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "";
  const d = new Date(`${date}T12:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
