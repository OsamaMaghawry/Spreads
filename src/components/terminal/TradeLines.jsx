import { useEffect, useRef, useState } from "react";
import { LineStyle } from "lightweight-charts";

// A position's average, stop and target, and working orders, drawn on the
// chart, each one that can move with a handle on the chart's left edge (24
// Nov, the owner: "I don't want every click on the chart to pop a trading
// ticket. we can add a small icon on the left after opening the order to drag
// the SL and TP"). A tap on the chart does nothing; only a handle drags. A
// stop or target not set yet has its handle on the average price line, to
// drag out from there. Letting go reports the new price (`onMove`); nothing is
// sent from here: the page shows the change as not sent until confirmed.
//
// `lines`: [{ id, price, color, title, draggable, handleOnly, label, slot }].

const roundPrice = (p) => (p >= 1 ? Math.round(p * 100) / 100 : Math.round(p * 10000) / 10000);

export default function TradeLines({ series, box, lines, onMove }) {
  const [ys, setYs] = useState({});
  const [drag, setDrag] = useState(null);
  const drawn = useRef([]);
  const wire = JSON.stringify(lines.map((l) => [l.id, l.price, l.color, l.title, l.handleOnly]));

  // The lines themselves, as the chart's own price lines (with their price on the axis).
  useEffect(() => {
    const s = series.current;
    if (!s) return undefined;
    drawn.current = lines.filter((l) => !l.handleOnly && Number(l.price) > 0).map((l) =>
      s.createPriceLine({ price: Number(l.price), color: l.color, title: l.title || "", lineStyle: l.id === "avg" ? LineStyle.Dotted : LineStyle.Dashed, lineWidth: l.pending ? 2 : 1, axisLabelVisible: true }));
    return () => { for (const p of drawn.current) { try { s.removePriceLine(p); } catch { /* chart gone */ } } drawn.current = []; };
    // Drawn again when a line's price or words change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wire, series]);

  // Where each handle sits, followed as the chart scrolls and rescales.
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const s = series.current;
      if (s) {
        const next = {};
        for (const l of lines) if (l.draggable && Number(l.price) > 0) next[l.id] = s.priceToCoordinate(Number(l.price));
        const key = JSON.stringify(next);
        if (key !== last) { last = key; setYs(next); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wire, series]);

  const priceAt = (clientY) => {
    const s = series.current;
    const r = box.current?.getBoundingClientRect();
    if (!s || !r) return null;
    const p = s.coordinateToPrice(clientY - r.top);
    return Number(p) > 0 ? roundPrice(Number(p)) : null;
  };
  const height = box.current?.clientHeight || 0;

  return (
    <>
      {lines.filter((l) => l.draggable && ys[l.id] !== null && ys[l.id] !== undefined).map((l) => {
        const y = drag?.id === l.id && drag.y !== null ? drag.y : ys[l.id];
        if (y < 0 || (height && y > height)) return null;
        return (
          <button key={l.id} type="button" aria-label={`Drag to move ${l.title || l.label}`}
            className="absolute z-20 flex h-8 w-10 -translate-y-1/2 touch-none select-none items-center justify-center rounded-lg text-xs font-bold text-white shadow-md"
            style={{ left: 4 + (l.slot || 0) * 44, top: y, backgroundColor: l.color }}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ id: l.id, y: ys[l.id], price: l.price, moved: false }); }}
            onPointerMove={(e) => {
              if (drag?.id !== l.id) return;
              const r = box.current?.getBoundingClientRect();
              if (!r) return;
              setDrag({ ...drag, y: e.clientY - r.top, price: priceAt(e.clientY), moved: true });
            }}
            onPointerUp={() => {
              const d = drag;
              setDrag(null);
              if (d?.moved && d.price && d.price !== l.price) onMove(l, d.price);
            }}
            onPointerCancel={() => setDrag(null)}>
            {l.label}
          </button>
        );
      })}
      {drag?.moved && drag.y !== null && (
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: drag.y }}>
          <div className="border-t-2 border-dashed" style={{ borderColor: lines.find((l) => l.id === drag.id)?.color }} />
          <span className="absolute right-16 -translate-y-1/2 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{drag.price}</span>
        </div>
      )}
    </>
  );
}
