// Whether stored trade history must be rebuilt before it is served.
//
// Time alone was the rule: rebuild when the last sync is over 15 minutes old.
// That left a hole the size of whatever was just traded. On 9 Oct the owner
// sold a long TSLA put (synced 3:48 pm) and then the 100 shares (3:52 pm).
// Open positions are read live, so the shares and their gain left the page at
// once; the sale was not in the closed trades until the next sync, and the
// Analysis total dropped by the shares' gain in between. "Extremely
// decreased", and correctly suspected: "the sale of the stock itself is not
// included".
//
// So a fill, expiry, assignment or exercise at the broker newer than both the
// last sync and the last attempt makes the store stale whatever the clock
// says. Newer than the last ATTEMPT too, so a failing sync is retried once per
// new event, not once per page view.

export function syncDue({ now, syncedAt, attemptedAt, lastActivityAt = 0, staleAfterMs }: {
  now: number;
  syncedAt: number;
  attemptedAt: number;
  lastActivityAt?: number;
  staleAfterMs: number;
}): boolean {
  if (lastActivityAt > 0 && lastActivityAt > syncedAt && lastActivityAt > attemptedAt) return true;
  const dueForRetry = now - attemptedAt > staleAfterMs;
  return (!syncedAt || now - syncedAt > staleAfterMs) && dueForRetry;
}

// When a broker activity happened. A fill carries transaction_time; an expiry
// or assignment carries only the day it settled and when it was written.
export function activityTime(a: any): number {
  const t = Date.parse(a?.transaction_time || a?.created_at || a?.date || "");
  return Number.isFinite(t) ? t : 0;
}
