// The New York Stock Exchange's full-day closures, worked out by rule for any
// year, so the terminal's clocks know the nights Alpaca runs no overnight
// session (head-of-trading W46-F1: the overnight clock opened Wed 25 Nov 2026
// 20:00, Thanksgiving eve, when Alpaca's overnight venue is shut; also Thu 24
// Dec, Thu 31 Dec and Sun 17 Jan 2027). Shared by the browser
// (src/lib/terminal.js) and functions/terminal (positionTools.ts).
//
// The rules (NYSE Rule 7.2): New Year's Day, Martin Luther King Jr. Day (third
// Monday of January), Washington's Birthday (third Monday of February), Good
// Friday, Memorial Day (last Monday of May), Juneteenth, Independence Day,
// Labor Day (first Monday of September), Thanksgiving (fourth Thursday of
// November) and Christmas. A fixed-date holiday on a Saturday is kept on the
// Friday before and on a Sunday on the Monday after, except New Year's Day on
// a Saturday, which is not kept at all. Closures the exchange announces at
// short notice (a national day of mourning) cannot be known here.

const weekdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday

/** The day of the month of the n-th `weekday` (0 Sunday) of a month; n = -1 for the last. */
function nthWeekday(y, m, weekday, n) {
  if (n > 0) return 1 + ((weekday - weekdayOf(y, m, 1) + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((weekdayOf(y, m, last) - weekday + 7) % 7);
}

/** Easter Sunday (the Gregorian computus): [month, day]. */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}

/** A fixed-date holiday moved off the weekend: "YYYY-MM-DD", or null when not kept. */
export function observed(y, m, d, keepSaturday = true) {
  const w = weekdayOf(y, m, d);
  if (w === 6 && !keepSaturday) return null;
  const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
  return t.toISOString().slice(0, 10);
}

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const cache = new Map();

/** The exchange's full-day closures in a year, as "YYYY-MM-DD". */
export function nyseHolidays(y) {
  if (cache.has(y)) return cache.get(y);
  const [em, ed] = easter(y);
  const list = [
    observed(y, 1, 1, false),
    iso(y, 1, nthWeekday(y, 1, 1, 3)),
    iso(y, 2, nthWeekday(y, 2, 1, 3)),
    iso(y, em, ed - 2),
    iso(y, 5, nthWeekday(y, 5, 1, -1)),
    y >= 2022 ? observed(y, 6, 19) : null,
    observed(y, 7, 4),
    iso(y, 9, nthWeekday(y, 9, 1, 1)),
    iso(y, 11, nthWeekday(y, 11, 4, 4)),
    observed(y, 12, 25)
  ].filter(Boolean);
  const set = new Set(list);
  cache.set(y, set);
  return set;
}

/** Whether "YYYY-MM-DD" is a day the US share market trades: a weekday that is not a full holiday. */
export function isTradingDay(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  const w = weekdayOf(y, m, d);
  return w !== 0 && w !== 6 && !nyseHolidays(y).has(iso(y, m, d));
}

/**
 * Whether a New York date and minute of the day ("YYYY-MM-DD", 0 to 1439) is
 * in Alpaca's overnight session: 20:00 to 4:00, the night before a trading
 * day. From 20:00 it belongs to the next day, before 4:00 to the same day; so
 * Sunday night to Friday morning, and never the night before a full holiday.
 */
export function overnightAt(day, minutes) {
  if (minutes >= 4 * 60 && minutes < 20 * 60) return false;
  if (minutes < 4 * 60) return isTradingDay(day);
  const [y, m, d] = String(day).split("-").map(Number);
  return isTradingDay(iso(y, m, d + 1));
}
