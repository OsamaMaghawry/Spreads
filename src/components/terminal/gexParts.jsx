import { useEffect, useState } from "react";
import { Info } from "lucide-react";

// What the Gamma page's Live and History views share (components/terminal/
// GexPage.jsx, GexBoard.jsx, GexHistory.jsx): colours, the window, range and
// measure choices, number formats, and the small pieces of the page.

// Calls and positive gamma blue, puts and negative gamma red (a diverging
// pair checked for colour-blind readers); the flip violet; the price ink.
export const CALL = "#2a78d6";
export const PUT = "#e5484d";
export const FLIP = "#6250d6";
export const INK = "#0f172a";
export const GRID = "#e2e8f0";
export const AXIS = "#64748b";

export const WINDOWS = [["0", "Nearest"], ["7", "1 week"], ["30", "1 month"], ["all", "All (90 days)"]];
export const RANGES = [[0.03, "±3%"], [0.05, "±5%"], [0.1, "±10%"], [0.2, "±20%"]];
export const METRICS = [["gex", "Gamma $"], ["oi", "Open interest"], ["volume", "Volume today"]];

export const at = (v) => (v === null || v === undefined ? "—" : v >= 100 ? v.toFixed(2).replace(/\.00$/, "") : v.toFixed(2));
export const dist = (v, spot) => (v === null || v === undefined || !spot ? "" : `${v >= spot ? "+" : ""}${(((v - spot) / spot) * 100).toFixed(1)}%`);
export const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// An element's width, followed as it changes; measured from when the element
// appears (the charts mount only once the chain has been read).
export function useWidth() {
  const [node, setNode] = useState(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!node) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, w];
}

// Round tick steps for an axis reaching `max`.
export function step(max, n = 2) {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
}

// A bar from the baseline `x0` to `x1`, its data end rounded.
export function barPath(x0, x1, y, h, r = 3) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  const rr = Math.min(r, w, h / 2);
  if (x1 >= x0) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
  return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}
// The same, upright: from the baseline `y0` to `y1`.
export function colPath(x, w, y0, y1, r = 3) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  if (y1 <= y0) return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

export function Seg({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-slate-300 bg-white text-xs" role="group" aria-label={label}>
        {options.map(([id, name]) => (
          <button key={String(id)} type="button" onClick={() => onChange(id)} aria-pressed={value === id}
            className={`px-2 py-1 ${value === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
        ))}
      </div>
    </div>
  );
}

export function Tile({ label, help, value, sub, pill }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {help && <span title={help} className="cursor-help text-slate-400"><Info className="h-3 w-3" aria-label={help} /></span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        {pill}
      </div>
      {sub && <div className="truncate text-[11px] text-slate-500 tabular-nums">{sub}</div>}
    </div>
  );
}

export function Card({ title, note, right, children }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {note && <p className="text-[11px] leading-snug text-slate-500">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
      {items.map(([color, name, dashed]) => (
        <span key={name} className="flex items-center gap-1">
          {dashed ? <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" strokeDasharray="4 3" /></svg>
            : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
          {name}
        </span>
      ))}
    </div>
  );
}
