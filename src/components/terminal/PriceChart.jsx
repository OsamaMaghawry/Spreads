import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode } from "lightweight-charts";
import { invokeFunction } from "@/lib/functions";
import { INTERVALS, applyTrade, applyMinuteBar } from "@/lib/terminal";

// The chart: TradingView Lightweight Charts (Apache-2.0), drawn from the
// account's own Alpaca bars and kept live from its trade stream. The library's
// TradingView attribution stays visible on the chart, as its licence asks.

const UP = "#059669";
const DOWN = "#e11d48";

export default function PriceChart({ accountId, symbol, interval, onInterval, listen }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const volumeRef = useRef(null);
  const lastRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: null, count: 0 });

  // The chart itself, once.
  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#475569", attributionLogo: true },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: true, secondsVisible: false },
      localization: {
        // New York time on the axis and the crosshair, whatever the viewer's clock says.
        timeFormatter: (t) => new Date(t * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      }
    });
    candlesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN
    });
    volumeRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // History for the symbol and interval.
  useEffect(() => {
    if (!accountId || !symbol) return undefined;
    let alive = true;
    setState({ loading: true, error: null, count: 0 });
    invokeFunction("terminal", { action: "bars", accountId, symbol, interval }).then((r) => {
      if (!alive) return;
      if (r?.data?.error) { setState({ loading: false, error: r.data.error, count: 0 }); return; }
      const bars = r?.data?.bars || [];
      candlesRef.current?.setData(bars);
      volumeRef.current?.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "#05966933" : "#e11d4833" })));
      lastRef.current = bars.at(-1) || null;
      chartRef.current?.timeScale().scrollToRealTime();
      setState({ loading: false, error: null, count: bars.length });
    });
    return () => { alive = false; };
  }, [accountId, symbol, interval]);

  // Live: each trade extends the last candle; the feed's minute bar corrects it.
  useEffect(() => {
    if (!listen) return undefined;
    return listen((m) => {
      if (m.symbol !== symbol || state.loading) return;
      const next = m.type === "trade" ? applyTrade(lastRef.current, m, interval) : applyMinuteBar(lastRef.current, m, interval);
      if (!next) return;
      lastRef.current = next;
      candlesRef.current?.update(next);
      volumeRef.current?.update({ time: next.time, value: next.volume, color: next.close >= next.open ? "#05966933" : "#e11d4833" });
    });
  }, [listen, symbol, interval, state.loading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5">
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
        <span className="ml-auto text-[11px] text-slate-400">
          {state.loading ? "Loading…" : state.error ? "" : `${state.count} bars · IEX`}
        </span>
      </div>
      {state.error && <p className="px-3 py-2 text-xs text-rose-700">{state.error}</p>}
      <div ref={boxRef} className="min-h-[260px] flex-1" />
    </div>
  );
}
