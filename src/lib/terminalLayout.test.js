import test from "node:test";
import assert from "node:assert/strict";
import { cleanLayouts, DEFAULT_LAYOUTS, PANELS, rowHeightFor, COLS, BREAKPOINTS, fromFirstVersion } from "./terminalLayout.js";

test("every window is in every default arrangement, once, inside the grid", () => {
  for (const [bp, list] of Object.entries(DEFAULT_LAYOUTS)) {
    assert.deepEqual(list.map((x) => x.i).sort(), [...PANELS].sort(), bp);
    for (const x of list) assert.ok(x.x + x.w <= COLS[bp], `${bp} ${x.i}`);
  }
});

test("a saved arrangement is kept; a broken or missing window comes back from the default", () => {
  const saved = { lg: [{ i: "chart", x: 0, y: 0, w: 16, h: 22 }, { i: "book", x: 30, y: 0, w: 5, h: 10 }, { i: "tape", x: 1, y: 2, w: 1, h: 1 }] };
  const out = cleanLayouts(saved);
  const by = (id) => out.lg.find((x) => x.i === id);
  assert.deepEqual([by("chart").x, by("chart").w, by("chart").h], [0, 16, 22]);
  // Off the grid: back to the default place.
  assert.equal(by("book").x, DEFAULT_LAYOUTS.lg.find((x) => x.i === "book").x);
  // Too small: grown to its minimum.
  assert.deepEqual([by("tape").w, by("tape").h], [3, 5]);
  // Not saved at all: the default.
  assert.deepEqual(by("watch"), DEFAULT_LAYOUTS.lg.find((x) => x.i === "watch"));
  assert.equal(cleanLayouts("nonsense").md.length, PANELS.length);
});

test("row height fills the space, never below 14px", () => {
  assert.equal(rowHeightFor(30 * 20 + 29 * 8), 20);
  assert.equal(rowHeightFor(100), 14);
});

test("no window off screen: the watchlist sits beside the chart at every width but a phone's", () => {
  for (const bp of ["lg", "md"]) {
    const by = (id) => DEFAULT_LAYOUTS[bp].find((x) => x.i === id);
    assert.equal(by("watch").y, 0, bp);
    assert.equal(by("chart").y, 0, bp);
  }
  // Phones: stacked, no gaps, no overlaps.
  let y = 0;
  for (const x of DEFAULT_LAYOUTS.sm) { assert.equal(x.y, y); y += x.h; }
  assert.ok(BREAKPOINTS.lg <= 1000, "a laptop with the app menu open still gets the full arrangement");
});

test("an arrangement from the first version keeps its wide-screen layout only", () => {
  const v1 = { lg: [{ i: "chart", x: 0, y: 0, w: 16, h: 22 }], md: [{ i: "watch", x: 8, y: 20, w: 4, h: 14 }] };
  assert.deepEqual(fromFirstVersion(v1), { lg: v1.lg });
  const out = cleanLayouts(fromFirstVersion(v1));
  assert.equal(out.lg.find((x) => x.i === "chart").w, 16);
  assert.equal(out.md.find((x) => x.i === "watch").y, 0);
  assert.equal(fromFirstVersion(null), null);
});
