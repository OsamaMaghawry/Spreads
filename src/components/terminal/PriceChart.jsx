import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createChart, createSeriesMarkers, createTextWatermark, CandlestickSeries, HistogramSeries, LineSeries, LineStyle, CrosshairMode } from "lightweight-charts";
import { MousePointer2, Slash, MoveUpRight, Minus, SeparatorVertical, RectangleHorizontal, Rows3, Ruler, Trash2, Eraser, Activity, X, Type, CalendarDays, History, Pencil, ArrowUpDown } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { INTERVALS, applyTrade, applyMinuteBar, isCrypto, priceFormatFor, inRegularHours, sessionDay, sessionOf, px, sizeText } from "@/lib/terminal";
import { INDICATORS, LINE_COLORS, cleanIndicators, defaultParams, indicatorLabel, indicatorSeries } from "@/lib/indicators";
import { TOOLS, COLORS, pointsFor, logicalToTime, hitTest, moveDrawing, readDrawings, writeDrawings, cleanDrawings } from "@/lib/chartDrawings";
import { EVENT_KINDS, econEvents, earningsEvent, placeEvents, cleanShown, nextOfEach, eventWhen, badgeAt } from "@/lib/marketEvents";
import { readPrefs, savePref, settle } from "@/lib/terminalPrefs";
import useAccountSetting from "@/components/terminal/useAccountSetting";
import { replayCandles, REPLAY_INTERVALS } from "@/lib/replay";
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
//
// Sessions and indicators (24 Oct: "change between Market hours and Extended
// hours"; "indicators EMA, MA, VWAP, MACD, RSI, Bollinger bands, etc."). A
// share's intraday chart shows regular hours (9:30 to 16:00 New York) or all
// hours, with pre-market and after hours shaded; coins trade around the clock
// and have no switch. Indicators are computed from the candles on screen
// (lib/indicators.js): averages, VWAP and Bollinger Bands on the price, RSI,
// MACD, Stochastic and ATR each in a pane below. The list is kept in this
// browser and applies to every symbol, as on a desk platform.
//
// Events (24 Oct: "earnings sign or something ... CPI, PMI, FOMC etc...
// Having the option to add them or hide them"): a badge along the foot of the
// chart for each of the company's earnings reports and each scheduled
// economic release (lib/marketEvents.js), each kind shown or hidden from the
// Events menu; hover a badge for what it was and when.
//
// Bar replay (25 Oct: "stock replay where I can set the date from to ... for
// training purposes. and make sure to be accurate accross all time frames"):
// the chart rewound to a chosen moment and played forward, every interval
// built from the same one-minute candles (lib/replay.js), with a practice
// account that the replay bar and the hotkeys trade. The live feed is set
// aside until the replay ends. The replay belongs to the page
// (components/terminal/useReplay.js), so every chart on screen follows the
// same clock, each with its own symbol (25 Oct: "open muliple ticker at the
// same time during the reply"). The practice stop and take-profit are lines on
// the chart and fill by themselves when the replay reaches them; the replay's
// date sits behind the candles and every date on the axis carries its month
// or year (25 Oct: "The date and year don't show in the time axis so I don't
// know where year i am").

const UP = "#059669";
const DOWN = "#e11d48";
const DRAW_KEY = "dm.terminal.drawings";
const SESSION_KEY = "dm.terminal.session";
const IND_KEY = "dm.terminal.indicators";
const EVENTS_KEY = "dm.terminal.events";
// Your own trades on the chart, each part shown or hidden (26 Oct: "give me
// the opiotn to remove the positions or order annotation from the chart as
// it gets noisy sometimes"): the arrows for buys and sells, their labels,
// and the replay position's average, stop and take-profit lines.
// How often a share's fifteen-minute-old history is read again.
const REFILL_MS = 60000;
const TRADES_KEY = "dm.terminal.chartTrades";
const TRADE_MARKS = { arrows: true, labels: true, lines: true };
const cleanMarks = (v) => Object.fromEntries(Object.entries(TRADE_MARKS).map(([k, d]) => [k, typeof v?.[k] === "boolean" ? v[k] : d]));
// Every chart on the page follows a change made on any of them.
const marksCharts = new Set();
const ECON = econEvents();
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
const ICONS = { trend: Slash, ray: MoveUpRight, hline: Minus, vline: SeparatorVertical, rect: RectangleHorizontal, fib: Rows3, measure: Ruler, text: Type };
const STEP = Object.fromEntries(INTERVALS.map((i) => [i.id, i.seconds]));
const CALENDAR = ["1Day", "1Week", "1Month"];
const SECONDS_INTERVALS = ["5Sec", "10Sec", "15Sec", "30Sec"];
const HOURLY = ["1Hour", "2Hour", "4Hour"];

const loadDrawings = (symbol) => {
  try { return readDrawings(localStorage.getItem(DRAW_KEY), symbol); } catch { return []; }
};
const saveDrawings = (symbol, drawings) => {
  try { localStorage.setItem(DRAW_KEY, writeDrawings(localStorage.getItem(DRAW_KEY), symbol, drawings)); } catch { /* private window */ }
};
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * `replay`: the page's replay (useReplay), with `replayOn`, its moment
 * (`replayCursor`), a count that moves when candles arrive (`replayVersion`)
 * and this symbol's practice account (`replayAcct`). `active`: the chart a
 * "1 candle" step follows. `label`: show the symbol (several charts at once).
 */
function PriceChart({
  accountId, symbol, interval, onInterval, listen, fills = [],
  replay = null, replayOn = false, replayCursor = null, replayVersion = 0, replayAcct = null, onReplayButton = () => {}, active = true, label = false,
  stockFeed = "iex", liveSource = "iex", onSearch = null
}) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const volumeRef = useRef(null);
  const layerRef = useRef(null);
  const lastRef = useRef(null);
  // The first candle built from live trades since the history was read: what
  // the history read again is joined to, never drawn over.
  const liveFrom = useRef(null);
  const markersRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, count: 0 });
  const crypto = isCrypto(symbol);

  // Every bar read (rawRef) and the ones on screen (barsRef): a regular-hours
  // chart leaves out pre-market and after-hours bars without reading again.
  const rawRef = useRef([]);
  const barsRef = useRef([]);
  const extRef = useRef([]);
  // Regular or all hours, kept with the account (useAccountSetting.js).
  const [session, setSession] = useAccountSetting("chartsession", {
    localKey: SESSION_KEY, initial: () => "regular", clean: (v) => (v === "all" ? "all" : "regular"), fromLocal: (raw) => raw, toLocal: (v) => v
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [indicators, setIndicators] = useState(() => {
    try { return cleanIndicators(JSON.parse(read(IND_KEY, "[]"))); } catch { return []; }
  });
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  const indSeriesRef = useRef([]);
  const indTimer = useRef(null);
  const [menu, setMenu] = useState(false);
  // Events: which kinds show, the company's reports, and the badge under the pointer.
  const [shown, setShown] = useState(() => {
    try { return cleanShown(JSON.parse(read(EVENTS_KEY, "null"))); } catch { return cleanShown(null); }
  });
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [earnings, setEarnings] = useState({ symbol: null, list: [], sources: null });
  const earningsRef = useRef([]);
  const placedRef = useRef([]);
  const hoverIdRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [eventsMenu, setEventsMenu] = useState(false);
  const [marks, setMarks] = useState(() => { try { return cleanMarks(JSON.parse(read(TRADES_KEY, "null"))); } catch { return cleanMarks(null); } });
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [tradesMenu, setTradesMenu] = useState(false);
  // Several charts at once: one row of controls, the drawing tools behind a button.
  const compact = label;
  const [toolsOpen, setToolsOpen] = useState(false);
  // The replay's moment while one runs (null when live), the faint date
  // behind the candles, and the practice position's lines.
  const cursorRef = useRef(null);
  cursorRef.current = replayOn ? replayCursor : null;
  const markRef = useRef(null);
  const exitLinesRef = useRef([]);
  const readyFor = useRef(null);
  const cryptoRef = useRef(crypto);
  cryptoRef.current = crypto;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

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
  // A text note being typed: where its box sits and what it says so far.
  const [editing, setEditing] = useState(null);
  symbolRef.current = symbol;

  const repaint = () => layerRef.current?.update();
  const setTool = (t) => { toolRef.current = t; setToolState(t); draftRef.current = null; setDrafting(false); repaint(); };
  const select = (id) => { selectedRef.current = id; setSelectedState(id); repaint(); };
  // Drawings are saved per symbol, in this browser and with the account
  // ("drawings:AAPL"), so each ticker keeps its own wherever it is opened.
  const drawVersion = useRef(0);
  const commit = useCallback((next) => {
    drawingsRef.current = next;
    drawVersion.current += 1;
    setDrawings(next);
    saveDrawings(symbolRef.current, next);
    savePref(`drawings:${symbolRef.current}`, cleanDrawings(next));
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
        // New York time on the crosshair, whatever the viewer's clock says.
        // A coin's day, week and month start at midnight UTC: read in New
        // York time they would show the evening before, so they are dated in
        // UTC. Everything else is New York time.
        // With the weekday and year, so a replayed moment is never in doubt.
        timeFormatter: (t) => {
          const day = CALENDAR.includes(intervalRef.current);
          return new Date(t * 1000).toLocaleString("en-US", {
            timeZone: cryptoRef.current && day ? "UTC" : "America/New_York", weekday: "short", year: "numeric", month: "short", day: "numeric",
            ...(day ? {} : { hour: "2-digit", minute: "2-digit", hour12: false })
          });
        }
      }
    });
    // And on the time axis: the library labels its ticks in UTC unless told
    // otherwise, which put the axis four or five hours off the crosshair.
    const nyTick = (t, type) => {
      const d = new Date(t * 1000);
      const zone = cryptoRef.current && CALENDAR.includes(intervalRef.current) ? "UTC" : "America/New_York";
      const f = (o) => d.toLocaleString("en-US", { timeZone: zone, ...o });
      // A month's tick carries its year and a day's its month.
      if (type === 0) return f({ year: "numeric" });
      if (type === 1) return f({ month: "short", year: "numeric" });
      if (type === 2) return f({ month: "short", day: "numeric" });
      return f({ hour: "2-digit", minute: "2-digit", hour12: false, ...(type === 4 ? { second: "2-digit" } : {}) });
    };
    chart.applyOptions({ timeScale: { tickMarkFormatter: nyTick, tickMarkMaxCharacterLength: 8 } });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN
    });
    // Volume: no label on the price axis, where its number would read as a price.
    volumeRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const layer = new DrawingLayer(() => ({
      drawings: drawingsRef.current, draft: draftRef.current, selected: selectedRef.current, times: timesRef.current, step: stepRef.current,
      events: placedRef.current, hover: hoverIdRef.current,
      // Pre-market and after hours shaded on an all-hours share chart.
      extended: !cryptoRef.current && sessionRef.current === "all" && !["1Day", "1Week", "1Month"].includes(intervalRef.current) ? extRef.current : null
    }));
    candles.attachPrimitive(layer);
    markersRef.current = createSeriesMarkers(candles, []);
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
    // Inside the candles' pane, not on the price or time axis, nor an
    // indicator's pane below.
    const inPane = (x, y) => x >= 0 && y >= 0 && x <= chart.timeScale().width() &&
      y <= (chart.panes()[0]?.getHeight() ?? box.clientHeight - chart.timeScale().height());

    // The second point follows the pointer until it is placed.
    const onMove = (param) => {
      // The badge under the pointer, for its card.
      const badge = param.point ? badgeAt(layer.badges, param.point.x, param.point.y) : null;
      const id = badge?.event.id || null;
      if (id !== hoverIdRef.current) {
        hoverIdRef.current = id;
        setHover(badge ? { event: badge.event, x: badge.dot ? badge.x : badge.x + badge.w / 2, y: badge.y } : null);
        repaint();
      }
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
      if (t === "text") {
        // Placed empty, then typed into where it sits (Enter keeps it).
        const d = { id: newId(), type: "text", points: [p], color: colorRef.current, text: "" };
        place(d);
        setEditing({ id: d.id, x, y, value: "" });
        return;
      }
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
    // Double-click a note to change its words.
    const onDouble = (e) => {
      const { x, y } = local(e);
      const hit = hitTest(drawingsRef.current, xy, x, y);
      const d = hit && drawingsRef.current.find((k) => k.id === hit.id);
      if (!d || d.type !== "text") return;
      e.stopPropagation();
      const at = xy(d.points[0]);
      if (at) setEditing({ id: d.id, x: at.x, y: at.y, value: d.text || "" });
    };
    box.addEventListener("dblclick", onDouble, true);
    // The same press, as the mouse and touch events the chart also listens to.
    const swallowIfHeld = (e) => { if (swallow) e.stopPropagation(); };
    box.addEventListener("pointerdown", onDown, true);
    box.addEventListener("mousedown", swallowIfHeld, true);
    box.addEventListener("touchstart", swallowIfHeld, true);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      box.removeEventListener("pointerdown", onDown, true);
      box.removeEventListener("dblclick", onDouble, true);
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

  // Each symbol has its own drawings: this browser's at once, then the
  // account's copy, which wins unless a drawing changed in the meantime.
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
    const key = `drawings:${symbol}`;
    const version = drawVersion.current;
    let alive = true;
    readPrefs([key]).then((p) => {
      if (!alive || drawVersion.current !== version) return;
      const s = settle(Array.isArray(p[key]) ? cleanDrawings(p[key]) : null, list);
      if (s.upload) { if (list.length) savePref(key, cleanDrawings(list)); return; }
      if (!s.value || JSON.stringify(s.value) === JSON.stringify(list)) return;
      drawingsRef.current = s.value;
      setDrawings(s.value);
      saveDrawings(symbol, s.value);
      layerRef.current?.update();
    }).catch(() => {});
    return () => { alive = false; };
  }, [symbol]);

  // Indicators and the chart events shown, from the account once read.
  const chartPrefsSynced = useRef(false);
  useEffect(() => {
    let alive = true;
    readPrefs(["indicators", "events", "trades"]).then((p) => {
      if (!alive) return;
      chartPrefsSynced.current = true;
      const ind = settle(Array.isArray(p.indicators) ? cleanIndicators(p.indicators) : null, indicatorsRef.current);
      if (ind.upload) savePref("indicators", ind.value);
      else if (ind.value && JSON.stringify(ind.value) !== JSON.stringify(indicatorsRef.current)) setIndicators(ind.value);
      if (Array.isArray(p.events)) setShown(cleanShown(p.events));
      else savePref("events", shownRef.current);
      if (p.trades && typeof p.trades === "object") setMarks(cleanMarks(p.trades));
      else savePref("trades", marksRef.current);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

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

  // Which bars belong on screen: all of them for a coin or a daily chart;
  // for a share's intraday chart, regular hours only unless all hours is on.
  const keep = useCallback((bar) => cryptoRef.current || sessionRef.current === "all" || CALENDAR.includes(intervalRef.current) ||
    inRegularHours(bar.time, STEP[intervalRef.current] || 300), []);

  // The indicators' lines, from the bars on screen. Throttled: a busy tape
  // updates the last candle many times a second, the lines twice.
  const paintIndicators = useCallback(() => {
    indTimer.current = null;
    const bars = barsRef.current;
    const day = (t) => sessionDay(t, cryptoRef.current);
    for (const { ind, series } of indSeriesRef.current) {
      const out = indicatorSeries(ind, bars, day);
      out.lines.forEach((l, i) => series[i]?.setData(l.data));
    }
  }, []);
  const scheduleIndicators = useCallback(() => {
    if (!indTimer.current) indTimer.current = setTimeout(paintIndicators, 500);
  }, [paintIndicators]);

  // The events among the candles on screen: placed again whenever the
  // candles, the kinds shown or the company's reports change.
  const placeAll = useCallback(() => {
    // In a replay, nothing that had not happened yet.
    const until = cursorRef.current;
    const all = [...ECON, ...earningsRef.current].filter((e) => !until || e.time < until);
    placedRef.current = placeEvents(all, shownRef.current, timesRef.current, stepRef.current);
    layerRef.current?.update();
  }, []);

  const show = useCallback(() => {
    const bars = rawRef.current.filter(keep);
    barsRef.current = bars;
    timesRef.current = bars.map((b) => b.time);
    extRef.current = bars.map((b) => !cryptoRef.current && sessionOf(b.time) !== "regular");
    stepRef.current = STEP[intervalRef.current] || 300;
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: stepRef.current < 60 } });
    candlesRef.current?.applyOptions({ priceFormat: priceFormatFor(bars.at(-1)?.close ?? 1) });
    candlesRef.current?.setData(bars);
    volumeRef.current?.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "#05966933" : "#e11d4833" })));
    lastRef.current = rawRef.current.at(-1) || null;
    placeAll();
    paintIndicators();
    return bars.length;
  }, [keep, paintIndicators, placeAll]);

  // A replay's candles at its moment, at the chart's interval (the replay
  // itself is further down).
  const regularNow = () => !cryptoRef.current && sessionRef.current === "regular";
  const renderReplay = useCallback((cursor) => {
    const data = replay?.dataFor(symbolRef.current);
    rawRef.current = data?.ready ? replayCandles(data, intervalRef.current, cursor, { crypto: cryptoRef.current, regular: regularNow() }) : [];
    const count = show();
    setState({ loading: !data?.ready && !data?.error, error: data?.error ? `Replay: ${data.error}` : null, count });
    // The first candles of this symbol: the replay's moment at the right edge.
    if (data?.ready && readyFor.current !== symbolRef.current) {
      readyFor.current = symbolRef.current;
      chartRef.current?.timeScale().scrollToRealTime();
    }
    // The replay's date, faint behind the candles.
    const pane = chartRef.current?.panes()[0];
    if (!pane) return;
    const date = new Date((cursor - 1) * 1000).toLocaleDateString("en-US", { timeZone: cryptoRef.current ? "UTC" : "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const lines = [{ text: `Replay · ${date}`, color: "rgba(217, 119, 6, 0.16)", fontSize: 28, fontStyle: "bold" }];
    if (markRef.current) markRef.current.applyOptions({ lines });
    else markRef.current = createTextWatermark(pane, { horzAlign: "center", vertAlign: "center", lines });
  }, [show, replay]);

  // History for the symbol and interval.
  const alignedSession = !crypto && HOURLY.includes(interval) && session === "regular" ? "regular" : "";
  useEffect(() => {
    if (!accountId || !symbol) return undefined;
    readyFor.current = null;
    if (cursorRef.current !== null) {
      // Another interval or symbol in a replay: built again, with the replay's moment at the right edge.
      renderReplay(cursorRef.current);
      chartRef.current?.timeScale().scrollToRealTime();
      return undefined;
    }
    let alive = true;
    liveFrom.current = null;
    setState({ loading: true, error: null, count: 0 });
    // A share's hourly candles on a regular-hours chart come aligned to the
    // 9:30 open (functions/terminal sessionHours); all other charts use
    // Alpaca's bars as they are and filter them by session here.
    invokeFunction("terminal", { action: "bars", accountId, symbol, interval, session: alignedSession || undefined, stockFeed: crypto ? undefined : stockFeed }).then((r) => {
      if (!alive) return;
      if (r?.data?.error) { setState({ loading: false, error: r.data.error, count: 0 }); return; }
      rawRef.current = r?.data?.bars || [];
      const count = show();
      chartRef.current?.timeScale().scrollToRealTime();
      setState({ loading: false, error: null, count });
    });
    // A share's history from every exchange ends fifteen minutes ago while
    // its live trades (EODHD's, or the delayed tape's) start from now: read
    // again every minute until it reaches the first candle built live, then
    // no more. Only the stretch before that candle is filled; the candles
    // built live stay as they were drawn (26 Oct: "The chart keeps changing.
    // Some candles get disappeared after few seconds": every minute the
    // history was drawn over them).
    let refill = null;
    if (!crypto && stockFeed === "delayed" && !SECONDS_INTERVALS.includes(interval)) {
      refill = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        invokeFunction("terminal", { action: "bars", accountId, symbol, interval, session: alignedSession || undefined, stockFeed }).then((r) => {
          const past = r?.data?.bars;
          if (!alive || !Array.isArray(past) || !past.length) return;
          const from = liveFrom.current;
          rawRef.current = from === null ? past : [...past.filter((b) => b.time < from), ...rawRef.current.filter((b) => b.time >= from)];
          // Joined: the history reaches the candle before the first live one.
          if (from !== null && past.at(-1).time >= from - (STEP[interval] || 60)) { clearInterval(refill); refill = null; }
          setState((st) => ({ ...st, count: show() }));
        }).catch(() => {});
      }, REFILL_MS);
    }
    return () => { alive = false; if (refill) clearInterval(refill); };
  }, [accountId, symbol, interval, show, alignedSession, replayOn, renderReplay, stockFeed, crypto]);

  // Regular or all hours: the same bars, filtered again (in a replay, built again).
  useEffect(() => {
    if (cursorRef.current !== null) renderReplay(cursorRef.current);
    else if (rawRef.current.length) setState((st) => ({ ...st, count: show() }));
  }, [session, show, renderReplay]);

  // Live: each trade extends the last candle; the feed's minute bar corrects it.
  useEffect(() => {
    if (!listen) return undefined;
    return listen((m) => {
      if (cursorRef.current !== null || m.symbol !== symbol || state.loading || (m.type !== "trade" && m.type !== "bar")) return;
      const next = m.type === "trade" ? applyTrade(lastRef.current, m, interval, crypto) : applyMinuteBar(lastRef.current, m, interval);
      if (!next) return;
      const raw = rawRef.current;
      if (!lastRef.current || next.time > lastRef.current.time) raw.push(next);
      else raw[raw.length - 1] = next;
      if (liveFrom.current === null) liveFrom.current = next.time;
      lastRef.current = next;
      if (!keep(next)) return;
      const bars = barsRef.current;
      if (!bars.length || next.time > bars.at(-1).time) {
        bars.push(next);
        timesRef.current = [...timesRef.current, next.time];
        extRef.current = [...extRef.current, !crypto && sessionOf(next.time) !== "regular"];
        placeAll();
      } else {
        bars[bars.length - 1] = next;
      }
      candlesRef.current?.update(next);
      volumeRef.current?.update({ time: next.time, value: next.volume, color: next.close >= next.open ? "#05966933" : "#e11d4833" });
      scheduleIndicators();
    });
  }, [listen, symbol, interval, state.loading, crypto, keep, scheduleIndicators, placeAll]);

  // The company's earnings reports, past and next (functions/terminal
  // "events"); a coin has none.
  useEffect(() => {
    earningsRef.current = [];
    setEarnings({ symbol, list: [], sources: null });
    placeAll();
    if (!accountId || !symbol || crypto) return undefined;
    let alive = true;
    invokeFunction("terminal", { action: "events", accountId, symbol }).then((r) => {
      if (!alive) return;
      const list = (r?.data?.earnings || []).map(earningsEvent);
      earningsRef.current = list;
      setEarnings({ symbol, list, sources: r?.data?.sources || null, error: r?.data?.error || null });
      placeAll();
    }).catch(() => {});
    return () => { alive = false; };
  }, [accountId, symbol, crypto, placeAll]);

  // Which of your trades' marks show: every chart on the page, kept in this
  // browser and with the account.
  useEffect(() => {
    marksCharts.add(setMarks);
    return () => { marksCharts.delete(setMarks); };
  }, []);
  const changeMarks = (next) => {
    for (const set of marksCharts) set(next);
    write(TRADES_KEY, JSON.stringify(next));
    if (chartPrefsSynced.current) savePref("trades", next);
  };

  // The kinds shown, kept in this browser.
  useEffect(() => {
    write(EVENTS_KEY, JSON.stringify(shown));
    if (chartPrefsSynced.current) savePref("events", shown);
    placeAll();
  }, [shown, placeAll]);

  // The indicators' series and panes, rebuilt when the list changes: averages
  // and bands on the price, each oscillator in a pane of its own.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    write(IND_KEY, JSON.stringify(indicators));
    if (chartPrefsSynced.current) savePref("indicators", indicators);
    for (const { series } of indSeriesRef.current) series.forEach((x) => { try { chart.removeSeries(x); } catch { /* gone */ } });
    for (let i = chart.panes().length - 1; i >= 1; i--) { try { chart.removePane(i); } catch { /* gone */ } }
    let pane = 0;
    indSeriesRef.current = indicators.map((ind) => {
      const own = INDICATORS[ind.type].pane === "own";
      const at = own ? ++pane : 0;
      const sample = indicatorSeries(ind, [], () => 0);
      const series = sample.lines.map((l) => {
        if (l.kind === "histogram") return chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, at);
        return chart.addSeries(LineSeries, {
          color: l.color, lineWidth: l.width || 1.5, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: true,
          ...(sample.range ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: sample.range[0], maxValue: sample.range[1] } }) } : {})
        }, at);
      });
      for (const level of sample.levels || []) {
        series[0]?.createPriceLine({ price: level, color: "#94a3b8", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      }
      return { ind, series };
    });
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    paintIndicators();
  }, [indicators, paintIndicators]);

  // The account's fills on this symbol, as arrows on the candle each fell in:
  // up under the bar for a buy, down over it for a sell.
  useEffect(() => {
    const times = timesRef.current;
    if (!markersRef.current) return;
    const at = (t) => {
      let lo = 0;
      let hi = times.length - 1;
      if (hi < 0 || t < times[0]) return null;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return times[lo];
    };
    // In a replay, the practice trades instead of the account's.
    const list = !marks.arrows ? []
      : replayOn ? (replayAcct?.trades || []).map((t) => ({ side: t.side, qty: t.qty, price: t.price, at: new Date(t.time * 1000).toISOString() })) : fills;
    const markers = list
      .map((f) => ({ f, time: at(Math.floor(Date.parse(f.at) / 1000)) }))
      .filter((x) => x.time !== null)
      .sort((a, b) => a.time - b.time)
      .map(({ f, time }) => ({
        time,
        position: f.side === "buy" ? "belowBar" : "aboveBar",
        shape: f.side === "buy" ? "arrowUp" : "arrowDown",
        color: f.side === "buy" ? "#047857" : "#be123c",
        text: marks.labels ? `${f.side === "buy" ? "B" : "S"} ${sizeText(f.qty)} @ ${px(f.price)}` : ""
      }));
    markersRef.current.setMarkers(markers);
  }, [fills, state.count, session, replayOn, replayAcct, marks.arrows, marks.labels]);

  // ---------- replay ----------

  // This chart's symbol is followed by the replay while it is on screen, and
  // the active chart is the one a "1 candle" step goes by.
  useEffect(() => (replayOn && replay ? replay.watch(symbol) : undefined), [replayOn, replay, symbol]);
  useEffect(() => {
    if (replayOn && active) replay?.setActive({ symbol, interval, regular: session === "regular" });
  }, [replayOn, replay, active, symbol, interval, session]);
  // Each move of the clock, and each arrival of candles: built again.
  useEffect(() => {
    if (replayOn) renderReplay(replayCursor);
  }, [replayOn, replayCursor, replayVersion, renderReplay]);
  // The replay over: its date goes from behind the candles.
  useEffect(() => {
    if (replayOn) return;
    markRef.current?.detach();
    markRef.current = null;
  }, [replayOn]);
  // The practice position on the chart: its average price, stop and take-profits.
  const acct = replayOn ? replayAcct : null;
  useEffect(() => {
    const series = candlesRef.current;
    if (!series) return;
    for (const l of exitLinesRef.current) { try { series.removePriceLine(l); } catch { /* gone */ } }
    exitLinesRef.current = [];
    if (!acct?.qty || !marks.lines) return;
    const line = (price, color, title, lineStyle) => series.createPriceLine({ price, color, title, lineStyle, lineWidth: 1, axisLabelVisible: true });
    const targets = [...acct.targets].sort((a, b) => (acct.qty > 0 ? a.price - b.price : b.price - a.price));
    exitLinesRef.current = [
      line(acct.avg, "#64748b", `${acct.qty > 0 ? "Long" : "Short"} ${sizeText(Math.abs(acct.qty))}`, LineStyle.Dotted),
      acct.stop && line(acct.stop, DOWN, "Stop", LineStyle.Dashed),
      ...targets.map((t, i) => line(t.price, UP, `TP${targets.length > 1 ? i + 1 : ""} · ${t.qty === null ? "rest" : sizeText(t.qty)}`, LineStyle.Dashed))
    ].filter(Boolean);
  }, [acct, marks.lines]);
  // A seconds interval, which cannot be replayed, becomes one minute.
  useEffect(() => {
    if (replayOn && !REPLAY_INTERVALS.includes(interval)) onInterval("1Min");
  }, [replayOn, interval, onInterval]);

  const addIndicator = (type) => {
    const used = indicators.filter((x) => INDICATORS[x.type].pane === "price").map((x) => x.color);
    const color = LINE_COLORS.find((c) => !used.includes(c)) || LINE_COLORS[0];
    setIndicators((list) => [...list, { id: newId(), type, params: defaultParams(type), color }]);
  };
  const editIndicator = (id, key, value) => setIndicators((list) => cleanIndicators(list.map((x) => (x.id === id ? { ...x, params: { ...x.params, [key]: value } } : x))));
  const removeIndicator = (id) => setIndicators((list) => list.filter((x) => x.id !== id));

  // The note's words saved; an empty note is removed rather than left blank.
  const finishText = (keep) => {
    if (!editing) return;
    const text = keep ? editing.value.trim() : (drawingsRef.current.find((d) => d.id === editing.id)?.text || "");
    commit(text
      ? drawingsRef.current.map((d) => (d.id === editing.id ? { ...d, text } : d))
      : drawingsRef.current.filter((d) => d.id !== editing.id));
    setEditing(null);
  };

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
  const toolInHand = TOOLS.find((t) => t.id === tool);
  const kinds = crypto ? EVENT_KINDS.filter((k) => k.id !== "earnings") : EVENT_KINDS;
  const upcoming = nextOfEach([...ECON, ...earnings.list]);
  const earningsNote = earnings.sources
    ? earnings.sources.sec ? "Past earnings are the company's results filings with the SEC (8-K Item 2.02), with their time of day. "
      : earnings.list.length ? "Earnings dates from the earnings calendar. " : `No earnings on record for ${symbol}${earnings.sources.secNote ? ` (${earnings.sources.secNote})` : ""}. `
    : "";
  const btn = (on) => `rounded p-1 ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5">
        {label && (
          <button type="button" onClick={() => onSearch?.()}
            className={`mr-1 rounded px-1.5 py-0.5 text-xs font-bold ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            title={`${active ? "The active chart: the watchlist, ticket and replay bar act on it." : "Make it the active chart."} Click to chart another symbol here.`}>{symbol} ▾</button>
        )}
        {!compact && INTERVALS.filter((i) => i.quick).map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onInterval(i.id)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${interval === i.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {i.label}
          </button>
        ))}
        {/* Every interval, from 5 seconds to a month. */}
        <select value={interval} onChange={(e) => onInterval(e.target.value)} title="All intervals"
          className={`rounded border px-1 py-0.5 text-xs ${INTERVALS.find((i) => i.id === interval)?.quick ? "border-slate-200 text-slate-600" : "border-slate-900 bg-slate-900 text-white"}`}>
          {["Seconds", "Minutes", "Hours", "Days"].map((g) => (
            <optgroup key={g} label={g}>
              {INTERVALS.filter((i) => i.group === g).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </optgroup>
          ))}
        </select>
        {!crypto && !["1Day", "1Week", "1Month"].includes(interval) && compact && (
          <button type="button" onClick={() => setSession(session === "regular" ? "all" : "regular")} title={session === "regular" ? "Regular hours (9:30 to 16:00 New York). Click for all hours." : "All hours, pre-market and after hours shaded. Click for regular hours."}
            className="rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100">{session === "regular" ? "Reg" : "All"}</button>
        )}
        {!crypto && !["1Day", "1Week", "1Month"].includes(interval) && !compact && (
          <div className="ml-1 flex rounded border border-slate-200 text-[11px]" role="group" aria-label="Trading hours">
            {[["regular", "Regular hours"], ["all", "All hours"]].map(([id, name]) => (
              <button key={id} type="button" onClick={() => setSession(id)} title={id === "regular" ? "9:30 to 16:00 New York" : "Pre-market (from 4:00) and after hours (to 20:00), shaded"}
                className={`px-1.5 py-0.5 ${session === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{name}</button>
            ))}
          </div>
        )}
        <div className="relative ml-1">
          <button type="button" onClick={() => setMenu((v) => !v)} title="Indicators" className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${menu ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <Activity className="h-3.5 w-3.5" />{compact ? "" : "Indicators"}{indicators.length ? ` (${indicators.length})` : ""}
          </button>
          {menu && (
            <div className="absolute left-0 z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Add</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(INDICATORS).map(([type, def]) => (
                  <button key={type} type="button" onClick={() => addIndicator(type)} className="rounded border border-slate-200 px-1.5 py-1 text-left hover:bg-slate-50">{def.label}</button>
                ))}
              </div>
              {indicators.length > 0 && <div className="mb-1 mt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">On the chart</div>}
              {indicators.map((x) => (
                <div key={x.id} className="flex items-center gap-1 border-t border-slate-100 py-1">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: INDICATORS[x.type].pane === "price" ? x.color : "#94a3b8" }} />
                  <span className="w-12 shrink-0 font-medium">{x.type.toUpperCase()}</span>
                  {INDICATORS[x.type].params.map((p) => (
                    <label key={p.key} className="flex items-center gap-0.5 text-[10px] text-slate-500" title={p.label}>
                      {p.label.slice(0, 6)}
                      <input type="number" min={1} step={p.key === "mult" ? 0.5 : 1} defaultValue={x.params[p.key]} onBlur={(e) => editIndicator(x.id, p.key, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className="w-11 rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-800" />
                    </label>
                  ))}
                  <button type="button" title="Remove" className="ml-auto" onClick={() => removeIndicator(x.id)}><X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={onReplayButton} title={replayOn ? "Leave the replay" : "Replay the charts from a past date, for practice"}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${replayOn ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <History className="h-3.5 w-3.5" />{compact ? "" : replayOn ? "Exit replay" : "Replay"}
          </button>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setTradesMenu((v) => !v)} title="Your buys, sells and position lines on the chart: show or hide them"
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${tradesMenu ? "bg-slate-900 text-white" : !marks.arrows && !marks.lines ? "text-slate-400 line-through hover:bg-slate-100" : "text-slate-600 hover:bg-slate-100"}`}>
            <ArrowUpDown className="h-3.5 w-3.5" />{compact ? "" : "Trades"}
          </button>
          {tradesMenu && (
            <div className="absolute left-0 z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Your trades on the chart</span>
                <button type="button" className="ml-auto text-[11px] text-slate-600 hover:underline" onClick={() => changeMarks({ arrows: true, labels: true, lines: true })}>All</button>
                <button type="button" className="text-[11px] text-slate-600 hover:underline" onClick={() => changeMarks({ arrows: false, labels: false, lines: false })}>None</button>
              </div>
              {[["arrows", "Buy and sell arrows"], ["labels", "Their labels (B 10 @ 3.04)"], ["lines", "Position, stop and take-profit lines (replay)"]].map(([k, name]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50 ${k === "labels" && !marks.arrows ? "text-slate-400" : "text-slate-700"}`}>
                  <input type="checkbox" checked={marks[k]} disabled={k === "labels" && !marks.arrows} onChange={(e) => changeMarks({ ...marks, [k]: e.target.checked })} />
                  {name}
                </label>
              ))}
              <p className="mt-1 border-t border-slate-100 pt-1 text-[10px] leading-snug text-slate-500">Hidden from every chart; your orders and positions are untouched.</p>
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setEventsMenu((v) => !v)} title="Earnings and economic releases on the chart"
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${eventsMenu ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <CalendarDays className="h-3.5 w-3.5" />{compact ? "" : `Events${shown.length ? ` (${kinds.filter((k) => shown.includes(k.id)).length})` : ""}`}
          </button>
          {eventsMenu && (
            <div className="absolute left-0 z-30 mt-1 w-80 rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Show on the chart</span>
                <button type="button" className="ml-auto text-[11px] text-slate-600 hover:underline" onClick={() => setShown(kinds.map((k) => k.id))}>All</button>
                <button type="button" className="text-[11px] text-slate-600 hover:underline" onClick={() => setShown([])}>None</button>
              </div>
              {kinds.map((k) => {
                const next = upcoming[k.id];
                return (
                  <label key={k.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                    <input type="checkbox" checked={shown.includes(k.id)} onChange={(e) => setShown((list) => (e.target.checked ? [...list, k.id] : list.filter((x) => x !== k.id)))} />
                    <span className="w-9 shrink-0 rounded px-1 text-center text-[9px] font-bold text-white" style={{ backgroundColor: k.color }}>{k.label}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={k.name}>{k.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{next ? `next ${new Date(next.time * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })}` : ""}</span>
                  </label>
                );
              })}
              <p className="mt-1 border-t border-slate-100 pt-1 text-[10px] leading-snug text-slate-500">
                {crypto ? "Coins have no earnings; the economic releases move them too. " : earningsNote}
                Release dates are the agencies&apos; published schedules (Fed, BLS, BEA, Census, ISM), New York time. Hover a badge for details; hollow means still to come.
              </p>
            </div>
          )}
        </div>
        {compact && (
          <button type="button" title="Drawing tools" aria-label="Drawing tools" onClick={() => setToolsOpen((v) => !v)} className={btn(toolsOpen || tool !== "cursor")}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {(!compact || toolsOpen || tool !== "cursor") && (
          <>
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
        {/* Colours when there is something to colour: a tool in hand or a drawing selected. */}
        {(tool !== "cursor" || selected) && <span className="mx-1 h-4 w-px bg-slate-200" />}
        {(tool !== "cursor" || selected) && COLORS.map((c) => (
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
          </>
        )}
        <span className={`ml-auto text-[11px] text-slate-400 ${compact && !toolInHand && !state.loading ? "hidden" : ""}`} title={crypto && !(STEP[interval] < 60) ? "Alpaca builds crypto candles from trades and, between trades, from the bid/ask midpoint, so a candle can move when nothing traded; time & sales lists actual trades only." : undefined}>
          {toolInHand ? `${toolInHand.label}: ${toolInHand.points === 1 ? "click to place" : drafting ? "click the second point" : "click the first point"} · Esc to cancel`
            : state.loading ? "Loading…" : state.error ? "" : `${state.count} bars · ${replayOn ? (crypto ? "replay, Alpaca crypto" : "replay, consolidated tape") : STEP[interval] < 60 ? "built from trades" : crypto ? "Alpaca crypto: trades and midpoints" : `${stockFeed === "delayed" ? "every exchange to 15 min ago" : "IEX"}${liveSource === "eodhd" ? " · live: EODHD" : ""}`}`}
        </span>
      </div>
      {state.error && <p className="px-3 py-2 text-xs text-rose-700">{state.error}</p>}
      {!state.loading && !state.error && state.count === 0 && rawRef.current.length > 0 && (
        <p className="px-3 py-2 text-xs text-slate-600">
          None of these candles fall in regular hours (9:30 to 16:00 New York). Switch to All hours to see them.
        </p>
      )}
      {/* Shrinks to the room left, so the time axis is never cut off below
          the replay bar (it was, at a fixed 260 pixels). */}
      <div className={`relative flex-1 ${compact ? "min-h-[90px]" : "min-h-[160px]"}`}>
        <div ref={boxRef} className={`absolute inset-0 ${tool !== "cursor" ? "cursor-crosshair" : ""}`} />
        {hover && (
          <div className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(130, hover.x), (boxRef.current?.clientWidth || 600) - 190), top: hover.y - 6 }}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hover.event.color }} />
              <span className="font-semibold text-slate-800">{hover.event.title}</span>
            </div>
            <div className="mt-0.5 text-slate-600">{eventWhen(hover.event)}</div>
            {hover.event.kind === "earnings" && hover.event.period && <div className="text-slate-500">Results for the {hover.event.period}</div>}
            {hover.event.kind !== "earnings" && hover.event.detail && <div className="text-slate-500">{hover.event.detail}</div>}
            {hover.event.kind === "earnings" && hover.event.detail && <div className="mt-0.5 tabular-nums text-slate-700">{hover.event.detail}</div>}
          </div>
        )}
        {editing && (
          <input
            autoFocus
            aria-label="Note text"
            value={editing.value}
            maxLength={200}
            placeholder="Type a note, Enter to keep"
            onChange={(e) => setEditing((ed) => ({ ...ed, value: e.target.value }))}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") finishText(true); else if (e.key === "Escape") finishText(false); }}
            onBlur={() => finishText(true)}
            className="absolute z-20 w-56 rounded border border-slate-400 bg-white px-1.5 py-0.5 text-xs shadow"
            style={{ left: editing.x, top: editing.y - 11 }}
          />
        )}
        {indicators.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {indicators.map((x) => (
              <span key={x.id} className="pointer-events-auto flex items-center gap-1 rounded bg-white/80 px-1">
                <span className="h-0.5 w-3" style={{ backgroundColor: INDICATORS[x.type].pane === "price" ? x.color : "#94a3b8" }} />
                <span className="text-slate-600">{indicatorLabel(x)}</span>
                <button type="button" title="Remove" onClick={() => removeIndicator(x.id)}><X className="h-3 w-3 text-slate-400 hover:text-rose-600" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Drawn only when its own inputs change, not on every quote the page receives.
export default memo(PriceChart);
