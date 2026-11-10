// Open interest for the admin terminal's gamma (10 Nov 2026, the owner: "I
// can't rely on these numbers", then "Yes, switch to Cboe for the admin
// terminal"). Alpaca's contracts carry open interest two sessions old in the
// morning (Tuesday shows Friday's); Cboe's delayed-quotes file
// (cdn.cboe.com/api/global/delayed_quotes/options/SYMBOL.json, public and
// undocumented, licensed for personal use only: never for paying users)
// carries the previous session's. Each contract takes Cboe's figure when the
// file has it, Alpaca's otherwise. Pure, and tested (openInterest.test.ts).

/** Cboe's file → open interest by OCC option symbol (e.g. QQQ261120P00680000); null when it holds none. */
export function cboeOpenInterest(body: any): Map<string, number> | null {
  const list = body?.data?.options;
  if (!Array.isArray(list)) return null;
  const out = new Map<string, number>();
  for (const o of list) {
    const sym = typeof o?.option === "string" ? o.option.trim() : "";
    const oi = Number(o?.open_interest);
    if (sym && Number.isFinite(oi) && oi >= 0) out.set(sym, Math.round(oi));
  }
  return out.size ? out : null;
}

export type Listed = { symbol: string; open_interest?: unknown; open_interest_date?: unknown };

const weekdayAfter = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
};

/**
 * Which open interest each listed contract uses, and the date it stands for.
 * Cboe's file states no date: when its figures differ from Alpaca's (more
 * than 2% of the contracts both have), it is a session newer, the first in
 * `sessions` (completed session dates, oldest first) after Alpaca's date, or
 * the weekday after it; when they match, it is Alpaca's date. When the file
 * covers under half the contracts, Alpaca's figures are used throughout.
 */
export function mergeOpenInterest(listed: Listed[], cboe: Map<string, number> | null, sessions: string[] = []) {
  const dates = new Map<string, number>();
  for (const c of listed) if (typeof c.open_interest_date === "string") dates.set(c.open_interest_date, (dates.get(c.open_interest_date) || 0) + 1);
  const alpacaDate = [...dates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const alpaca = (c: Listed) => Number(c.open_interest) || 0;
  let matched = 0;
  let differ = 0;
  if (cboe) {
    for (const c of listed) {
      const v = cboe.get(c.symbol);
      if (v === undefined) continue;
      matched += 1;
      if (v !== alpaca(c)) differ += 1;
    }
  }
  const use = !!cboe && listed.length > 0 && matched >= listed.length / 2;
  const newer = use && differ > matched * 0.02;
  const next = alpacaDate ? (sessions.find((d) => d > alpacaDate) || weekdayAfter(alpacaDate)) : null;
  const oiOf = (c: Listed) => (use ? (cboe!.get(c.symbol) ?? alpaca(c)) : alpaca(c));
  return {
    oiOf,
    source: use ? "cboe" : "alpaca",
    date: use && newer ? next : alpacaDate,
    alpacaDate,
    matched,
    differ
  };
}
