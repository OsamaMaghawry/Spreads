import { useCallback, useEffect, useRef, useState } from "react";
import { readPref, savePref } from "@/lib/terminalPrefs";

// A terminal setting kept with the person's account (terminal_prefs, through
// lib/terminalPrefs.js), with this browser's copy shown at once until the
// account's arrives. The owner, 27 Oct: "I said before account not browser".
// The account's copy wins when it has one; a setting this browser had before
// the account did is sent up; a change made before the account answers is
// kept and saved.
//
// `localKey`: this browser's copy (kept as it always was, so nothing set
// before is lost); `initial()`: the value with neither; `clean`: what any
// stored value must pass; `fromLocal`/`toLocal`: the browser copy's format.
const local = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } }
};
const parse = (raw) => { try { return JSON.parse(raw); } catch { return undefined; } };

export default function useAccountSetting(key, { localKey, initial, clean = (v) => v, fromLocal = parse, toLocal = JSON.stringify }) {
  const had = useRef(null);
  const [value, setState] = useState(() => {
    const raw = local.get(localKey);
    had.current = raw !== null;
    const v = raw === null ? undefined : fromLocal(raw);
    return v === undefined || v === null ? initial() : clean(v);
  });
  const ref = useRef(value);
  ref.current = value;
  const touched = useRef(false);
  const synced = useRef(false);
  useEffect(() => {
    let alive = true;
    readPref(key).then((fromAccount) => {
      if (!alive) return;
      synced.current = true;
      if (touched.current) return;
      if (fromAccount !== undefined && fromAccount !== null) {
        const v = clean(fromAccount);
        setState(v);
        local.set(localKey, toLocal(v));
      } else if (had.current) savePref(key, ref.current);
    }).catch(() => { synced.current = true; });
    return () => { alive = false; };
  }, [key]);
  // `touch: false` for a change the page makes by itself (a grid settling
  // its windows, say): kept on screen, but saved only once the account's copy
  // has been read, so it never overwrites that copy unseen.
  const set = useCallback((next, { touch = true } = {}) => {
    if (touch) touched.current = true;
    setState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      local.set(localKey, toLocal(v));
      if (touch || synced.current) savePref(key, v);
      return v;
    });
  }, [key, localKey]);
  return [value, set];
}
