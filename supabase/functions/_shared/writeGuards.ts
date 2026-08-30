// The two rules that decide whether a sync is allowed to destroy something.
//
// They live here rather than in tradeHistory/index.ts because that module
// calls Deno.serve on import, and a guard nobody can run a test against is a
// guard that quietly stops working. Both are pure.

/**
 * A reconstruction that wants to remove most of what is stored is more likely
 * to be a defect than a correction -- a truncated broker feed, a
 * classification change, an outage returning a short page. Past this share of
 * the stored rows the sync refuses and a person decides.
 *
 * The floor keeps small accounts usable: removing 3 of 4 rows is 75% but it is
 * also three rows, and on a new account that is ordinary reconciliation.
 */
export const MAX_AUTO_DELETE_SHARE = 0.25;
export const MAX_AUTO_DELETE_FLOOR = 5;

export function refuseMassDelete(kind: string, removing: number, stored: number): string | null {
  if (removing <= MAX_AUTO_DELETE_FLOOR) return null;
  if (stored === 0 || removing / stored <= MAX_AUTO_DELETE_SHARE) return null;
  return `Refusing to remove ${removing} of ${stored} stored ${kind} in one sync ` +
    `(over ${Math.round(MAX_AUTO_DELETE_SHARE * 100)}%). Nothing was changed. ` +
    `Review the account's history before syncing again.`;
}

/**
 * Whether a stored share lot is one the reconstruction is entitled to remove.
 *
 * The reconstruction only derives lots an option delivered or took away, so
 * "anything not in the fresh set" includes every share the user ever bought or
 * sold ordinarily -- 1,119 of 1,123 lots on the staging account that has both.
 * Mirrors `fromOption` in tradeReconstruction.ts, which filters the fresh set
 * the same way; the two must agree or the sync deletes what it cannot rebuild.
 */
export const lotFromOption = (l: any): boolean =>
  l.acquired_source === "assignment" || l.acquired_source === "exercise" ||
  l.disposed_source === "assignment" || l.disposed_source === "exercise";
