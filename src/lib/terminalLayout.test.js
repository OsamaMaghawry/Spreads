import test from "node:test";
import assert from "node:assert/strict";
import { cleanLayouts, DEFAULT_LAYOUTS, PANELS, rowHeightFor, COLS } from "./terminalLayout.js";

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
