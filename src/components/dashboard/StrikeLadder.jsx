import { useLayoutEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";

// Horizontal strike ladder: pale emerald profit zone, pale rose max-loss wings,
// dashed marker for the live stock price.
//
// Strike labels and price text are positioned by percentage, so how close two
// of them render depends on the card's actual pixel width (desktop vs phone).
// Rather than guess a spacing threshold, this measures the real rendered
// boxes after paint and, for any pair that would overlap, drops one onto a
// second row. useLayoutEffect runs before the browser paints, so the
// corrected layout is what the user actually sees — no visible flash of the
// colliding version first.
const MIN_GAP_PX = 6;

function assignRows(entries) {
  const sorted = [...entries].sort((a, b) => a.center - b.center);
  const rowRightEdge = [-Infinity, -Infinity];
  const rows = {};
  for (const e of sorted) {
    const left = e.center - e.half;
    const right = e.center + e.half;
    const row = rowRightEdge[0] + MIN_GAP_PX <= left ? 0 : rowRightEdge[1] + MIN_GAP_PX <= left ? 1 : 0;
    rows[e.key] = row;
    rowRightEdge[row] = Math.max(rowRightEdge[row], right);
  }
  return rows;
}

function rowsEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

const LABEL_ROW0_TOP = 30;
const LABEL_ROW_H = 20;
const LABEL_ROW_GAP = 6;
const TICK_H = 10;
const AXIS_GAP = 2;
const PRICE_ROW_GAP_AFTER_AXIS = 4;
const PRICE_ROW_H = 20;
const PRICE_ROW_GAP = 4;
const BOTTOM_PAD = 34;

// A single position -- one leg, or shares -- has one strike and a break-even,
// and that is a perfectly clear picture: profit on one side of the break-even,
// loss on the other. The first build withheld the ladder for these on the
// grounds that it plots between TWO strikes; that left a wheel card poorer than
// the spread cards beside it. Both points are marked, and the zones split at
// the break-even, which is where the P/L actually changes sign.
function singleGeometry(spread) {
  const leg = spread.legs?.[0];
  const be = typeof spread.breakEven === "number" ? spread.breakEven : null;
  if (spread.type === "shares") {
    return {
      strikes: be !== null ? [{ label: "Break-even", value: be }] : [],
      // Long stock: loses below what it cost, gains above.
      zonesAt: (pos) => (be === null ? [] : [
        { tone: "loss", from: 0, to: pos(be) },
        { tone: "profit", from: pos(be), to: 100 }
      ])
    };
  }
  if (!leg) return { strikes: [], zonesAt: () => [] };
  const short = leg.side === "short";
  const isCall = leg.kind === "call";
  const strikeLabel = `${short ? "Short" : "Long"} ${isCall ? "Call" : "Put"}`;
  const strikes = [{ label: strikeLabel, value: leg.strike }];
  if (be !== null && Math.abs(be - leg.strike) > 0.005) strikes.push({ label: "Break-even", value: be });
  // A short put profits while the stock stays ABOVE the break-even; a short
  // call -- covered or not -- while it stays BELOW. A long is the mirror of
  // the short on the same side.
  const profitAbove = short ? !isCall : isCall;
  return {
    strikes,
    zonesAt: (pos) => {
      const edge = be !== null ? be : leg.strike;
      return profitAbove
        ? [{ tone: "loss", from: 0, to: pos(edge) }, { tone: "profit", from: pos(edge), to: 100 }]
        : [{ tone: "profit", from: 0, to: pos(edge) }, { tone: "loss", from: pos(edge), to: 100 }];
    }
  };
}

export default function StrikeLadder({ spread }) {
  const isCondor = spread.type === "iron_condor";
  const isCall = spread.type === "call_spread";
  const single = !!spread.single;
  const singleGeo = single ? singleGeometry(spread) : null;

  const strikes = single
    ? singleGeo.strikes
    : isCondor
    ? [
        { label: "Long Put", value: spread.longStrike },
        { label: "Short Put", value: spread.shortStrike },
        { label: "Short Call", value: spread.callShortStrike },
        { label: "Long Call", value: spread.callLongStrike }
      ]
    : isCall
      ? [
          { label: "Short Call", value: spread.shortStrike },
          { label: "Long Call", value: spread.longStrike }
        ]
      : [
          { label: "Long Put", value: spread.longStrike },
          { label: "Short Put", value: spread.shortStrike }
        ];

  const values = strikes.map((s) => s.value).filter((v) => typeof v === "number");
  const price = spread.stockPrice || 0;

  const containerRef = useRef(null);
  const labelRefs = useRef({});
  const priceRefs = useRef({});
  const [labelRows, setLabelRows] = useState({});
  const [priceRows, setPriceRows] = useState({});

  const lo = values.length ? Math.min(...values, price || Infinity) : 0;
  const hi = values.length ? Math.max(...values, price || -Infinity) : 0;
  const span = hi - lo || 1;
  const pad = span * 0.18;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v) => ((v - min) / (max - min)) * 100;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      if (containerRect.width === 0) return;

      const labelEntries = [];
      const priceEntries = [];
      for (const s of strikes) {
        const labelEl = labelRefs.current[s.label];
        if (labelEl) {
          const r = labelEl.getBoundingClientRect();
          labelEntries.push({ key: s.label, center: r.left + r.width / 2 - containerRect.left, half: r.width / 2 });
        }
        const priceEl = priceRefs.current[s.label];
        if (priceEl) {
          const r = priceEl.getBoundingClientRect();
          priceEntries.push({ key: s.label, center: r.left + r.width / 2 - containerRect.left, half: r.width / 2 });
        }
      }

      const nextLabelRows = assignRows(labelEntries);
      const nextPriceRows = assignRows(priceEntries);
      setLabelRows((prev) => (rowsEqual(prev, nextLabelRows) ? prev : nextLabelRows));
      setPriceRows((prev) => (rowsEqual(prev, nextPriceRows) ? prev : nextPriceRows));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.type, spread.longStrike, spread.shortStrike, spread.callShortStrike, spread.callLongStrike, spread.stockPrice, spread.breakEven, spread.single]);

  if (values.length === 0) return null;

  const needsLabelRow2 = Object.values(labelRows).some((r) => r === 1);
  const needsPriceRow2 = Object.values(priceRows).some((r) => r === 1);

  const tickTop = 62 + (needsLabelRow2 ? LABEL_ROW_H + LABEL_ROW_GAP : 0);
  const axisTop = tickTop + TICK_H + AXIS_GAP;
  const priceRow0Top = axisTop + PRICE_ROW_GAP_AFTER_AXIS;
  const priceAreaHeight = needsPriceRow2 ? PRICE_ROW_H * 2 + PRICE_ROW_GAP : PRICE_ROW_H;
  const containerHeight = priceRow0Top + priceAreaHeight + BOTTOM_PAD;

  const labelTop = (label) => (labelRows[label] === 1 ? LABEL_ROW0_TOP + LABEL_ROW_H + LABEL_ROW_GAP : LABEL_ROW0_TOP);
  const priceTop = (label) => (priceRows[label] === 1 ? priceRow0Top + PRICE_ROW_H + PRICE_ROW_GAP : priceRow0Top);

  // Profit region (emerald) and max-loss wings (rose).
  const zones = [];
  if (single) {
    zones.push(...singleGeo.zonesAt(pos));
  } else if (isCondor) {
    zones.push({ tone: "loss", from: 0, to: pos(spread.longStrike) });
    zones.push({ tone: "profit", from: pos(spread.shortStrike), to: pos(spread.callShortStrike) });
    zones.push({ tone: "loss", from: pos(spread.callLongStrike), to: 100 });
  } else if (isCall) {
    zones.push({ tone: "profit", from: 0, to: pos(spread.shortStrike) });
    zones.push({ tone: "loss", from: pos(spread.longStrike), to: 100 });
  } else {
    zones.push({ tone: "loss", from: 0, to: pos(spread.longStrike) });
    zones.push({ tone: "profit", from: pos(spread.shortStrike), to: 100 });
  }

  return (
    <div className="px-6 pt-3 pb-5">
      <div ref={containerRef} className="relative" style={{ height: containerHeight }}>
        {zones.map((z, i) => (
          <div
            key={i}
            className={`absolute top-8 bottom-0 rounded-sm ${z.tone === "profit" ? "bg-emerald-100/60" : "bg-rose-100/60"}`}
            style={{ left: `${z.from}%`, width: `${Math.max(0, z.to - z.from)}%` }}
          />
        ))}

        {/* Axis */}
        <div className="absolute left-0 right-0 h-px bg-slate-300" style={{ top: axisTop }} />

        {/* Stock price marker */}
        {price > 0 && (
          <div className="absolute top-0 bottom-0" style={{ left: `${pos(price)}%` }}>
            <div className="absolute top-8 bottom-0 -translate-x-1/2 border-l-2 border-dashed border-slate-800" />
            <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 shadow-sm">
              {fmtMoney(price)}
            </div>
          </div>
        )}

        {/* Strike ticks + labels */}
        {strikes.map((s) => (
          <div key={s.label} className="absolute top-0 bottom-0" style={{ left: `${pos(s.value)}%` }}>
            <div
              ref={(el) => (labelRefs.current[s.label] = el)}
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm"
              style={{ top: labelTop(s.label) }}
            >
              {s.label}
            </div>
            <div className="absolute h-[10px] -translate-x-1/2 border-l-2 border-slate-500" style={{ top: tickTop }} />
            <div
              ref={(el) => (priceRefs.current[s.label] = el)}
              className="absolute -translate-x-1/2 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900"
              style={{ top: priceTop(s.label) }}
            >
              {fmtMoney(s.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
