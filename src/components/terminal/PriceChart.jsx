import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode } from "lightweight-charts";
import { MousePointer2, Slash, MoveUpRight, Minus, SeparatorVertical, RectangleHorizontal, Rows3, Ruler, Trash2, Eraser } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { INTERVALS, applyTrade, applyMinuteBar, isCrypto, priceFormatFor } from "@/lib/terminal";
import { TOOLS, COLORS, pointsFor, logicalToTime, hitTest, moveDrawing, readDrawings, writeDrawings } from "@/lib/chartDrawings";
import { DrawingLayer } from "./drawingLayer";

// The chart: TradingView Lightweight Charts (Apache-2.0), drawn from the
// account's own Alpaca bars and kept live from its trade stream. The library's
// TradingView attribution stays visible on the chart, as its licence asks.
//
// Drawing tools (the owner, 24 Oct 2026: "Stay on Lightweight and add drawing
// tools"): pick a tool, click once (horizontal or vertical line) or twice
// (everything else). With the pointer tool, click a drawing to select it, drag
// its handles or its body to move it, Delete to remove it. Drawings are saved
// per symbol in this browser and stay put across intervals, because they are
// stored as moments and prices (lib/chartDrawings.js).

const UP = "#059669";
const DOWN = "#e11d48";
const DRAW_KEY = "dm.terminal.drawings";
const ICONS = { trend: Slash, ray: MoveUpRight, hline: Minus, vline: SeparatorVertical, rect: RectangleHorizontal, fib: Rows3, measure: Ruler };
const STEP = Object.fromEntries(INTERVALS.map((i) => [i.id, i.seconds]));

const loadDrawings = (symbol) => {
  try { return readDrawings(localStorage.getItem(DRAW_KEY), symbol); } catch { return []; }
};
const saveDrawings = (symbol, drawings) => {
  try { localStorage.setItem(DRAW_KEY, writeDrawings(localStorage.getItem(DRAW_KEY), symbol, drawings)); } catch { /* private window */ }
};
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function PriceChart({ accountId, symbol, interval, onInterval, listen }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const volumeRef = useRef(null);
  const layerRef = useRef(null);
  const lastRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, count: 0 });
  const crypto = isCrypto(symbol);

  // Drawing state lives in refs, read by the layer at paint time and by the
  // pointer handlers; React state mirrors what the toolbar shows.
  const drawingsRef = useRef([]);
  const draftRef = useRef(null);
  const selectedRef = useRef(null);
  const timesRef = useRef([]);
  const stepRef = useRef(STEP[interval] || 300);
  const toolRef = useRef("cursor");
  const colorRef = useRef(COLORS[0]);
  const symbolRef = useRef(symbol);
  const [drawings, setDrawings] = useState([]);
  const [tool, setToolState] = useState("cursor");
  const [color, setColorState] = useState(COLORS[0]);
  const [selected, setSelectedState] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [drafting, setDrafting] = useState(false);
  symbolRef.current = symbol;

  const repaint = () => layerRef.current?.update();
  const setTool = (t) => { toolRef.current = t; setToolState(t); draftRef.current = null; setDrafting(false); repaint(); };
  const select = (id) => { selectedRef.current = id; setSelectedState(id); repaint(); };
  const commit = useCallback((next) => {
    drawingsRef.current = next;
    setDrawings(next);
    saveDrawings(symbolRef.current, next);
    layerRef.current?.update();
  }, []);

  // The chart itself, once, with the drawing layer on the candles.
  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#475569", attributionLogo: true },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: true, secondsVisible: false, rightOffset: 8 },
      localization: {
        // New York time on the axis and the crosshair, whatever the viewer's clock says.
        timeFormatter: (t) => new Date(t * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      }
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN
    });
    volumeRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const layer = new DrawingLayer(() => ({
      drawings: drawingsRef.current, draft: draftRef.current, selected: selectedRef.current, times: timesRef.current, step: stepRef.current
    }));
    candles.attachPrimitive(layer);
    candlesRef.current = candles;
    layerRef.current = layer;
    chartRef.current = chart;

    // A pane position as a stored point: the moment under x, the price under y.
    const pointAt = (x, y) => {
      const logical = chart.timeScale().coordinateToLogical(x);
      const price = candles.coordinateToPrice(y);
      const time = logical === null ? null : logicalToTime(timesRef.current, logical, stepRef.current);
      return time === null || price === null ? null : { time, price };
    };
    const xy = (p) => layer.xy(p);

    const box = boxRef.current;
    const local = (e) => {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Inside the candles' pane, not on the price or time axis.
    const inPane = (x, y) => x >= 0 && y >= 0 && x <= chart.timeScale().width() && y <= box.clientHeight - chart.timeScale().height();

    // The second point follows the pointer until it is placed.
    const onMove = (param) => {
      if (!draftRef.current || !param.point) return;
      const p = pointAt(param.point.x, param.point.y);
      if (!p) return;
      draftRef.current = { ...draftRef.current, points: [draftRef.current.points[0], p] };
      repaint();
    };
    chart.subscribeCrosshairMove(onMove);

    // Presses are read here rather than through the chart's click event: the
    // chart drops a second click that follows the first quickly (it waits to
    // see whether it was a double-click), which lost the second point of a
    // line drawn at speed. Caught before the chart sees the press, so the
    // chart does not pan underneath a drawing being placed or dragged.
    let drag = null;
    let press = null;
    let swallow = false;
    const hold = () => { swallow = true; chart.applyOptions({ handleScroll: false, handleScale: false }); };
    const release = () => { swallow = false; chart.applyOptions({ handleScroll: true, handleScale: true }); };
    const place = (d) => {
      commit([...drawingsRef.current, d]);
      select(d.id);
      setTool("cursor");
    };

    // Placing: one click for a line across; for the rest, two clicks, or
    // press at the first point, drag and let go at the second.
    const onPlaceUp = (e) => {
      window.removeEventListener("pointerup", onPlaceUp);
      release();
      const { x, y } = local(e);
      const moved = press && Math.hypot(x - press.x, y - press.y) > 4;
      const started = press?.startedDraft;
      press = null;
      const t = toolRef.current;
      const p = pointAt(Math.min(Math.max(x, 0), chart.timeScale().width()), y);
      if (!p || t === "cursor") return;
      if (pointsFor(t) === 1) {
        place({ id: newId(), type: t, points: [p], color: colorRef.current });
        return;
      }
      if (!draftRef.current || (started && !moved)) return; // a click at the first point: wait for the second
      const d = { ...draftRef.current, id: newId(), points: [draftRef.current.points[0], p] };
      draftRef.current = null;
      setDrafting(false);
      place(d);
    };

    // Dragging a drawing (pointer tool): a handle moves one point, the body
    // moves the whole drawing.
    const onDragMove = (e) => {
      if (!drag) return;
      const { x, y } = local(e);
      const p = pointAt(x, y);
      if (!p) return;
      drawingsRef.current = drawingsRef.current.map((d) => (d.id === drag.id ? moveDrawing(drag.original, drag.handle, drag.start, p) : d));
      repaint();
    };
    const onDragEnd = () => {
      window.removeEventListener("pointermove", onDragMove);
      if (drag) commit([...drawingsRef.current]);
      drag = null;
      release();
    };

    const onDown = (e) => {
      if (e.button > 0) return;
      const { x, y } = local(e);
      if (!inPane(x, y)) return;
      const t = toolRef.current;
      if (t !== "cursor") {
        const p = pointAt(x, y);
        if (!p) return;
        e.stopPropagation();
        hold();
        let startedDraft = false;
        if (pointsFor(t) === 2 && !draftRef.current) {
          draftRef.current = { id: "draft", type: t, points: [p, p], color: colorRef.current };
          setDrafting(true);
          repaint();
          startedDraft = true;
        }
        press = { x, y, startedDraft };
        window.addEventListener("pointerup", onPlaceUp);
        return;
      }
      const hit = hitTest(drawingsRef.current, xy, x, y);
      const start = hit && pointAt(x, y);
      if (!hit || !start) {
        // A click on empty chart lets go of the selection; a drag pans as usual.
        window.addEventListener("pointerup", (up) => {
          const l = local(up);
          if (Math.hypot(l.x - x, l.y - y) <= 4) select(null);
        }, { once: true });
        return;
      }
      e.stopPropagation();
      hold();
      select(hit.id);
      drag = { id: hit.id, handle: hit.handle, start, original: drawingsRef.current.find((d) => d.id === hit.id) };
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd, { once: true });
    };
    // The same press, as the mouse and touch events the chart also listens to.
    const swallowIfHeld = (e) => { if (swallow) e.stopPropagation(); };
    box.addEventListener("pointerdown", onDown, true);
    box.addEventListener("mousedown", swallowIfHeld, true);
    box.addEventListener("touchstart", swallowIfHeld, true);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      box.removeEventListener("pointerdown", onDown, true);
      box.removeEventListener("mousedown", swallowIfHeld, true);
      box.removeEventListener("touchstart", swallowIfHeld, true);
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onPlaceUp);
      chart.remove();
      chartRef.current = null;
      candlesRef.current = null;
      layerRef.current = null;
    };
    // Created once; the handlers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each symbol has its own drawings.
  useEffect(() => {
    const list = loadDrawings(symbol);
    drawingsRef.current = list;
    draftRef.current = null;
    selectedRef.current = null;
    setDrafting(false);
    setDrawings(list);
    setSelectedState(null);
    setConfirmClear(false);
    layerRef.current?.update();
  }, [symbol]);

  // Delete removes the selected drawing; Escape lets go of a half-drawn one.
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) {
        e.preventDefault();
        commit(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
        select(null);
      } else if (e.key === "Escape") {
        setTool("cursor");
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  // History for the symbol and interval.
  useEffect(() => {
    if (!accountId || !symbol) return undefined;
    let alive = true;
    setState({ loading: true, error: null, count: 0 });
    invokeFunction("terminal", { action: "bars", accountId, symbol, interval }).then((r) => {
      if (!alive) return;
      if (r?.data?.error) { setState({ loading: false, error: r.data.error, count: 0 }); return; }
      const bars = r?.data?.bars || [];
      timesRef.current = bars.map((b) => b.time);
      stepRef.current = STEP[interval] || 300;
      candlesRef.current?.applyOptions({ priceFormat: priceFormatFor(bars.at(-1)?.close ?? 1) });
      candlesRef.current?.setData(bars);
      volumeRef.current?.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "#05966933" : "#e11d4833" })));
      lastRef.current = bars.at(-1) || null;
      chartRef.current?.timeScale().scrollToRealTime();
      layerRef.current?.update();
      setState({ loading: false, error: null, count: bars.length });
    });
    return () => { alive = false; };
  }, [accountId, symbol, interval]);

  // Live: each trade extends the last candle; the feed's minute bar corrects it.
  useEffect(() => {
    if (!listen) return undefined;
    return listen((m) => {
      if (m.symbol !== symbol || state.loading || (m.type !== "trade" && m.type !== "bar")) return;
      const next = m.type === "trade" ? applyTrade(lastRef.current, m, interval, crypto) : applyMinuteBar(lastRef.current, m, interval);
      if (!next) return;
      if (!lastRef.current || next.time > lastRef.current.time) timesRef.current = [...timesRef.current, next.time];
      lastRef.current = next;
      candlesRef.current?.update(next);
      volumeRef.current?.update({ time: next.time, value: next.volume, color: next.close >= next.open ? "#05966933" : "#e11d4833" });
    });
  }, [listen, symbol, interval, state.loading, crypto]);

  const pickColor = (c) => {
    colorRef.current = c;
    setColorState(c);
    if (selectedRef.current) commit(drawingsRef.current.map((d) => (d.id === selectedRef.current ? { ...d, color: c } : d)));
  };
  const removeSelected = () => {
    if (!selectedRef.current) return;
    commit(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
    select(null);
  };
  const clearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    commit([]);
    select(null);
    setConfirmClear(false);
  };
  const active = TOOLS.find((t) => t.id === tool);
  const btn = (on) => `rounded p-1 ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5">
        {INTERVALS.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onInterval(i.id)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${interval === i.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {i.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" title="Pointer: select, move and delete drawings" className={btn(tool === "cursor")} onClick={() => setTool("cursor")}>
          <MousePointer2 className="h-3.5 w-3.5" />
        </button>
        {TOOLS.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <button key={t.id} type="button" title={t.label} aria-label={t.label} className={btn(tool === t.id)} onClick={() => setTool(tool === t.id ? "cursor" : t.id)}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {COLORS.map((c) => (
          <button key={c} type="button" title="Colour" aria-label={`Colour ${c}`} onClick={() => pickColor(c)}
            className={`h-3.5 w-3.5 rounded-full ${color === c ? "ring-2 ring-slate-400 ring-offset-1" : ""}`} style={{ backgroundColor: c }} />
        ))}
        <button type="button" title="Delete the selected drawing (Delete key)" disabled={!selected} className={`${btn(false)} disabled:opacity-30`} onClick={removeSelected}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" title={`Remove every drawing on ${symbol}`} disabled={!drawings.length} onClick={clearAll}
          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] disabled:opacity-30 ${confirmClear ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
          <Eraser className="h-3.5 w-3.5" />{confirmClear ? `Clear ${drawings.length}?` : ""}
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          {active ? `${active.label}: ${active.points === 1 ? "click to place" : drafting ? "click the second point" : "click the first point"} · Esc to cancel`
            : state.loading ? "Loading…" : state.error ? "" : `${state.count} bars · ${crypto ? "Alpaca crypto" : "IEX"}`}
        </span>
      </div>
      {state.error && <p className="px-3 py-2 text-xs text-rose-700">{state.error}</p>}
      <div ref={boxRef} className={`min-h-[260px] flex-1 ${tool !== "cursor" ? "cursor-crosshair" : ""}`} />
    </div>
  );
}
