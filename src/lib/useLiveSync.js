import { useCallback, useEffect, useRef, useState } from "react";

// Keeping the screen current without a control that says how stale it is.
//
// The dashboard used to poll every sixty seconds behind an "Auto-refresh (60s)"
// checkbox. Sixty seconds is a long time on a position that is moving, and
// putting the number on screen only advertised the lag. The refresh stays; the
// control does not.
//
// It runs CONTINUOUSLY rather than on a fixed timer. syncAccounts makes several
// Alpaca calls per account and Alpaca rate-limits per key, so a naive one-second
// interval would stack requests faster than they return and earn a 429 inside a
// minute. Instead: never more than one sync in flight, the next scheduled from
// when the last one finished. That refreshes as fast as the broker will answer,
// which is the point, and cannot outrun it.
export const IDLE_MS = 1000;

// A rate limit is the broker telling us to slow down. Backing off and coming
// back is the only correct response; retrying at the same cadence turns a
// throttle into an outage for the account.
export const BACKOFF_MS = [5000, 15000, 30000, 60000];

const isRateLimited = (e) => {
  const s = e?.response?.status ?? e?.status;
  if (s === 429) return true;
  return /rate limit|too many requests|\b429\b/i.test(e?.message || "");
};

// load: an async function that refreshes whatever the page shows.
export default function useLiveSync(load) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const timer = useRef(null);
  const throttled = useRef(0);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async ({ manual = false } = {}) => {
    // The whole rate-limit defence in one line: a tick that arrives while a
    // sync is still running is dropped, not queued.
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setRefreshing(true);
    try {
      await loadRef.current();
      throttled.current = 0;
    } catch (e) {
      if (isRateLimited(e)) throttled.current = Math.min(throttled.current + 1, BACKOFF_MS.length);
    } finally {
      inFlight.current = false;
      if (manual && alive.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const schedule = () => {
      clearTimeout(timer.current);
      // A hidden tab is nobody looking at a price. Stopping is both cheaper and
      // kinder to the rate limit than refreshing into a background window.
      if (document.visibilityState === "hidden") return;
      const wait = throttled.current > 0 ? BACKOFF_MS[throttled.current - 1] : IDLE_MS;
      timer.current = setTimeout(async () => {
        await run();
        if (alive.current) schedule();
      }, wait);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Coming back to a tab should show now, not one interval from now.
        run().then(() => alive.current && schedule());
      } else {
        clearTimeout(timer.current);
      }
    };

    run().then(() => alive.current && schedule());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run]);

  return { refreshing, refresh: () => run({ manual: true }) };
}
