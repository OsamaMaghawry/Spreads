import { invokeFunction } from "@/lib/functions";
export { settle } from "@/lib/terminal";

// The person's terminal settings, kept with their account (functions/terminal
// "prefs", table terminal_prefs) rather than only in this browser: the
// watchlist, each symbol's drawings, indicators, chart events and hotkeys.
//
// The owner, 25 Oct 2026: "The watchlist doesn't get saved after adding a new
// stock ... The chart drawings don't get saved when existing and come back."
// Both had lived in the browser alone, so another device, a private window or
// a cleared browser opened empty. The browser keeps its copy too, so the
// screen opens with the last settings at once and the account's copy follows.
//
// Writes go a moment after the last change (several quick edits are one
// save), and at once when the page is hidden or closed.

const DELAY = 700;
const pending = new Map();
let timer = null;

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending.size) return Promise.resolve();
  const entries = [...pending].map(([key, value]) => ({ key, value }));
  pending.clear();
  return invokeFunction("terminal", { action: "prefs", op: "set", entries }).catch(() => {
    // Not saved this time: keep the entries for the next attempt, unless newer ones arrived.
    for (const e of entries) if (!pending.has(e.key)) pending.set(e.key, e.value);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

/** Save a setting to the account, shortly. */
export function savePref(key, value) {
  pending.set(key, value);
  clearTimeout(timer);
  timer = setTimeout(flush, DELAY);
}

/** Read settings from the account: { key: value } for those it has. */
export async function readPrefs(keys) {
  const r = await invokeFunction("terminal", { action: "prefs", op: "get", keys });
  if (r?.data?.error || !r?.data?.prefs) throw new Error(r?.data?.error || "Settings could not be read.");
  return Object.fromEntries(Object.entries(r.data.prefs).map(([k, v]) => [k, v.value]));
}

export const flushPrefs = flush;

// One read for every setting asked for at the same moment: a page opening asks
// for a dozen, and they go as one request.
let wanted = null;
/** One setting from the account (undefined if it has none), read with any others asked for together. */
export function readPref(key) {
  if (!wanted) {
    wanted = new Map();
    setTimeout(() => {
      const batch = wanted;
      wanted = null;
      readPrefs([...batch.keys()])
        .then((prefs) => { for (const [k, waiters] of batch) waiters.forEach((w) => w.resolve(prefs[k])); })
        .catch((e) => { for (const waiters of batch.values()) waiters.forEach((w) => w.reject(e)); });
    }, 0);
  }
  return new Promise((resolve, reject) => {
    if (!wanted.has(key)) wanted.set(key, []);
    wanted.get(key).push({ resolve, reject });
  });
}
