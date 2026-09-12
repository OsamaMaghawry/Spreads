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
  assert.equal(h.label, "Whole view · booked");
  assert.ok(h.note.includes("closed between 2026-09-05 and 2026-09-12"));
  assert.ok(h.note.includes("held today"));
  assert.ok(h.note.includes("-$176.00"));
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
  assert.ok(h.note.includes("closed in cash-secured puts"));
  assert.ok(h.note.includes("belongs to the account rather than to one strategy"));
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
  assert.ok(h.note.includes("closed in covered calls on or after 2026-09-05"));
  assert.ok(h.note.includes("belongs to the account"));
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
  assert.ok(!h.note.includes("marked at"));
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
  assert.equal(h.label, "Whole view · booked");
  assert.ok(h.note.includes("no price"));
  assert.ok(!h.note.includes("window"));
  assert.ok(!h.note.includes("This is what closed."));
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
