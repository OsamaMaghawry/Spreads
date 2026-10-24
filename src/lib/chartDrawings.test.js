import test from "node:test";
import assert from "node:assert/strict";
import { timeToLogical, logicalToTime, fibLevels, measure, durationText, distToSegment, hitTest, moveDrawing, cleanDrawings, readDrawings, writeDrawings, pointsFor } from "./chartDrawings.js";

const times = [1000, 1300, 1600, 2200]; // a gap before the last bar

test("moments and bar positions: on a bar, between bars, beyond either end, and back", () => {
  assert.equal(timeToLogical(times, 1300, 300), 1);
  assert.equal(timeToLogical(times, 1450, 300), 1.5);
  // Across the gap the position follows time between the two bars.
  assert.equal(timeToLogical(times, 1900, 300), 2.5);
  assert.equal(timeToLogical(times, 2800, 300), 5);
  assert.equal(timeToLogical(times, 400, 300), -2);
  for (const t of [1000, 1450, 1900, 2800, 400]) assert.equal(logicalToTime(times, timeToLogical(times, t, 300), 300), t);
  assert.equal(timeToLogical([], 1, 1), null);
});

test("Fibonacci: 0 where the move ended, 1 where it started, 61.8% between", () => {
  const levels = fibLevels({ time: 0, price: 100 }, { time: 1, price: 200 });
  assert.equal(levels[0].price, 200);
  assert.equal(levels.at(-1).price, 100);
  assert.equal(levels.find((l) => l.level === 0.618).price.toFixed(1), "138.2");
});

test("measure: change, percent, bars, time", () => {
  const m = measure({ time: 0, price: 50 }, { time: 5400, price: 55 }, 17.6);
  assert.deepEqual(m, { change: 5, pct: 0.1, bars: 18, seconds: 5400 });
  assert.equal(durationText(5400), "1h 30m");
  assert.equal(durationText(600), "10m");
  assert.equal(durationText(86400 * 3), "3d");
});

test("hit testing: handles before bodies, the latest drawing on top, lines by their axis", () => {
  const xy = (p) => ({ x: p.time, y: p.price }); // pixels = stored values, for the test
  const drawings = [
    { id: "r", type: "rect", points: [{ time: 0, price: 0 }, { time: 100, price: 100 }] },
    { id: "t", type: "trend", points: [{ time: 0, price: 0 }, { time: 100, price: 100 }] },
    { id: "h", type: "hline", points: [{ time: 0, price: 300 }] }
  ];
  assert.deepEqual(hitTest(drawings, xy, 1, 1), { id: "t", handle: 0 });
  assert.deepEqual(hitTest(drawings, xy, 50, 52), { id: "t", handle: null });
  assert.deepEqual(hitTest(drawings, xy, 80, 20), { id: "r", handle: null });
  assert.deepEqual(hitTest(drawings, xy, 999, 303), { id: "h", handle: null });
  assert.equal(hitTest(drawings, xy, 500, 500), null);
  // A ray carries on past its second point; a segment does not.
  assert.equal(distToSegment(200, 200, 0, 0, 100, 100, true), 0);
  assert.ok(distToSegment(200, 200, 0, 0, 100, 100) > 100);
});

test("moving: a handle moves one point; the body moves both; lines keep their axis", () => {
  const t = { id: "t", type: "trend", points: [{ time: 0, price: 10 }, { time: 100, price: 20 }] };
  assert.deepEqual(moveDrawing(t, 1, { time: 100, price: 20 }, { time: 150, price: 25 }).points[1], { time: 150, price: 25 });
  assert.deepEqual(moveDrawing(t, null, { time: 50, price: 15 }, { time: 60, price: 16 }).points, [{ time: 10, price: 11 }, { time: 110, price: 21 }]);
  const h = { id: "h", type: "hline", points: [{ time: 5, price: 10 }] };
  assert.deepEqual(moveDrawing(h, null, { time: 0, price: 10 }, { time: 99, price: 12 }).points, [{ time: 5, price: 12 }]);
});

test("saving: per symbol, malformed drawings dropped, an empty list removes the symbol", () => {
  const good = { id: "a", type: "hline", points: [{ time: 1, price: 2 }], color: "#2563eb" };
  const raw = writeDrawings(null, "BTC/USD", [good, { id: "b", type: "trend", points: [{ time: 1, price: 2 }] }, { id: "c", type: "laser", points: [] }]);
  assert.deepEqual(readDrawings(raw, "BTC/USD"), [good]);
  assert.deepEqual(readDrawings(raw, "AAPL"), []);
  assert.deepEqual(readDrawings("not json", "AAPL"), []);
  assert.equal(writeDrawings(raw, "BTC/USD", []), "{}");
  assert.equal(cleanDrawings([{ ...good, color: "red" }])[0].color, "#2563eb");
  assert.equal(pointsFor("vline"), 1);
});
