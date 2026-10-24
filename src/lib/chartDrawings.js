// The terminal chart's drawings: trend lines, rays, horizontal and vertical
// lines, rectangles, Fibonacci retracements and measures.
//
// The owner, 24 Oct 2026: "Stay on Lightweight and add drawing tools".
// Lightweight Charts draws candles but has no drawing tools of its own; these
// are drawn on top of it (components/terminal/drawingLayer.js). This file is
// the arithmetic, kept pure so every rule is tested (chartDrawings.test.js).
//
// A drawing's points are stored as a moment and a price, never as pixels or
// bar numbers, so a line drawn on the 5-minute chart lands on the same prices
// and moments on the hourly one, and survives a reload.

export const TOOLS = [
  { id: "trend", label: "Trend line", points: 2 },
  { id: "ray", label: "Ray", points: 2 },
  { id: "hline", label: "Horizontal line", points: 1 },
  { id: "vline", label: "Vertical line", points: 1 },
  { id: "rect", label: "Rectangle", points: 2 },
  { id: "fib", label: "Fibonacci retracement", points: 2 },
  { id: "measure", label: "Measure", points: 2 },
  { id: "text", label: "Text", points: 1 }
];

// A text note's box on screen, estimated from its length at the 12px the layer
// draws in: wide enough to catch a click on any of it.
export const TEXT_MAX = 200;
export const textBox = (text) => ({ width: Math.max(24, String(text || "").length * 7 + 12), height: 20 });
export const pointsFor = (type) => TOOLS.find((t) => t.id === type)?.points ?? 2;

export const COLORS = ["#2563eb", "#059669", "#e11d48", "#d97706", "#7c3aed", "#0f172a"];
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/**
 * A moment as a bar position (a "logical" index, fractional between bars).
 * Between two bars it is interpolated by time; before the first or after the
 * last it is extended at one bar per `step` seconds, so a ray or a point can
 * sit in the empty space to the right of the last candle.
 */
export function timeToLogical(times, t, step) {
  const n = times.length;
  if (!n) return null;
  if (t <= times[0]) return (t - times[0]) / step;
  if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / step;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - times[lo]) / (times[hi] - times[lo]);
}

/** The inverse: a bar position back to a moment, in whole seconds. */
export function logicalToTime(times, l, step) {
  const n = times.length;
  if (!n || !Number.isFinite(l)) return null;
  if (l <= 0) return Math.round(times[0] + l * step);
  if (l >= n - 1) return Math.round(times[n - 1] + (l - (n - 1)) * step);
  const i = Math.floor(l);
  return Math.round(times[i] + (l - i) * (times[i + 1] - times[i]));
}

/**
 * The retracement prices: 0 at the second point (where the move ended), 1 at
 * the first (where it started), as TradingView draws them, so 0.618 is the
 * 61.8% pullback of the move.
 */
export function fibLevels(a, b) {
  return FIB_LEVELS.map((level) => ({ level, price: b.price + (a.price - b.price) * level }));
}

/** What a measure reads: the change, the change in percent, the bars and the time between its points. */
export function measure(a, b, bars) {
  const change = b.price - a.price;
  return { change, pct: a.price ? change / a.price : null, bars: Math.round(bars), seconds: Math.abs(b.time - a.time) };
}

export function durationText(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The distance from a point to a segment (or, for a ray, to its line beyond b). */
export function distToSegment(px, py, ax, ay, bx, by, ray = false) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = ray ? Math.max(0, t) : Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const HANDLE_PX = 7;
export const LINE_PX = 5;

/**
 * What is under the pointer: the drawing, and which of its points (0 or 1) if
 * the pointer is on a handle, else null for the drawing's body. `xy` turns a
 * stored point into pixels. Topmost (latest) drawing first, as it is drawn last.
 */
export function hitTest(drawings, xy, x, y) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    const a = xy(d.points[0]);
    const b = d.points[1] ? xy(d.points[1]) : null;
    if (!a) continue;
    if (d.type === "hline") {
      if (Math.abs(y - a.y) <= LINE_PX) return { id: d.id, handle: null };
      continue;
    }
    if (d.type === "vline") {
      if (Math.abs(x - a.x) <= LINE_PX) return { id: d.id, handle: null };
      continue;
    }
    if (d.type === "text") {
      const box = textBox(d.text);
      if (x >= a.x - 2 && x <= a.x + box.width && y >= a.y - box.height / 2 && y <= a.y + box.height / 2) return { id: d.id, handle: null };
      continue;
    }
    if (!b) continue;
    if (Math.hypot(x - a.x, y - a.y) <= HANDLE_PX) return { id: d.id, handle: 0 };
    if (Math.hypot(x - b.x, y - b.y) <= HANDLE_PX) return { id: d.id, handle: 1 };
    if (d.type === "trend" || d.type === "ray") {
      if (distToSegment(x, y, a.x, a.y, b.x, b.y, d.type === "ray") <= LINE_PX) return { id: d.id, handle: null };
      continue;
    }
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    if (x >= left - LINE_PX && x <= right + LINE_PX && y >= top - LINE_PX && y <= bottom + LINE_PX) return { id: d.id, handle: null };
  }
  return null;
}

/**
 * A drawing moved: one point dragged (handle 0 or 1), or the whole drawing
 * shifted by the same time and price (handle null). Horizontal and vertical
 * lines move along their one axis only.
 */
export function moveDrawing(d, handle, from, to) {
  const dt = to.time - from.time;
  const dp = to.price - from.price;
  if (handle === 0 || handle === 1) {
    const points = d.points.map((p, i) => (i === handle ? { time: to.time, price: to.price } : p));
    return { ...d, points };
  }
  const shift = (p) => ({
    time: d.type === "hline" ? p.time : p.time + dt,
    price: d.type === "vline" ? p.price : p.price + dp
  });
  return { ...d, points: d.points.map(shift) };
}

// ---------- saving ----------

const TYPES = new Set(TOOLS.map((t) => t.id));
const okPoint = (p) => p && Number.isFinite(p.time) && Number.isFinite(p.price);
export const DRAWINGS_MAX = 100;

/** Drawings read back from storage: anything malformed is dropped rather than drawn wrong. */
export function cleanDrawings(list) {
  return (Array.isArray(list) ? list : [])
    .filter((d) => d && typeof d.id === "string" && TYPES.has(d.type) && Array.isArray(d.points) &&
      d.points.length === pointsFor(d.type) && d.points.every(okPoint) &&
      (d.type !== "text" || (typeof d.text === "string" && d.text.trim())))
    .map((d) => ({
      id: d.id, type: d.type, points: d.points.map((p) => ({ time: p.time, price: p.price })), color: COLORS.includes(d.color) ? d.color : COLORS[0],
      ...(d.type === "text" ? { text: d.text.trim().slice(0, TEXT_MAX) } : {})
    }))
    .slice(-DRAWINGS_MAX);
}

export function readDrawings(raw, symbol) {
  try {
    return cleanDrawings(JSON.parse(raw)?.[symbol]);
  } catch {
    return [];
  }
}

export function writeDrawings(raw, symbol, drawings) {
  let all = {};
  try { all = JSON.parse(raw) || {}; } catch { all = {}; }
  if (drawings.length) all[symbol] = cleanDrawings(drawings);
  else delete all[symbol];
  return JSON.stringify(all);
}
