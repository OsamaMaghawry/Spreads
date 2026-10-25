// News for the terminal (25 Oct 2026: "I want to add news tab per stock I am
// on or seeing whether Demo or Replay ... in the gap, I need to see if there
// was any piece of news was there"): the windows of time a screen asks
// about, what a replay may show, and the articles each symbol appears in.
// Pure, and tested (news.test.js). The articles are the account's own Alpaca
// news (functions/terminal "news"); components/terminal/NewsPanel.jsx draws
// them.

/** How the news service names a symbol: a coin's pair without the slash. */
export const newsSymbol = (s) => String(s || "").toUpperCase().replace("/", "");

/** A New York clock time on a date ("YYYY-MM-DD", "HH:MM"), as UTC seconds. */
export function nyAt(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.parse(`${date}T00:00:00Z`) / 1000 + (h + 4) * 3600 + m * 60;
  const hour = Number(new Date(guess * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }));
  return hour === h ? guess : guess + 3600;
}

const nyDate = (t) => new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const weekday = (d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());

/**
 * The news behind a past day's screen: from the previous session's close
 * (4:00 pm New York on `lastDate`) to that day's open, or to its close.
 */
export const gapWindow = (date, lastDate, asOf) => ({ start: nyAt(lastDate, "16:00"), end: nyAt(date, asOf === "close" ? "16:00" : "09:30") });

/** The live screen's: since the last weekday's close before today, until now. */
export function liveWindow(now = Date.now() / 1000) {
  const today = nyDate(now);
  let d = today;
  for (let back = 1; back < 8; back++) {
    d = nyDate(now - back * 86400);
    if (d !== today && weekday(d)) break;
  }
  return { start: nyAt(d, "16:00"), end: Math.floor(now) };
}

/** Each symbol's articles among them (an article naming several counts for each). */
export function bySymbol(articles, symbols) {
  const want = new Map(symbols.map((s) => [newsSymbol(s), s]));
  const out = Object.fromEntries(symbols.map((s) => [s, []]));
  for (const a of articles || []) {
    for (const tag of a.symbols || []) {
      const s = want.get(newsSymbol(tag));
      if (s && !out[s].includes(a)) out[s].push(a);
    }
  }
  return out;
}

const when = (a) => Date.parse(a.at) / 1000;

/** Several lists as one, each article once, newest first. */
export function mergeNews(...lists) {
  const seen = new Map();
  for (const list of lists) for (const a of list || []) if (a && !seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()].sort((x, y) => when(y) - when(x));
}

/** What a replay has reached: articles published before its moment, newest first. */
export const visibleAt = (items, cursor) => (cursor === null || cursor === undefined ? items : items.filter((a) => when(a) < cursor));

/** How long before `now` (UTC seconds) an article came out: "12m", "3h", "2d". */
export function ago(at, now) {
  const s = Math.max(0, now - Date.parse(at) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
