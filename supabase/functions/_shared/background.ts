// Work that should outlive the response.
//
// The edge runtime tears an isolate down once its handler resolves, so a
// promise left running at that moment is killed wherever it happens to be —
// for a chunked write, partway through. `EdgeRuntime.waitUntil` keeps the
// isolate alive until the promise settles; the guard lets the same code run
// under bare Deno (tests, local `deno run`) where the global is absent.

/** Runs `work` to completion after the response is sent. Never throws. */
export function inBackground(work: Promise<unknown>): void {
  const safe = work.catch(() => {});
  // @ts-ignore — supplied by the Supabase edge runtime, not by Deno itself.
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(safe);
}

/** Resolves with `work`, or after `ms`, whichever comes first. Never throws. */
export function withTimeout(work: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([
    work.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms))
  ]);
}
