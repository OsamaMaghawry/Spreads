import { useMemo, useState } from "react";
import { pick, byStrike, band, profile, flipOf, walls, byExpiry, readout, money, count } from "@/lib/gex";
import { hedgePct } from "@/lib/gexChart";
import { CALL, PUT, FLIP, INK, GRID, AXIS, WINDOWS, METRICS, at, dist, shortDate, useWidth, step, barPath, colPath, Seg, Tile, Card, Legend } from "@/components/terminal/gexParts";

// The Gamma page's answer for one chain: the tiles, gamma by strike, the
// read-out and key levels, the profile and gamma by expiry. Live reads today's
// chain (GexPage.jsx); History a past day's, as it stood a minute before that
// day's close (GexHistory.jsx), so a past day reads exactly as Live would have
// shown it.

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

/**
 * The figures and charts for one chain. `mine`: the chain; `prepared`: it made
 * ready (lib/gex prepare) at its own moment; `spot`: the price the figures are
 * worked at; `shownSpot`: the price shown (Live's last trade). `history`: a
 * past day's chain, read a minute before that day's close (no volume, no
 * previous close). The Trade page's charts read their own gamma levels
 * (lib/gexChart.js).
 */
export default function GexBoard({ sym, mine, prepared, spot, shownSpot, view, set, expiry, setExpiry, history = false, sameDay = true }) {
  const spot0 = mine.spot;
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


  const [stripRef, stripW] = useWidth();
  const [profRef, profW] = useWidth();
  const [expRef, expW] = useWidth();
  const filterName = expiry !== null ? `the ${prepared?.expiries[expiry]?.expiry} expiry` : WINDOWS.find(([id]) => id === view.win)?.[1].toLowerCase();

  return (
    <>
      {/* The answer first. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Tile label="Price" value={at(shownSpot)} sub={history ? "at 3:59 p.m. New York" : mine.prevClose ? `${shownSpot >= mine.prevClose ? "+" : ""}${(((shownSpot - mine.prevClose) / mine.prevClose) * 100).toFixed(2)}% today` : null} />
        <Tile label="Net gamma" help="Dollars of stock dealers would trade per 1% move, all contracts counted (calls plus, puts minus). Positive tends to damp moves, negative to add to them."
          value={money(netGex)} sub={`per 1% move · ${filterName}`}
          pill={<span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${netGex >= 0 ? "bg-blue-50 text-blue-800" : "bg-rose-50 text-rose-800"}`}>{netGex >= 0 ? "Positive" : "Negative"}</span>} />
        <Tile label="Hedge vs volume" help="Net gamma as a share of a normal day's dollar volume (20-day average): how big dealers' hedging is for this share per 1% move, as the screener shows it. Negative for negative gamma. The fair way to compare shares of different sizes."
          value={mine.avgDollar20 > 0 ? hedgePct(netGex / mine.avgDollar20) : "—"} sub={mine.avgDollar20 > 0 ? `of a normal day's $ volume (${money(mine.avgDollar20)})` : history ? "live only" : "no volume history"} />
        <Tile label="Zero-gamma flip" help="The price where total gamma crosses zero: above it the estimate is positive, below it negative."
          value={flip !== null ? at(flip) : "None"} sub={flip !== null ? `${dist(flip, spot)} from the price` : "not within 12%"} />
        <Tile label="Call wall" help="The strike with the most call gamma." value={at(wall.call)} sub={wall.call !== null ? `${dist(wall.call, spot)} from the price` : null} />
        <Tile label="Put wall" help="The strike with the most put gamma." value={at(wall.put)} sub={wall.put !== null ? `${dist(wall.put, spot)} from the price` : null} />
        <Tile label="Expiring soonest" help="How much of all the gamma sits in the nearest expiry: a large share means the map changes after it expires."
          value={nearest ? `${Math.round(nearest.share * 100)}%` : "—"} sub={nearest ? `${nearest.expiry}${nearest.days === 0 ? (history ? " (that day)" : " (today)") : ""}` : null} />
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

      {history ? (
        <p className="px-1 text-[11px] leading-relaxed text-slate-500">
          {mine.counts.used.toLocaleString("en-US")} contracts within 90 days and 20% of {at(spot0)}, as they stood at 3:59 p.m. New York on {mine.at.slice(0, 10)}: open interest as OPRA published it at 6:30 that morning, volatility from each contract&apos;s bid and offer a minute before the close (Databento){prepared.filled ? `; ${prepared.filled} contracts without a usable quote take their expiry's median` : ""}{sameDay ? "; the options expiring that day counted" : "; the options expiring that day left out, as they are gone by the next morning"}.
          {" "}An estimate of dealer positioning (calls counted long, puts short), for context only.
        </p>
      ) : (
        <p className="px-1 text-[11px] leading-relaxed text-slate-500">
          {mine.counts.used.toLocaleString("en-US")} contracts with open interest or volume, {prepared.expiries.filter((e) => e.open).length} expiries within 90 days, strikes within 20% of {at(spot0)}.
          {" "}Open interest as of {mine.oiDate || "the last close"}; volatility and volume from Alpaca&apos;s option feed{prepared.filled ? `; ${prepared.filled} contracts without a volatility of their own take their expiry's median` : ""}{mine.counts.expiriesFailed ? `; ${mine.counts.expiriesFailed} expiries could not be read` : ""}.
          {" "}An estimate of dealer positioning (calls counted long, puts short), for context only.
        </p>
      )}
    </>
  );
}
