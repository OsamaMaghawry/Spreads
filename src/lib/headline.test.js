import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisHeadline } from "./headline.js";

// The account in the owner's screenshot: 20 closed trades booking $785.91 in
// the window, 100 TSLA shares marked -$206.00 and one long TSLA 370P marked
// +$30.00, so everything still open is worth -$176.00 now.
const booked = (total, withMark = false) => ({
  totalPL: total,
  includesUnrealized: withMark
});

test("unfiltered and fully priced, the figure is the total and says so", () => {
  const h = analysisHeadline({
    view: "whole",
    stats: booked(609.91, true),
    hasOpen: true,
    liveMark: -176,
    narrowing: {}
  });
  assert.equal(h.figure, 609.91);
  assert.equal(h.label, "Whole view total");
  assert.equal(h.note, null);
});

test("a date range shows the booked number, never a dash", () => {
  // The bug. This case rendered "—" with "No whole-account total while a
  // strategy tab or date range is set", on a page printing all three of its
  // parts immediately underneath.
  const h = analysisHeadline({
    view: "whole",
    stats: booked(785.91),
    hasOpen: true,
    liveMark: -176,
    narrowing: { when: "between 2026-09-05 and 2026-09-12" }
  });
  assert.equal(h.figure, 785.91);
  assert.ok(!/^—/.test(String(h.figure)));
  // ...and the label stops calling it a total, because the mark is not in it.
  assert.equal(h.label, "Realized P/L · whole view");
  assert.ok(h.note.includes("closed between 2026-09-05 and 2026-09-12 booked"));
  assert.ok(h.note.includes("held today"));
  assert.ok(h.note.includes("come to -$176.00 between them"));
});

test("a strategy tab gives the strategy's own reason, not the date one", () => {
  // "What is still open is held today, not inside that window" is false on a
  // tab with no date range, and on the cash-secured put tab it would read as a
  // claim that the open puts are not cash-secured puts.
  const h = analysisHeadline({
    view: "whole",
    stats: booked(1887.91),
    hasOpen: true,
    liveMark: -176,
    narrowing: { strategy: "cash-secured puts" }
  });
  assert.equal(h.figure, 1887.91);
  assert.ok(h.note.includes("closed in cash-secured puts booked"));
  assert.ok(h.note.includes("not split by strategy"));
  assert.ok(!h.note.includes("held today"));
});

test("both controls set: the strategy reason wins and both are named", () => {
  const h = analysisHeadline({
    view: "whole",
    stats: booked(100),
    hasOpen: true,
    liveMark: 0,
    narrowing: { strategy: "covered calls", when: "on or after 2026-09-05" }
  });
  assert.ok(h.note.includes("closed in covered calls on or after 2026-09-05 booked"));
  assert.ok(h.note.includes("not split by strategy"));
});

test("an unpriceable open position is said to be unpriceable, and the booked figure still shows", () => {
  const h = analysisHeadline({
    view: "whole",
    stats: booked(785.91),
    hasOpen: true,
    liveMark: null,
    narrowing: { when: "between 2026-09-05 and 2026-09-12" }
  });
  assert.equal(h.figure, 785.91);
  assert.ok(h.note.includes("no price"));
  assert.ok(!h.note.includes("come to"));
});

test("unfiltered and unpriceable invents no window to blame", () => {
  // The only route to a booked figure with no filter set. "Not inside that
  // window" would name a window the reader never chose.
  const h = analysisHeadline({
    view: "whole",
    stats: booked(609.91),
    hasOpen: true,
    liveMark: null,
    narrowing: {}
  });
  assert.equal(h.figure, 609.91);
  assert.equal(h.label, "Realized P/L · whole view");
  assert.ok(h.note.includes("no price"));
  assert.ok(!h.note.includes("window"));
  assert.ok(!/This is what the trades that closed\b/.test(h.note));
});

test("nothing open: booked money is the whole of it, and nothing is pointed at", () => {
  const h = analysisHeadline({
    view: "whole",
    stats: booked(785.91),
    hasOpen: false,
    liveMark: null,
    narrowing: { when: "between 2026-09-05 and 2026-09-12" }
  });
  assert.equal(h.figure, 785.91);
  assert.equal(h.note, null);
});

test("premium only is unchanged by any of it", () => {
  for (const narrowing of [{}, { strategy: "long calls" }, { when: "on or before 2026-09-12" }]) {
    const h = analysisHeadline({
      view: "premium",
      stats: booked(785.91),
      premium: -449,
      hasOpen: true,
      liveMark: -176,
      narrowing
    });
    assert.equal(h.figure, -449);
    assert.equal(h.label, "Premium only total");
    assert.equal(h.note, null);
  }
});

test("no rows at all is the one case with no figure", () => {
  const h = analysisHeadline({ view: "whole", stats: null, hasOpen: false, liveMark: null });
  assert.equal(h.figure, null);
});

test("a zero booked total is a figure, not a blank", () => {
  // `0` is falsy and this is exactly where a truthiness check would blank the
  // headline on an account that closed two trades that cancelled out.
  const h = analysisHeadline({
    view: "whole",
    stats: booked(0),
    hasOpen: true,
    liveMark: 42,
    narrowing: { when: "between 2026-09-05 and 2026-09-12" }
  });
  assert.equal(h.figure, 0);
});

// ---------------------------------------------------------------------------
// The windowed whole-book figure
//
// The owner, on Alton, filtered to the week of 7-11 September 2026:
//
//   *"When I filter to one week, only that chart says two thousand something,
//   but the whole stays seven hundred. So the whole now gives the entire
//   performance, and it is always all and cannot be filtered?"*
//
// Both numbers were right for what they measured and only one was labelled
// "whole view". The stored rows, from `account_equity_daily`:
//
//   4 Sep   premium_cum -757.00   shares_booked -817.00   performance -3405.00
//  11 Sep   premium_cum -1230.00  shares_booked  441.91   performance  -949.09
//
//   booked  = (-1230 + 441.91) - (-757 + -817) =  785.91
//   whole   =            -949.09 - (-3405.00)  = 2455.91
//   the gap =                                    1670.00  (the open book)
// ---------------------------------------------------------------------------

test("whole view, filtered to a week, prints what the whole book did", () => {
  const h = analysisHeadline({
    view: "whole",
    stats: { totalPL: 785.91, includesUnrealized: false },
    premium: -473,
    hasOpen: true,
    liveMark: -161,
    narrowing: { strategy: null, when: "between 2026-09-07 and 2026-09-11" },
    windowed: { figure: 2455.91, booked: 785.91 }
  });
  assert.equal(h.figure, 2455.91);
  assert.equal(h.label, "Whole view total");
  // The note has to show the reader BOTH halves, because the old number is the
  // one they have been looking at and it has not gone anywhere.
  assert.match(h.note, /\$785\.91 booked/);
  assert.match(h.note, /\$1,670\.00 of change in what was still open/);
  assert.match(h.note, /the figure the chart draws/);
});

test("premium view is untouched by it — it never had a mark to miss", () => {
  const h = analysisHeadline({
    view: "premium", stats: { totalPL: 1 }, premium: -473, hasOpen: true, liveMark: 0,
    windowed: { figure: 2455.91, booked: 785.91 }
  });
  assert.equal(h.figure, -473);
  assert.equal(h.label, "Premium only total");
});

test("no window, no windowed figure: today's live mark is the better answer", () => {
  // Unfiltered, the page already adds the mark on what is open NOW, which
  // belongs to no window and is the more current answer to "where do I stand".
  const h = analysisHeadline({
    view: "whole",
    stats: { totalPL: 1234.5, includesUnrealized: true },
    premium: 0, hasOpen: true, liveMark: 100,
    windowed: null
  });
  assert.equal(h.figure, 1234.5);
  assert.equal(h.label, "Whole view total");
  assert.equal(h.note, null);
});

test("a window whose baseline could not be valued falls back, never guesses", () => {
  // The caller passes null when `baselineKnown` is false. Without that the
  // window would be credited with the whole of the account's history.
  const h = analysisHeadline({
    view: "whole",
    stats: { totalPL: 785.91, includesUnrealized: false },
    premium: 0, hasOpen: true, liveMark: -161,
    narrowing: { strategy: null, when: "between 2026-09-07 and 2026-09-11" },
    windowed: null
  });
  assert.equal(h.figure, 785.91);
  assert.match(h.label, /Realized P\/L/);
});

test("a week the open book LOST is shown as the loss it was", () => {
  // The mirror case, so the note cannot be written for a recovery only.
  const h = analysisHeadline({
    view: "whole", stats: { totalPL: 500, includesUnrealized: false },
    premium: 0, hasOpen: true, liveMark: -900,
    narrowing: { strategy: null, when: "last week" },
    windowed: { figure: -1200, booked: 500 }
  });
  assert.equal(h.figure, -1200);
  assert.match(h.note, /-\$1,700\.00 of change in what was still open/);
});
