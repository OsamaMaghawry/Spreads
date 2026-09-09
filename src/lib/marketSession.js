// Where the clock is relative to the US regular session, in UTC.
//
// The browser twin of sessionPhase in supabase/functions/_shared/watchRules.ts.
// Deliberately duplicated rather than shared: that module is Deno, imports with
// .ts extensions, and pulling it into the Vite bundle to save nine lines would
// couple the two runtimes for no gain. Both are tested against the same
// boundaries, and the boundaries are set by the exchange, not by us.
//
// Options do not trade outside 09:30-16:00 ET at all — there is no extended
// session for them. That is why this matters to the scanner: outside these
// hours the option chain is frozen at the previous close while the underlying
// keeps moving, so any spread priced off it is priced against a stock that has
// since moved on.
export function sessionPhase(now = new Date()) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return "closed";
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (mins < 13 * 60 + 30) return "pre";
  if (mins >= 20 * 60) return "post";
  return "open";
}

export const marketIsOpen = (now = new Date()) => sessionPhase(now) === "open";
