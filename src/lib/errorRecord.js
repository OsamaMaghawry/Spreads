// What a crash leaves behind.
//
// Pulled out of ErrorBoundary so it can be tested: this repo runs plain
// modules under node --test and cannot load JSX, and the part worth pinning
// is not the markup but the promise that a caught error is WRITTEN DOWN and
// that writing it down never throws again.
//
// The owner hit a blank white page trying to close a position and there was
// nothing to look at afterwards -- no message, no stack, no record. That is
// the gap this closes.

/** A plain, serialisable description of a caught render error. */
export function describeError(error, info = null, href = "") {
  return {
    message: String(error?.message ?? error ?? "Unknown error"),
    stack: String(error?.stack ?? ""),
    componentStack: String(info?.componentStack ?? ""),
    at: new Date().toISOString(),
    url: String(href || "")
  };
}

/**
 * Stash the description somewhere a person can read it back by hand.
 *
 * Returns the description either way. NEVER THROWS: a frozen or exotic window
 * must not turn the recording of an error into a second, uncaught error --
 * which would defeat the entire boundary and put the blank page back.
 */
export function recordError(error, info = null, win = undefined) {
  const target = win === undefined ? (typeof window === "undefined" ? null : window) : win;
  // READING the href is inside the try as well as writing the record. A test
  // with a throwing `location` getter caught this: the read sat outside, so a
  // hostile or half-torn-down window turned the act of recording a crash into
  // a second uncaught crash -- which is exactly the blank page again.
  let href = "";
  try {
    href = target?.location?.href || "";
  } catch {
    // Leave it empty; the message and stack matter more than the URL.
  }
  const record = describeError(error, info, href);
  try {
    if (target) target.__deltamintLastError = record;
  } catch {
    // Deliberately swallowed. See above.
  }
  return record;
}

/** The text behind "Copy error details", as one block a person can paste. */
export function errorReport(record) {
  return [
    `DeltaMint error: ${record.message}`,
    `Page: ${record.url}`,
    `When: ${record.at}`,
    "",
    record.stack,
    record.componentStack
  ].join("\n");
}
