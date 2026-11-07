import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Info, RefreshCw, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { prepare, pick, byStrike, band, profile, flipOf, walls, byExpiry, readout, money, count } from "@/lib/gex";
import useAccountSetting from "@/components/terminal/useAccountSetting";

// The Gamma page: gamma exposure for a stock or fund, from every listed
// contract (7 Nov 2026, the owner: "add tools to how to analyze and make it
// easy, yet informative and very professional and explaining how to use it").
// The chain comes from functions/terminal "gex"; the figures from lib/gex.js.

// Calls and positive gamma blue, puts and negative gamma red (a diverging
// pair checked for colour-blind readers); the flip violet; the price ink.
const CALL = "#2a78d6";
const PUT = "#e5484d";
const FLIP = "#6250d6";
const INK = "#0f172a";
const GRID = "#e2e8f0";
const AXIS = "#64748b";

const WINDOWS = [["0", "Nearest"], ["7", "1 week"], ["30", "1 month"], ["all", "All (90 days)"]];
const RANGES = [[0.03, "±3%"], [0.05, "±5%"], [0.1, "±10%"], [0.2, "±20%"]];
const METRICS = [["gex", "Gamma $"], ["oi", "Open interest"], ["volume", "Volume today"]];
const REFRESH_MS = 5 * 60000;

const cleanView = (v) => {
  const o = v && typeof v === "object" ? v : {};
  return {
    sym: typeof o.sym === "string" && /^[A-Z][A-Z0-9.]{0,5}$/.test(o.sym) ? o.sym : "SPY",
    win: WINDOWS.some(([id]) => id === o.win) ? o.win : "30",
    range: RANGES.some(([r]) => r === o.range) ? o.range : 0.05,
    metric: METRICS.some(([id]) => id === o.metric) ? o.metric : "gex",
    view: o.view === "net" ? "net" : "split",
    lines: o.lines !== false
  };
};

const at = (v) => (v === null || v === undefined ? "—" : v >= 100 ? v.toFixed(2).replace(/\.00$/, "") : v.toFixed(2));
const dist = (v, spot) => (v === null || v === undefined || !spot ? "" : `${v >= spot ? "+" : ""}${(((v - spot) / spot) * 100).toFixed(1)}%`);
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// An element's width, followed as it changes; measured from when the element
// appears (the charts mount only once the chain has been read).
function useWidth() {
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
function step(max, n = 2) {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
}

// A bar from the baseline `x0` to `x1`, its data end rounded.
function barPath(x0, x1, y, h, r = 3) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  const rr = Math.min(r, w, h / 2);
  if (x1 >= x0) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
  return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}
// The same, upright: from the baseline `y0` to `y1`.
function colPath(x, w, y0, y1, r = 3) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  if (y1 <= y0) return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

function Seg({ label, value, options, onChange }) {
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

function Tile({ label, help, value, sub, pill }) {
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

function Card({ title, note, right, children }) {
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

function Legend({ items }) {
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

// Strikes down the side (high at the top, as on a price chart), puts to the
// left and calls to the right of zero, or the net either way.
function StrikeChart({ rows, width, spot, flip, wall, metric, view, bandWidth }) {
  const [hover, setHover] = useState(null);
  const list = useMemo(() => [...rows].reverse(), [rows]);
  if (!width || !list.length) return <div className="h-40" />;
  const n = list.length;
  const rowH = Math.max(9, Math.min(18, Math.floor(560 / n)));
  const top = 4;
  const axisH = 30;
  const H = top + n * rowH + axisH;
  const labelW = 58;
  const padR = 70;
  const plotW = Math.max(120, width - labelW - padR);
  const x0 = labelW + plotW / 2;
  const max = Math.max(1e-9, ...list.map((r) => (view === "net" ? Math.abs(r.net) : Math.max(r.call, -r.put))));
  const x = (v) => x0 + (v / max) * (plotW / 2);
  const thick = Math.max(3, Math.min(14, rowH - 4));
  const centre = (r) => r.strike + (bandWidth ? bandWidth / 2 : 0);
  // A price's height, between the rows it falls between; null outside the
  // strikes shown (`clamp` pins it to the nearer edge instead).
  const yOf = (p, clamp = false) => {
    if (p === null || p === undefined) return null;
    const c = list.map(centre);
    if (p > c[0] || p < c[n - 1]) {
      if (!clamp) return null;
      return p > c[0] ? top + rowH / 2 : top + (n - 1) * rowH + rowH / 2;
    }
    for (let i = 1; i < n; i++) {
      if (p >= c[i]) return top + (i - 1) * rowH + rowH / 2 + ((c[i - 1] - p) / (c[i - 1] - c[i])) * rowH;
    }
    return top + rowH / 2;
  };
  const s = step(max);
  const ticks = [];
  for (let v = -Math.floor(max / s) * s; v <= max + 1e-9; v += s) ticks.push(v);
  const fmt = (v) => (metric === "gex" ? money(Math.abs(v)) : count(Math.abs(v)));
  const every = Math.ceil(12 / rowH);
  const ySpot = yOf(spot, true);
  const yFlip = yOf(flip);
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientY - box.top - top) / rowH);
    setHover(i >= 0 && i < n ? { i, x: e.clientX - box.left, y: e.clientY - box.top } : null);
  };
  const h = hover ? list[hover.i] : null;
  return (
    <div className="relative">
      <svg width={width} height={H} role="img" aria-label={`Gamma by strike, ${n} ${bandWidth ? "bands" : "strikes"}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        {ticks.map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={top} y2={top + n * rowH} stroke={GRID} strokeWidth="1" />)}
        <line x1={x0} x2={x0} y1={top} y2={top + n * rowH} stroke={AXIS} strokeWidth="1" />
        {list.map((r, i) => {
          const y = top + i * rowH + (rowH - thick) / 2;
          const isWall = r.strike === wall.call || r.strike === wall.put;
          return (
            <g key={r.strike}>
              {hover?.i === i && <rect x={labelW} y={top + i * rowH} width={plotW} height={rowH} fill="#f1f5f9" />}
              {isWall && hover?.i !== i && <rect x={labelW} y={top + i * rowH} width={plotW} height={rowH} fill="#f8fafc" />}
              {view === "net"
                ? <path d={barPath(x0, x(r.net), y, thick)} fill={r.net >= 0 ? CALL : PUT} />
                : (<>
                  <path d={barPath(x0, x(r.call), y, thick)} fill={CALL} />
                  <path d={barPath(x0, x(r.put), y, thick)} fill={PUT} />
                </>)}
              {(i % every === 0 || isWall) && (
                <text x={labelW - 6} y={top + i * rowH + rowH / 2} textAnchor="end" dominantBaseline="central" fontSize="10" fill={isWall ? INK : AXIS} fontWeight={isWall ? 600 : 400} className="tabular-nums">
                  {at(r.strike)}
                </text>
              )}
              {isWall && (
                <text x={labelW + plotW + 6} y={top + i * rowH + rowH / 2 + (Math.abs((ySpot ?? -99) - (top + i * rowH + rowH / 2)) < 12 ? -10 : 0)} dominantBaseline="central" fontSize="10" fill={INK} fontWeight="600">
                  {r.strike === wall.call && r.strike === wall.put ? "Call+put wall" : r.strike === wall.call ? "Call wall" : "Put wall"}
                </text>
              )}
            </g>
          );
        })}
        {yFlip !== null && (
          <g>
            <line x1={labelW} x2={labelW + plotW} y1={yFlip} y2={yFlip} stroke={FLIP} strokeWidth="1.5" strokeDasharray="5 4" />
            <rect x={labelW + 2} y={yFlip - 15} width={74} height={13} rx="3" fill="#fff" opacity="0.9" />
            <text x={labelW + 5} y={yFlip - 8} dominantBaseline="central" fontSize="10" fill={INK} fontWeight="600">Flip {at(flip)}</text>
          </g>
        )}
        {ySpot !== null && (
          <g>
            <line x1={labelW} x2={labelW + plotW} y1={ySpot} y2={ySpot} stroke={INK} strokeWidth="1.5" />
            <rect x={labelW + plotW + 2} y={ySpot - 8} width={padR - 4} height={16} rx="3" fill={INK} />
            <text x={labelW + plotW + 6} y={ySpot} dominantBaseline="central" fontSize="10" fill="#fff" fontWeight="600" className="tabular-nums">{at(spot)}</text>
          </g>
        )}
        {ticks.map((v) => (
          <text key={`t${v}`} x={x(v)} y={top + n * rowH + 13} textAnchor="middle" fontSize="10" fill={AXIS} className="tabular-nums">{fmt(v)}</text>
        ))}
        {view === "split" && (
          <>
            <text x={labelW} y={top + n * rowH + 26} fontSize="10" fill={AXIS}>← Puts</text>
            <text x={labelW + plotW} y={top + n * rowH + 26} textAnchor="end" fontSize="10" fill={AXIS}>Calls →</text>
          </>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute z-10 w-56 rounded-md border border-slate-200 bg-white p-2 text-[11px] shadow-lg"
          style={{ left: Math.min(hover.x + 14, width - 230), top: Math.max(0, hover.y - 60) }}>
          <div className="mb-1 flex justify-between font-semibold text-slate-900">
            <span>{bandWidth ? `${at(h.strike)}–${at(h.strike + bandWidth)}` : `Strike ${at(h.strike)}`}</span>
            <span className="font-normal text-slate-500">{dist(centre(h), spot)}</span>
          </div>
          <Row k="Call gamma" v={money(h.callGex)} dot={CALL} />
          <Row k="Put gamma" v={money(h.putGex)} dot={PUT} />
          <Row k="Net gamma" v={money(h.callGex + h.putGex)} strong />
          <Row k="Open interest" v={`${count(h.callOi)} C · ${count(h.putOi)} P`} />
          <Row k="Volume today" v={`${count(h.callVol)} C · ${count(h.putVol)} P`} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v, dot, strong }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-slate-500">{dot && <span className="h-2 w-2 rounded-sm" style={{ background: dot }} />}{k}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{v}</span>
    </div>
  );
}

// Total exposure if the price were elsewhere: where it crosses zero is the flip.
function ProfileChart({ points, width, spot, flip, wall, symbol }) {
  const [hover, setHover] = useState(null);
  if (!width || points.length < 2) return <div className="h-48" />;
  const H = 210;
  const padL = 56;
  const padR = 12;
  const top = 10;
  const bottom = 26;
  const plotW = width - padL - padR;
  const plotH = H - top - bottom;
  const lo = points[0].price;
  const hi = points[points.length - 1].price;
  const vals = points.map((p) => p.total);
  const ymax = Math.max(0, ...vals);
  const ymin = Math.min(0, ...vals);
  const span = ymax - ymin || 1;
  const x = (p) => padL + ((p - lo) / (hi - lo)) * plotW;
  const y = (v) => top + ((ymax - v) / span) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.price).toFixed(1)},${y(p.total).toFixed(1)}`).join("");
  const area = `${line}L${x(hi)},${y(0)}L${x(lo)},${y(0)}Z`;
  const s = step(Math.max(Math.abs(ymax), Math.abs(ymin)));
  const yt = [];
  for (let v = Math.ceil(ymin / s) * s; v <= ymax + 1e-9; v += s) yt.push(v);
  const xs = step(hi - lo, 4);
  const xt = [];
  for (let v = Math.ceil(lo / xs) * xs; v <= hi; v += xs) xt.push(v);
  const marks = (wall.call !== null && wall.call === wall.put ? [[wall.call, INK, "Call+put wall"]] : [[wall.put, PUT, "Put wall"], [wall.call, CALL, "Call wall"]])
    .filter(([v]) => v !== null && v >= lo && v <= hi);
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    if (px < padL || px > padL + plotW) { setHover(null); return; }
    const i = Math.round(((px - padL) / plotW) * (points.length - 1));
    setHover({ i, x: px });
  };
  const hp = hover ? points[hover.i] : null;
  return (
    <div className="relative">
      <svg width={width} height={H} role="img" aria-label="Gamma profile: total gamma exposure across prices" onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        <defs>
          <clipPath id="gex-above"><rect x={padL} y={top} width={plotW} height={Math.max(0, y(0) - top)} /></clipPath>
          <clipPath id="gex-below"><rect x={padL} y={y(0)} width={plotW} height={Math.max(0, top + plotH - y(0))} /></clipPath>
        </defs>
        {yt.map((v) => <line key={v} x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />)}
        <path d={area} fill={CALL} opacity="0.12" clipPath="url(#gex-above)" />
        <path d={area} fill={PUT} opacity="0.12" clipPath="url(#gex-below)" />
        <line x1={padL} x2={padL + plotW} y1={y(0)} y2={y(0)} stroke={AXIS} strokeWidth="1" />
        <path d={line} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {marks.map(([v, c, name]) => (
          <g key={name}>
            <line x1={x(v)} x2={x(v)} y1={top} y2={top + plotH} stroke={c} strokeWidth="1" opacity="0.7" />
            <text x={x(v) + 3} y={top + 9} fontSize="10" fill={INK}>{name}</text>
          </g>
        ))}
        {flip !== null && flip >= lo && flip <= hi && (
          <g>
            <line x1={x(flip)} x2={x(flip)} y1={top} y2={top + plotH} stroke={FLIP} strokeWidth="1.5" strokeDasharray="5 4" />
            <circle cx={x(flip)} cy={y(0)} r="4" fill={FLIP} stroke="#fff" strokeWidth="2" />
            <text x={x(flip) + 4} y={y(0) - 7} fontSize="10" fill={INK} fontWeight="600">Flip {at(flip)}</text>
          </g>
        )}
        <line x1={x(spot)} x2={x(spot)} y1={top} y2={top + plotH} stroke={INK} strokeWidth="1.5" />
        <text x={x(spot) + 3} y={top + plotH - 4} fontSize="10" fill={INK} fontWeight="600">{symbol} {at(spot)}</text>
        {yt.map((v) => <text key={`y${v}`} x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize="10" fill={AXIS} className="tabular-nums">{money(v)}</text>)}
        {xt.map((v) => <text key={`x${v}`} x={x(v)} y={H - 8} textAnchor="middle" fontSize="10" fill={AXIS} className="tabular-nums">{at(v)}</text>)}
        {hp && (
          <g>
            <line x1={x(hp.price)} x2={x(hp.price)} y1={top} y2={top + plotH} stroke={AXIS} strokeWidth="1" />
            <circle cx={x(hp.price)} cy={y(hp.total)} r="4" fill={hp.total >= 0 ? CALL : PUT} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-md border border-slate-200 bg-white p-2 text-[11px] shadow-lg" style={{ left: Math.min(hover.x + 12, width - 216), top: 8 }}>
          <div className="font-semibold text-slate-900">If {symbol} were {at(hp.price)} <span className="font-normal text-slate-500">({dist(hp.price, spot)})</span></div>
          <Row k="Net gamma per 1%" v={money(hp.total)} strong />
          <div className="text-slate-500">{hp.total >= 0 ? "Positive: hedging would damp moves" : "Negative: hedging would add to moves"}</div>
        </div>
      )}
    </div>
  );
}

// Each expiry's call and put gamma; the ones counted solid, a click picks one alone.
function ExpiryChart({ rows, width, counted, onPick, picked }) {
  const [hover, setHover] = useState(null);
  if (!width || !rows.length) return <div className="h-40" />;
  const H = 190;
  const padL = 56;
  const top = 8;
  const bottom = 24;
  const plotW = width - padL - 8;
  const plotH = H - top - bottom;
  const max = Math.max(1e-9, ...rows.map((r) => r.call));
  const min = Math.min(-1e-9, ...rows.map((r) => r.put));
  const y = (v) => top + ((max - v) / (max - min)) * plotH;
  const colW = plotW / rows.length;
  const w = Math.max(3, Math.min(18, colW - 3));
  const every = Math.max(1, Math.ceil(34 / colW));
  const s = step(Math.max(max, -min));
  const yt = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) yt.push(v);
  const hr = hover !== null ? rows[hover.i] : null;
  return (
    <div className="relative">
      <svg width={width} height={H} role="img" aria-label="Gamma by expiry" className="block"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - box.left - padL) / colW);
          setHover(i >= 0 && i < rows.length ? { i, x: e.clientX - box.left } : null);
        }}
        onClick={() => { if (hover) onPick(rows[hover.i].i); }}>
        {yt.map((v) => <line key={v} x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />)}
        <line x1={padL} x2={padL + plotW} y1={y(0)} y2={y(0)} stroke={AXIS} strokeWidth="1" />
        {rows.map((r, i) => {
          const cx = padL + i * colW + (colW - w) / 2;
          const on = counted.has(r.i);
          return (
            <g key={r.expiry} opacity={on ? 1 : 0.3} style={{ cursor: "pointer" }}>
              {hover?.i === i && <rect x={padL + i * colW} y={top} width={colW} height={plotH} fill="#f1f5f9" />}
              <path d={colPath(cx, w, y(0), y(r.call))} fill={CALL} />
              <path d={colPath(cx, w, y(0), y(r.put))} fill={PUT} />
              {picked === r.i && <rect x={cx - 2} y={top} width={w + 4} height={plotH} fill="none" stroke={INK} strokeWidth="1.5" rx="3" />}
              {i % every === 0 && <text x={cx + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={AXIS}>{shortDate(r.expiry)}</text>}
            </g>
          );
        })}
        {yt.map((v) => <text key={`y${v}`} x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize="10" fill={AXIS} className="tabular-nums">{money(v)}</text>)}
      </svg>
      {hr && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-md border border-slate-200 bg-white p-2 text-[11px] shadow-lg" style={{ left: Math.min(hover.x + 12, width - 216), top: 8 }}>
          <div className="font-semibold text-slate-900">{hr.expiry} <span className="font-normal text-slate-500">{hr.days === 0 ? "today" : `${hr.days} day${hr.days === 1 ? "" : "s"}`}</span></div>
          <Row k="Call gamma" v={money(hr.call)} dot={CALL} />
          <Row k="Put gamma" v={money(hr.put)} dot={PUT} />
          <Row k="Net" v={money(hr.net)} strong />
          <Row k="Share of all gamma" v={`${(hr.share * 100).toFixed(1)}%`} />
          <div className="mt-0.5 text-slate-500">Click to show this expiry alone</div>
        </div>
      )}
    </div>
  );
}

function Guide({ onClose }) {
  const H = ({ children }) => <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h4>;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/20" onClick={onClose} role="presentation">
      <aside role="dialog" aria-label="How to read gamma exposure" onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 text-[13px] leading-relaxed text-slate-700 shadow-2xl">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-500" />
          <h3 className="flex-1 text-base font-semibold text-slate-900">How to read gamma exposure</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <H>What it shows</H>
        <p>Dealers who sell options hedge them with the stock. Gamma exposure (GEX) estimates how many dollars of stock they would buy or sell if the price moved 1%, worked out from every listed contract&apos;s open interest and implied volatility. Calls count plus and puts minus: the standard assumption that dealers hold the other side of what customers trade (long calls, short puts).</p>
        <H>Positive or negative gamma</H>
        <p><b className="text-slate-900">Positive</b> (blue): dealers&apos; hedging leans against the move. They sell into rallies and buy dips, so swings tend to be smaller and prices tend to stick near big strikes.</p>
        <p className="mt-1"><b className="text-slate-900">Negative</b> (red): hedging goes with the move. They buy rallies and sell dips, so swings tend to be wider and breaks tend to run.</p>
        <H>The zero-gamma flip</H>
        <p>The price where total exposure crosses zero (the violet dashed line). Above it the estimate is usually positive, below it negative. How far the price sits from the flip says how far it has to move before the behaviour is expected to change.</p>
        <H>Call wall and put wall</H>
        <p>The strikes holding the most call gamma and the most put gamma. Traders watch them as reference levels: in positive gamma price tends to slow near them; in negative gamma they can give way. Close to expiry, a large strike near the price can act like a magnet.</p>
        <H>A routine</H>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Read the regime on the <b>Net gamma</b> tile.</li>
          <li>Check the distance to the <b>flip</b>: close means the regime can change quickly.</li>
          <li>Mark the <b>walls</b>; tick <b>Levels on chart</b> to draw them on the Trade page.</li>
          <li>Check <b>Expiring soonest</b>: when today&apos;s expiry carries much of the gamma, the map changes after the close.</li>
          <li>Switch <b>Measure</b> to <b>Volume today</b> to see where fresh trading is building.</li>
          <li>Refresh after a large move; the page also refreshes itself every five minutes.</li>
        </ol>
        <H>Tools on this page</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Expiries</b>: the nearest only, a week, a month, or all within 90 days. Click a column under <b>Gamma by expiry</b> to show that expiry alone.</li>
          <li><b>Range</b>: how far from the price the strike chart reaches; wide ranges group strikes into bands.</li>
          <li><b>Measure</b>: dollars of gamma, open interest, or contracts traded today.</li>
          <li><b>Calls &amp; puts / Net</b>: both sides of each strike, or what is left after they offset.</li>
          <li>Hover any bar or line for its figures.</li>
        </ul>
        <H>Limits</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>An estimate: real dealer positions are not published, and customers do not only buy calls and sell puts.</li>
          <li>Open interest is published once a day, as of the previous close. During the day the exposure moves with the price only; today&apos;s new positions show under Volume today, which cannot say whether they opened or closed.</li>
          <li>Volatility from Alpaca&apos;s option feed; strikes within 20% of the price, expiries within 90 days.</li>
          <li>For context, not a recommendation to trade.</li>
        </ul>
      </aside>
    </div>
  );
}

/**
 * `accountId`: whose Alpaca account reads the chain; `chartSymbol`: the Trade
 * page's symbol, offered as a shortcut; `priceOf(symbol)`: the live price,
 * when streaming; `onSymbol` tells the page which symbol to stream;
 * `onLevels(symbol, levels)` puts the walls and flip on the Trade charts.
 */
export default function GexPage({ accountId, active, chartSymbol, priceOf, onSymbol, onLevels, stockFeed = "iex" }) {
  const [view, setView] = useAccountSetting("gexview", { localKey: "dm.terminal.gexView", initial: () => cleanView(null), clean: cleanView });
  const set = useCallback((patch) => setView((v) => ({ ...v, ...patch })), [setView]);
  const [typed, setTyped] = useState(view.sym);
  const [expiry, setExpiry] = useState(null);
  const [chain, setChain] = useState(null);
  const [state, setState] = useState({ loading: false, error: null });
  const [guide, setGuide] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sym = view.sym;
  useEffect(() => { setTyped(sym); setExpiry(null); onSymbol?.(sym); }, [sym, onSymbol]);

  const load = useCallback(() => {
    if (!accountId || !sym) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    invokeFunction("terminal", { action: "gex", accountId, symbol: sym, days: 90, stockFeed })
      .then((r) => {
        if (r?.data?.error) { setState({ loading: false, error: r.data.error }); return; }
        setChain(r.data);
        setNow(Date.now());
        setState({ loading: false, error: null });
      })
      .catch((e) => setState({ loading: false, error: String(e?.message || e) }));
  }, [accountId, sym, stockFeed]);
  useEffect(() => { if (active) load(); }, [active, load]);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [active, load]);

  const mine = chain && chain.symbol === sym ? chain : null;
  const prepared = useMemo(() => (mine ? prepare(mine, now) : null), [mine, now]);
  const live = priceOf?.(sym) ?? null;
  const spot0 = mine?.spot || null;
  // Worked again each 0.1% the price moves, not on every trade.
  const spot = spot0 ? (live ? Math.round(live / (spot0 * 0.001)) * spot0 * 0.001 : spot0) : null;
  const shownSpot = live ?? spot0;
  const days = view.win === "all" ? null : Number(view.win);
  const contracts = useMemo(() => (prepared ? pick(prepared, expiry !== null ? { expiry } : { days }) : []), [prepared, days, expiry]);
  const counted = useMemo(() => new Set(contracts.map((c) => c.ei)), [contracts]);
  const gex = useMemo(() => (spot ? byStrike(contracts, spot, "gex") : null), [contracts, spot]);
  const measured = useMemo(() => (spot ? (view.metric === "gex" ? gex : byStrike(contracts, spot, view.metric)) : null), [contracts, spot, view.metric, gex]);
  const wall = useMemo(() => (gex ? walls(gex.rows) : { call: null, put: null, top: [] }), [gex]);
  const prof = useMemo(() => (spot && contracts.length ? profile(contracts, spot) : []), [contracts, spot]);
  const flip = useMemo(() => (prof.length ? flipOf(prof, spot) : null), [prof, spot]);
  const expiries = useMemo(() => (prepared && spot ? byExpiry(prepared, pick(prepared), spot) : []), [prepared, spot]);
  const shown = useMemo(() => {
    if (!measured || !spot) return { rows: [], width: null };
    const lo = spot * (1 - view.range);
    const hi = spot * (1 + view.range);
    return band(measured.rows.filter((r) => r.strike >= lo && r.strike <= hi), 80);
  }, [measured, spot, view.range]);
  const netGex = gex?.totals.netGex ?? 0;
  const nearest = expiries[0] || null;
  const lines = useMemo(() => (mine && spot ? readout({ symbol: sym, spot, netGex, flip, wall, nearest, oiDate: mine.oiDate }) : []), [mine, spot, sym, netGex, flip, wall, nearest]);

  // The walls and the flip on the Trade page's charts of this symbol.
  useEffect(() => {
    if (!onLevels) return;
    if (!view.lines || !mine) { onLevels(sym, null); return; }
    onLevels(sym, [
      wall.call !== null && { price: wall.call, color: CALL, title: "GEX call wall" },
      wall.put !== null && { price: wall.put, color: PUT, title: "GEX put wall" },
      flip !== null && { price: Math.round(flip * 100) / 100, color: FLIP, title: "Zero gamma" }
    ].filter(Boolean));
  }, [onLevels, sym, view.lines, mine, wall.call, wall.put, flip]);

  const [stripRef, stripW] = useWidth();
  const [profRef, profW] = useWidth();
  const [expRef, expW] = useWidth();
  const go = (s) => { const v = String(s || "").toUpperCase().trim(); if (/^[A-Z][A-Z0-9.]{0,5}$/.test(v)) set({ sym: v }); };
  const quick = [...new Set(["SPY", "QQQ", chartSymbol && !chartSymbol.includes("/") ? chartSymbol : null].filter(Boolean))];
  const filterName = expiry !== null ? `the ${prepared?.expiries[expiry]?.expiry} expiry` : WINDOWS.find(([id]) => id === view.win)?.[1].toLowerCase();
  const at2 = mine ? new Date(mine.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="flex flex-col gap-2 px-1 pb-4 text-slate-800">
      {/* The tools, in one row. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); go(typed); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} aria-label="Symbol" placeholder="Symbol"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold uppercase" />
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => go(q)} className={`rounded-md border px-2 py-1 text-xs ${q === sym ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{q}</button>
          ))}
        </form>
        <Seg label="Expiries" value={expiry !== null ? null : view.win} options={WINDOWS} onChange={(id) => { setExpiry(null); set({ win: id }); }} />
        {prepared && (
          <select value={expiry ?? ""} onChange={(e) => setExpiry(e.target.value === "" ? null : Number(e.target.value))} aria-label="One expiry"
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
            <option value="">One expiry…</option>
            {prepared.expiries.map((e, i) => e.open && <option key={e.expiry} value={i}>{e.expiry} ({e.days === 0 ? "today" : `${e.days}d`})</option>)}
          </select>
        )}
        <Seg label="Range" value={view.range} options={RANGES} onChange={(r) => set({ range: r })} />
        <Seg label="Measure" value={view.metric} options={METRICS} onChange={(m) => set({ metric: m })} />
        <label className="flex items-center gap-1.5 text-xs text-slate-700" title="Draw the call wall, put wall and zero-gamma flip on the Trade page's charts of this symbol">
          <input type="checkbox" checked={view.lines} onChange={(e) => set({ lines: e.target.checked })} />Levels on chart
        </label>
        <div className="ml-auto flex items-center gap-2">
          {at2 && <span className="text-[11px] text-slate-500">Read {at2}</span>}
          <button type="button" onClick={load} disabled={state.loading} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1 rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800">
            <BookOpen className="h-3.5 w-3.5" />How to read this
          </button>
        </div>
      </div>

      {state.error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p>}
      {!mine && state.loading && <p className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Reading every {sym} contract within 90 days…</p>}

      {mine && spot && (
        <>
          {/* The answer first. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Price" value={at(shownSpot)} sub={mine.prevClose ? `${shownSpot >= mine.prevClose ? "+" : ""}${(((shownSpot - mine.prevClose) / mine.prevClose) * 100).toFixed(2)}% today` : null} />
            <Tile label="Net gamma" help="Dollars of stock dealers would trade per 1% move, all contracts counted (calls plus, puts minus). Positive tends to damp moves, negative to add to them."
              value={money(netGex)} sub={`per 1% move · ${filterName}`}
              pill={<span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${netGex >= 0 ? "bg-blue-50 text-blue-800" : "bg-rose-50 text-rose-800"}`}>{netGex >= 0 ? "Positive" : "Negative"}</span>} />
            <Tile label="Zero-gamma flip" help="The price where total gamma crosses zero: above it the estimate is positive, below it negative."
              value={flip !== null ? at(flip) : "None"} sub={flip !== null ? `${dist(flip, spot)} from the price` : "not within 12%"} />
            <Tile label="Call wall" help="The strike with the most call gamma." value={at(wall.call)} sub={wall.call !== null ? `${dist(wall.call, spot)} from the price` : null} />
            <Tile label="Put wall" help="The strike with the most put gamma." value={at(wall.put)} sub={wall.put !== null ? `${dist(wall.put, spot)} from the price` : null} />
            <Tile label="Expiring soonest" help="How much of all the gamma sits in the nearest expiry: a large share means the map changes after it expires."
              value={nearest ? `${Math.round(nearest.share * 100)}%` : "—"} sub={nearest ? `${nearest.expiry}${nearest.days === 0 ? " (today)" : ""}` : null} />
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card title={`${METRICS.find(([id]) => id === view.metric)[1]} by strike`}
              note={view.metric === "gex" ? "Dollars of stock dealers would trade per 1% move, at each strike." : view.metric === "oi" ? "Contracts open at each strike, as of the last close." : "Contracts traded today at each strike."}
              right={(
                <div className="flex flex-col items-end gap-1">
                  <Seg label="Show" value={view.view} options={[["split", "Calls & puts"], ["net", "Net"]]} onChange={(v) => set({ view: v })} />
                  <Legend items={[[CALL, view.view === "net" ? "Net positive" : "Calls"], [PUT, view.view === "net" ? "Net negative" : "Puts"], [FLIP, "Zero-gamma flip", true]]} />
                </div>
              )}>
              <div ref={stripRef}>
                <StrikeChart rows={shown.rows} width={stripW} spot={shownSpot} flip={flip} wall={wall} metric={view.metric} view={view.view} bandWidth={shown.width} />
              </div>
              {shown.width && <p className="mt-1 text-[11px] text-slate-500">Strikes grouped in ${shown.width} bands to fit; narrow the range to see each strike.</p>}
            </Card>

            <div className="flex min-w-0 flex-col gap-2">
              <Card title="Read-out" note={`${sym}, ${filterName}. A description of the estimate, not advice.`}>
                <ul className="space-y-2 text-[13px] leading-snug text-slate-700">
                  {lines.map((l) => (
                    <li key={l.kind} className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: l.tone === "pos" ? CALL : l.tone === "neg" ? PUT : l.kind === "flip" ? FLIP : "#94a3b8" }} />
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Key levels">
                <table className="w-full text-[12px] tabular-nums">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500"><th className="pb-1 font-semibold">Level</th><th className="pb-1 text-right font-semibold">Price</th><th className="pb-1 text-right font-semibold">From price</th><th className="pb-1 text-right font-semibold">Net gamma</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[["Call wall", wall.call], ["Zero-gamma flip", flip], ["Put wall", wall.put]].map(([name, v]) => (
                      <tr key={name}><td className="py-1 font-medium text-slate-900">{name}</td><td className="py-1 text-right">{at(v)}</td><td className="py-1 text-right text-slate-600">{dist(v, spot)}</td>
                        <td className="py-1 text-right text-slate-600">{v !== null && name !== "Zero-gamma flip" ? money((gex.rows.find((r) => r.strike === v)?.callGex || 0) + (gex.rows.find((r) => r.strike === v)?.putGex || 0)) : ""}</td></tr>
                    ))}
                    {wall.top.filter((t) => t.strike !== wall.call && t.strike !== wall.put).slice(0, 4).map((t) => (
                      <tr key={t.strike}><td className="py-1 text-slate-700">Large {t.net >= 0 ? "positive" : "negative"} strike</td><td className="py-1 text-right">{at(t.strike)}</td><td className="py-1 text-right text-slate-600">{dist(t.strike, spot)}</td><td className="py-1 text-right text-slate-600">{money(t.net)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <Card title="Gamma profile" note="Total gamma if the price moved, everything else held: where the line crosses zero is the flip."
              right={<Legend items={[[CALL, "Positive"], [PUT, "Negative"], [FLIP, "Flip", true]]} />}>
              <div ref={profRef}><ProfileChart points={prof} width={profW} spot={spot} flip={flip} wall={wall} symbol={sym} /></div>
            </Card>
            <Card title="Gamma by expiry" note={expiry !== null ? "One expiry shown; click it again, or pick a window above, to go back." : "The expiries counted are solid. Click one to show it alone."}
              right={<Legend items={[[CALL, "Calls"], [PUT, "Puts"]]} />}>
              <div ref={expRef}><ExpiryChart rows={expiries} width={expW} counted={counted} picked={expiry} onPick={(i) => setExpiry((cur) => (cur === i ? null : i))} /></div>
            </Card>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            {mine.counts.used.toLocaleString("en-US")} contracts with open interest or volume, {prepared.expiries.filter((e) => e.open).length} expiries within 90 days, strikes within 20% of {at(spot0)}.
            {" "}Open interest as of {mine.oiDate || "the last close"}; volatility and volume from Alpaca&apos;s option feed{prepared.filled ? `; ${prepared.filled} contracts without a volatility of their own take their expiry's median` : ""}{mine.counts.expiriesFailed ? `; ${mine.counts.expiriesFailed} expiries could not be read` : ""}.
            {" "}An estimate of dealer positioning (calls counted long, puts short), for context only.
          </p>
        </>
      )}
      {guide && <Guide onClose={() => setGuide(false)} />}
    </div>
  );
}
