// The time on an EODHD real-time message, in milliseconds.
//
// EODHD's stream gave `t` in milliseconds; on 2 Nov 2026 it came as a
// nanosecond-sized figure (1793628835059200000) that, read as nanoseconds,
// lands about 30 minutes ahead of the clock: milliseconds × 1,000,001. Read
// as milliseconds it is no date at all, and the relay threw on every trade
// and quote ("RangeError: Invalid time value"), so the live tape and chart
// stopped. So each plausible reading is tried and the one within two minutes
// of now is taken; with none, the moment the message came (it is a live
// stream, about a second behind).
const NEAR_MS = 120000;

export function eodhdTime(t: unknown, now = Date.now()): number {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return now;
  const readings = n > 1e17 ? [n / 1e6, n / 1000001] : n > 1e14 ? [n / 1e3] : n > 1e11 ? [n] : [n * 1000];
  const near = readings.find((ms) => Math.abs(ms - now) < NEAR_MS);
  return Math.round(near ?? now);
}

export const eodhdIso = (t: unknown, now = Date.now()) => new Date(eodhdTime(t, now)).toISOString();
