// What a sync is allowed to destroy.
//
// This lives here rather than in tradeHistory/index.ts because that module
// calls Deno.serve on import, and a guard nobody can run a test against is a
// guard that quietly stops working. Pure.

// The mass-deletion rule USED TO LIVE HERE. It has moved to
// `_shared/integrity.ts`, with its thresholds, because it stopped being a
// refusal and became a finding: a sync that wants to remove most of a stored
// history now KEEPS those rows and writes everything else, rather than
// throwing away the whole update to protect them. Leaving a second copy of
// MAX_AUTO_DELETE_SHARE here is how two thresholds drift apart and a guard
// starts disagreeing with itself, so there is one copy and this note points
// at it.

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
