import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { prepare, money, withoutExpiry } from "@/lib/gex";
import GexBoard from "@/components/terminal/GexBoard";
import { CALL, PUT, FLIP, INK, GRID, AXIS, WINDOWS, RANGES, METRICS, at, useWidth, step, Seg, Card, Legend } from "@/components/terminal/gexParts";

// The Gamma page's History view (8 Nov 2026, the owner, approving the design:
// "build it inside the Gamma page"): gamma on past days, each as it stood a
// minute before that day's close (functions/terminal "gexBackfill", kept in
// gex_history), with what the price did after. A day picked opens below with
// the same figures and charts as Live (GexBoard), from that day's own chain.

const WINDOW_KEY = { 0: "nearest", 7: "week", 30: "month", all: "all" };
const NEG_BAND = "#ffe4e6";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateOf = (s) => new Date(`${s}T12:00:00Z`);
const shortDay = (s) => { const d = dateOf(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const longDay = (s) => { const d = dateOf(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const pct = (v, digits = 1) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`);
const moveTone = (v) => (v === null || v === undefined ? "text-slate-400" : v >= 0 ? "text-emerald-700" : "text-rose-700");
const level = (v) => (v === null || v === undefined ? "—" : v % 1 ? v.toFixed(1) : String(v));

// Each day with its figures for the expiry window shown, counting the options
// expiring at that day's close (`same`) or not, and what the price did over
// the next 1, 5 and 10 days (3:59 p.m. to 3:59 p.m.).
function withMoves(days, key, same) {
  return days.map((d, i) => {
    const set = same || !d.next ? d.windows : d.next;
    const w = set?.[key] || set?.all || {};
    const ahead = (n) => (days[i + n] ? days[i + n].spot / d.spot - 1 : null);
    return { ...d, net: w.netGex ?? null, flip: w.flip ?? null, cw: w.callWall ?? null, pw: w.putWall ?? null, m1: ahead(1), m5: ahead(5), m10: ahead(10) };
  });
}

// Price and the day's levels, every day: the price line, the flip dashed, the
// call and put walls as a step per day, negative-gamma days shaded. Click a
// day to open it.
function SeriesChart({ rows, width, picked, onPick }) {
  const [hover, setHover] = useState(null);
  const H = 260;
  const M = { l: 48, r: 10, t: 10, b: 24 };
  const n = rows.length;
  const iw = Math.max(1, width - M.l - M.r);
  const ih = H - M.t - M.b;
  const vals = rows.flatMap((d) => [d.spot, d.flip, d.cw, d.pw]).filter((v) => typeof v === "number");
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const tick = step(hi0 - lo0, 5);
  const lo = Math.floor(lo0 / tick) * tick;
  const hi = Math.ceil(hi0 / tick) * tick;
  const X = (i) => M.l + ((i + 0.5) / n) * iw;
  const x0 = (i) => M.l + (i / n) * iw;
  const x1 = (i) => M.l + ((i + 1) / n) * iw;
  const Y = (v) => M.t + ((hi - v) / (hi - lo || 1)) * ih;
  if (!width || !n) return <div style={{ height: H }} />;

  let price = "";
  let flip = "";
  let pen = false;
  rows.forEach((d, i) => {
    price += `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d.spot).toFixed(1)}`;
    if (d.flip === null) pen = false;
    else { flip += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(d.flip).toFixed(1)}`; pen = true; }
  });
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const months = [];
  rows.forEach((d, i) => { if (!i || d.day.slice(5, 7) !== rows[i - 1].day.slice(5, 7)) months.push(i); });
  const at0 = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left - M.l) / iw) * n);
    return i >= 0 && i < n ? i : null;
  };
  const h = hover !== null ? rows[hover] : null;

  return (
    <div className="relative">
      <svg width={width} height={H} role="img" aria-label="Price, zero-gamma flip, call wall and put wall on each day; negative-gamma days shaded"
        onMouseMove={(e) => setHover(at0(e))} onMouseLeave={() => setHover(null)} onClick={(e) => { const i = at0(e); if (i !== null) onPick(i); }} className="cursor-pointer">
        {rows.map((d, i) => d.net !== null && d.net < 0 && <rect key={`n${d.day}`} x={x0(i)} y={M.t} width={x1(i) - x0(i)} height={ih} fill={NEG_BAND} />)}
        {picked !== null && <rect x={x0(picked)} y={M.t} width={x1(picked) - x0(picked)} height={ih} fill="#cbd5e1" opacity="0.55" />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={M.l + iw} y1={Y(v)} y2={Y(v)} stroke={GRID} />
            <text x={M.l - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill={AXIS}>{at(v)}</text>
          </g>
        ))}
        {months.map((i) => <text key={`m${i}`} x={X(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={AXIS}>{shortDay(rows[i].day)}</text>)}
        {rows.map((d, i) => d.cw !== null && <line key={`c${d.day}`} x1={x0(i) + 1} x2={x1(i) - 1} y1={Y(d.cw)} y2={Y(d.cw)} stroke={CALL} strokeWidth="2.5" />)}
        {rows.map((d, i) => d.pw !== null && <line key={`p${d.day}`} x1={x0(i) + 1} x2={x1(i) - 1} y1={Y(d.pw)} y2={Y(d.pw)} stroke={PUT} strokeWidth="2.5" />)}
        <path d={flip} fill="none" stroke={FLIP} strokeWidth="1.75" strokeDasharray="5 4" />
        <path d={price} fill="none" stroke={INK} strokeWidth="2" />
        {picked !== null && <circle cx={X(picked)} cy={Y(rows[picked].spot)} r="4.5" fill={INK} stroke="#fff" strokeWidth="2" />}
        <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ih} stroke={GRID} />
      </svg>
      {h && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-md border border-slate-200 bg-white p-2 text-[11px] shadow-lg tabular-nums"
          style={{ left: Math.min(X(hover) + 12, width - 216), top: 8 }}>
          <div className="font-semibold text-slate-900">{longDay(h.day)}</div>
          <div className="flex justify-between"><span className="text-slate-500">Price at 3:59</span><span>{at(h.spot)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Net gamma</span><span className={h.net < 0 ? "text-rose-700" : "text-blue-800"}>{h.net === null ? "—" : money(h.net)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Flip</span><span>{h.flip === null ? "none within 12%" : at(h.flip)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Call wall / put wall</span><span>{level(h.cw)} / {level(h.pw)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Next day</span><span className={moveTone(h.m1)}>{pct(h.m1)}</span></div>
          <div className="mt-0.5 text-slate-500">Click to open this day</div>
        </div>
      )}
    </div>
  );
}

// What happened over the closes after the day picked, against its levels.
function reachedOf(rows, i) {
  const d = rows[i];
  const ahead = rows.slice(i + 1, i + 6);
  if (!ahead.length) return ["No later days kept yet."];
  const span = `in the ${ahead.length} close${ahead.length > 1 ? "s" : ""} after`;
  const when = (k) => `${k + 1} day${k ? "s" : ""} later (${shortDay(ahead[k].day)})`;
  const out = [];
  if (d.pw !== null) {
    const k = ahead.findIndex((x) => x.spot <= d.pw);
    out.push(`Put wall ${level(d.pw)}: ${d.spot <= d.pw ? "the price was already at or below it." : k >= 0 ? `closed at or below it ${when(k)}.` : `not reached ${span}.`}`);
  }
  if (d.cw !== null) {
    const k = ahead.findIndex((x) => x.spot >= d.cw);
    out.push(`Call wall ${level(d.cw)}: ${d.spot >= d.cw ? "the price was already at or above it." : k >= 0 ? `closed at or above it ${when(k)}.` : `not reached ${span}.`}`);
  }
  if (d.flip !== null) {
    const above = d.spot >= d.flip;
    const k = ahead.findIndex((x) => (x.spot >= d.flip) !== above);
    out.push(`Flip ${at(d.flip)}: ${k >= 0 ? `closed on the other side ${when(k)}.` : `stayed ${above ? "above" : "below"} it ${span}.`}`);
  }
  return out;
}

// After each regime: how far the price moved, either way, and which way.
function regimeStats(rows) {
  const group = (name, keep) => {
    const g = rows.filter(keep);
    const one = g.filter((d) => d.m1 !== null);
    const five = g.filter((d) => d.m5 !== null);
    const avg = (xs, f) => (xs.length ? xs.reduce((t, d) => t + f(d), 0) / xs.length : null);
    const big = one.filter((d) => Math.abs(d.m1) > 0.03).length;
    return {
      name, days: g.length,
      abs1: avg(one, (d) => Math.abs(d.m1)), big, of: one.length,
      abs5: avg(five, (d) => Math.abs(d.m5)), dir5: avg(five, (d) => d.m5), n5: five.length
    };
  };
  return [group("Positive", (d) => d.net !== null && d.net >= 0), group("Negative", (d) => d.net !== null && d.net < 0)];
}

/**
 * `view`/`set`: the Gamma page's saved settings (`hsym`: the symbol shown
 * here; the expiry window, range and measure shared with Live);
 * `modeSwitch`: the Live / History control; `onGuide` opens the guide.
 */
export default function GexHistory({ active, view, set, modeSwitch, onGuide }) {
  const [list, setList] = useState({ loading: true, error: null, symbols: [], symbol: null, days: [] });
  const [pickedDay, setPickedDay] = useState(null);
  const [day, setDay] = useState({ loading: false, error: null, chain: null });
  const [expiry, setExpiry] = useState(null);
  const chains = useRef(new Map());

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    setList((s) => ({ ...s, loading: true, error: null }));
    invokeFunction("terminal", { action: "gexHistory", symbol: view.hsym || undefined })
      .then((r) => {
        if (!alive) return;
        if (r?.data?.error || r?.error) { setList((s) => ({ ...s, loading: false, error: r?.data?.error || String(r.error?.message || r.error) })); return; }
        setList({ loading: false, error: null, symbols: r.data.symbols || [], symbol: r.data.symbol, days: r.data.days || [] });
      })
      .catch((e) => alive && setList((s) => ({ ...s, loading: false, error: String(e?.message || e) })));
    return () => { alive = false; };
  }, [active, view.hsym]);

  const sym = list.symbol;
  const key = WINDOW_KEY[view.win] || "month";
  const same = view.hsame === true;
  const rows = useMemo(() => withMoves(list.days, key, same), [list.days, key, same]);
  const found = rows.findIndex((d) => d.day === pickedDay);
  // Opens on the newest day with a day after it kept, so "what the price did
  // next" has something to show.
  const picked = rows.length ? (found >= 0 ? found : Math.max(0, rows.length - 2)) : null;
  const d = picked !== null ? rows[picked] : null;

  // The day's own chain, for the figures and charts below; kept once read.
  useEffect(() => {
    if (!sym || !d) return undefined;
    const id = `${sym}|${d.day}`;
    setExpiry(null);
    const kept = chains.current.get(id);
    if (kept) { setDay({ loading: false, error: null, chain: kept }); return undefined; }
    let alive = true;
    setDay((s) => ({ ...s, loading: true, error: null }));
    invokeFunction("terminal", { action: "gexHistoryDay", symbol: sym, day: d.day })
      .then((r) => {
        if (!alive) return;
        if (r?.data?.error || r?.error) { setDay({ loading: false, error: r?.data?.error || String(r.error?.message || r.error), chain: null }); return; }
        chains.current.set(id, r.data);
        setDay({ loading: false, error: null, chain: r.data });
      })
      .catch((e) => alive && setDay({ loading: false, error: String(e?.message || e), chain: null }));
    return () => { alive = false; };
  }, [sym, d?.day]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = day.chain && day.chain.symbol === sym && d && day.chain.day === d.day ? day.chain : null;
  const chain = useMemo(() => (read && !same ? withoutExpiry(read, read.day) : read), [read, same]);
  const prepared = useMemo(() => (chain ? prepare(chain, Date.parse(chain.at)) : null), [chain]);
  // A past day carries no volume: Measure offers gamma and open interest only.
  const metrics = METRICS.filter(([id]) => id !== "volume");
  const boardView = view.metric === "volume" ? { ...view, metric: "gex" } : view;
  const stats = useMemo(() => regimeStats(rows), [rows]);
  const negDays = stats[1].days;
  const [seriesRef, seriesW] = useWidth();
  const go = (i) => { if (rows[i]) setPickedDay(rows[i].day); };
  const meta = list.symbols.find((x) => x.symbol === sym);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        {modeSwitch}
        <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Symbol
          <select value={sym || ""} onChange={(e) => { setPickedDay(null); set({ hsym: e.target.value }); }} aria-label="Symbol with past days kept"
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold normal-case tracking-normal text-slate-900">
            {!list.symbols.length && <option value="">None kept yet</option>}
            {list.symbols.map((x) => <option key={x.symbol} value={x.symbol}>{x.symbol} · {x.days} days</option>)}
          </select>
        </label>
        <Seg label="Expiries" value={expiry !== null ? null : view.win} options={WINDOWS} onChange={(id) => { setExpiry(null); set({ win: id }); }} />
        {prepared && (
          <select value={expiry ?? ""} onChange={(e) => setExpiry(e.target.value === "" ? null : Number(e.target.value))} aria-label="One expiry"
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
            <option value="">One expiry…</option>
            {prepared.expiries.map((e, i) => e.open && <option key={e.expiry} value={i}>{e.expiry} ({e.days === 0 ? "that day" : `${e.days}d`})</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-700" title="Options expiring at that day's close are gone by the next morning: left out, the levels are the ones still standing for the next day.">
          <input type="checkbox" checked={same} onChange={(e) => set({ hsame: e.target.checked })} />Count that day&apos;s expiring options (0DTE)
        </label>
        <Seg label="Range" value={view.range} options={RANGES} onChange={(r) => set({ range: r })} />
        <Seg label="Measure" value={boardView.metric} options={metrics} onChange={(m) => set({ metric: m })} />
        <div className="ml-auto flex items-center gap-2">
          {meta && <span className="text-[11px] text-slate-500">{shortDay(meta.from)} to {longDay(meta.to).replace(/^\w+ /, "")} · each day at 3:59 p.m. New York</span>}
          <button type="button" onClick={onGuide} className="flex items-center gap-1 rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800">
            <BookOpen className="h-3.5 w-3.5" />How to read this
          </button>
        </div>
      </div>

      {list.error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{list.error}</p>}
      {list.loading && !rows.length && <p className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Reading the days kept…</p>}
      {!list.loading && !list.error && !rows.length && (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">No past days kept yet. Past days are added from Databento&apos;s options record, a symbol at a time.</p>
      )}

      {rows.length > 0 && d && (
        <>
          <Card title="Price and gamma levels, day by day" note={`Each day's flip and walls at 3:59 p.m. New York, ${WINDOWS.find(([id]) => id === view.win)?.[1].toLowerCase()} of expiries, ${same ? "counting the options expiring that day" : "without the options expiring that day (the levels left for the next day)"}. Click a day to open it below.`}
            right={<Legend items={[[INK, "Price"], [FLIP, "Zero-gamma flip", true], [CALL, "Call wall"], [PUT, "Put wall"], [NEG_BAND, "Negative gamma"]]} />}>
            <div ref={seriesRef}><SeriesChart rows={rows} width={seriesW} picked={picked} onPick={go} /></div>
          </Card>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => go(picked - 1)} disabled={picked === 0} aria-label="Previous day"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{longDay(d.day)}</h3>
                <p className="text-[11px] text-slate-500">Day {picked + 1} of {rows.length} · {sym} at {at(d.spot)} · gamma {d.net === null ? "—" : d.net < 0 ? "negative" : "positive"}</p>
              </div>
              <button type="button" onClick={() => go(picked + 1)} disabled={picked === rows.length - 1} aria-label="Next day"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              <div className="ml-auto grid grid-cols-3 gap-2">
                {[["Next day", 1, d.m1], ["5 days later", 5, d.m5], ["10 days later", 10, d.m10]].map(([label, k, v]) => (
                  <div key={label} className="min-w-[7.5rem] rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
                    <div className={`text-base font-semibold tabular-nums ${moveTone(v)}`}>{pct(v)}</div>
                    <div className="text-[11px] tabular-nums text-slate-500">{v === null ? "after the days kept" : `to ${at(rows[picked + k].spot)}, ${shortDay(rows[picked + k].day)}`}</div>
                  </div>
                ))}
              </div>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12px] text-slate-700">
              {reachedOf(rows, picked).map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="mt-1 text-[11px] text-slate-500">On closing prices (3:59 p.m.); a wall touched during a day and left by its close is not counted.</p>
          </section>

          {day.error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{day.error}</p>}
          {!chain && day.loading && <p className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Reading {shortDay(d.day)}…</p>}
          {chain && prepared && (
            <GexBoard sym={sym} mine={chain} prepared={prepared} spot={chain.spot} shownSpot={chain.spot} view={boardView} set={set}
              expiry={expiry} setExpiry={setExpiry} history sameDay={same} />
          )}

          <Card title={`How ${sym} moved after each regime`} note="From each day's 3:59 p.m. price to the following days' 3:59 p.m. prices. Moves either way are averaged without their sign.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-[12px] tabular-nums">
                <thead>
                  <tr className="text-right text-[10px] uppercase tracking-wider text-slate-500">
                    <th scope="col" className="pb-1 text-left font-semibold">Gamma at the close</th>
                    <th scope="col" className="pb-1 font-semibold">Days</th>
                    <th scope="col" className="pb-1 font-semibold">Next day, average move</th>
                    <th scope="col" className="pb-1 font-semibold">Next day over 3%</th>
                    <th scope="col" className="pb-1 font-semibold">5 days, average move</th>
                    <th scope="col" className="pb-1 font-semibold">5 days, average direction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.map((s) => (
                    <tr key={s.name} className="text-right">
                      <th scope="row" className="py-1.5 text-left font-semibold">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.name === "Negative" ? "bg-rose-50 text-rose-800" : "bg-blue-50 text-blue-800"}`}>{s.name}</span>
                      </th>
                      <td className="py-1.5">{s.days}</td>
                      <td className="py-1.5">{s.abs1 === null ? "—" : `${(s.abs1 * 100).toFixed(2)}%`}</td>
                      <td className="py-1.5">{s.of ? `${s.big} of ${s.of} (${Math.round((s.big / s.of) * 100)}%)` : "—"}</td>
                      <td className="py-1.5">{s.abs5 === null ? "—" : `${(s.abs5 * 100).toFixed(2)}%`}</td>
                      <td className="py-1.5">{s.dir5 === null ? "—" : `${pct(s.dir5, 2)} (${s.n5} days)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">
              {negDays < 30
                ? `${negDays} negative-gamma day${negDays === 1 ? "" : "s"} is too few to rely on: one big day moves the average. These figures firm up as more months and symbols are kept.`
                : "A record of what followed, not a rule: regimes cluster, so neighbouring days are not independent."}
            </p>
          </Card>

          <Card title="Every day" note="Newest first. Click a day to open it.">
            <div className="max-h-[26rem] overflow-auto rounded-md border border-slate-100">
              <table className="w-full min-w-[52rem] text-[12px] tabular-nums">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-right text-[10px] uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">Day</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Price</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">Gamma</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Net</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Flip</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Call wall</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Put wall</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Next day</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">5 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
                    <tr key={r.day} onClick={() => go(i)} className={`cursor-pointer text-right hover:bg-slate-50 ${i === picked ? "bg-slate-100" : ""}`}>
                      <td className="px-2 py-1.5 text-left">
                        <button type="button" onClick={(e) => { e.stopPropagation(); go(i); }} aria-label={`Open ${longDay(r.day)}`} aria-current={i === picked ? "true" : undefined}
                          className="font-semibold text-slate-900 hover:underline">{shortDay(r.day)}</button>
                      </td>
                      <td className="px-2 py-1.5">{at(r.spot)}</td>
                      <td className="px-2 py-1.5 text-left">
                        {r.net !== null && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${r.net < 0 ? "bg-rose-50 text-rose-800" : "bg-blue-50 text-blue-800"}`}>{r.net < 0 ? "Negative" : "Positive"}</span>}
                      </td>
                      <td className="px-2 py-1.5">{r.net === null ? "—" : money(r.net)}</td>
                      <td className="px-2 py-1.5">{r.flip === null ? "none" : `${at(r.flip)} (${pct(r.flip / r.spot - 1)})`}</td>
                      <td className="px-2 py-1.5">{level(r.cw)}</td>
                      <td className="px-2 py-1.5">{level(r.pw)}</td>
                      <td className={`px-2 py-1.5 font-semibold ${moveTone(r.m1)}`}>{pct(r.m1)}</td>
                      <td className={`px-2 py-1.5 font-semibold ${moveTone(r.m5)}`}>{pct(r.m5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
