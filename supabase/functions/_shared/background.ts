// Work that should outlive the response.
//
// The edge runtime tears an isolate down once its handler resolves, so a
// promise left running at that moment is killed wherever it happens to be —
// for a chunked write, partway through. `EdgeRuntime.waitUntil` keeps the
// isolate alive until the promise settles; the guard lets the same code run
// under bare Deno (tests, local `deno run`) where the global is absent.

/** Runs `work` to completion after the response is sent. Never throws. */
export function inBackground(work: Promise<unknown>): Promise<unknown> {
  const safe = work.catch(() => {});
  // @ts-ignore — supplied by the Supabase edge runtime, not by Deno itself.
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(safe);
  return safe;
}

/**
 * Waits up to `ms` for `work`, then gives up waiting — but lets it finish.
 *
 * Racing a promise against a timer only decides how long to *wait*; it does
 * nothing for the loser. Without registering the work first, timing out means
 * the response returns, the isolate is torn down, and the unfinished work is
 * killed wherever it happens to be. Registering first makes the timeout mean
 * "stop blocking on this", not "abandon it".
 */
export function awaitUpTo(work: Promise<unknown>, ms: number): Promise<unknown> {
  const safe = inBackground(work);
  return Promise.race([safe, new Promise((resolve) => setTimeout(resolve, ms))]);
}
