import { useMemo, useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";

// The combined position's P/L at expiry, across underlying prices.
//
// One series, so no legend: the panel's own heading names it. Profit and loss
// are the two regions, in the same emerald and rose the strike ladder already
// uses for them, so the two pictures on one screen agree about which way is
// good. Everything else — grid, axis, ticks — is recessive slate, and the
// numbers that matter (the crossings, the spot) are labelled directly rather
// than left to a hover the reader might never try.

const W = 720;
const H = 260;
// Two rows of strike labels live above the plot, so the top pad holds them.
const PAD = { top: 32, right: 16, bottom: 34, left: 60 };

const money = (n) => (Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1000)}k` : fmtMoney(n));

export default function PayoffChart({ curve, spot, crossings = [], marks = [] }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    if (!curve?.length) return null;
    const xs = curve.map((p) => p.price);
    const ys = curve.map((p) => p.pl);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    // Zero is always in frame: a payoff chart whose baseline is off-screen
    // hides the only line the reader is looking for.
    const yLo = Math.min(0, ...ys);
    const yHi = Math.max(0, ...ys);
    const ySpan = yHi - yLo || 1;
    const yPad = ySpan * 0.12;
    const px = (v) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
    const py = (v) =>
      PAD.top + (1 - (v - (yLo - yPad)) / (yHi + yPad - (yLo - yPad))) * (H - PAD.top - PAD.bottom);
    return { x0, x1, yLo, yHi, px, py, zeroY: py(0) };
  }, [curve]);

  if (!geom) return null;
  const { px, py, zeroY, x0, x1 } = geom;

  // Left to right, dropping a label to the second row whenever it would
  // overlap the last one placed on the first. No measuring: at 10px the glyphs
  // are close enough to 5.4px wide that half a label's estimated width is a
  // reliable keep-out, and being a pixel generous costs nothing.
  const placedMarks = (() => {
    const sorted = [...marks].sort((a, b) => a.value - b.value);
    let lastRow0 = -Infinity;
    return sorted.map((m) => {
      const half = (String(m.label).length * 5.4) / 2 + 4;
      const x = px(m.value);
      if (x - half > lastRow0) {
        lastRow0 = x + half;
        return { ...m, row: 0 };
      }
      return { ...m, row: 1 };
    });
  })();

  const line = curve.map((p, i) => `${i ? "L" : "M"}${px(p.price).toFixed(1)},${py(p.pl).toFixed(1)}`).join(" ");
  // Two fills clipped to their own side of the baseline, rather than one fill
  // that would paint a loss region green wherever the curve crossed.
  const area = `${line} L${px(x1).toFixed(1)},${zeroY.toFixed(1)} L${px(x0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // The two ends, and the midpoint only when the spot is not already labelled
  // near it — the spot is the more useful of the two and they collide.
  const showSpot = spot > 0 && spot >= x0 && spot <= x1;
  const mid = x0 + (x1 - x0) / 2;
  const ticks = showSpot && Math.abs(px(mid) - px(spot)) < 70 ? [x0, x1] : [x0, mid, x1];

  const onMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const price = x0 + ((rel - PAD.left) / (W - PAD.left - PAD.right)) * (x1 - x0);
    if (price < x0 || price > x1) return setHover(null);
    let best = curve[0];
    for (const p of curve) if (Math.abs(p.price - price) < Math.abs(best.price - price)) best = p;
    setHover(best);
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[520px]"
        style={{ height: H }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Combined profit and loss at expiry across underlying prices"
      >
        <defs>
          <clipPath id="payoff-above">
            <rect x="0" y="0" width={W} height={Math.max(0, zeroY)} />
          </clipPath>
          <clipPath id="payoff-below">
            <rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} />
          </clipPath>
        </defs>

        <path d={area} fill="#059669" fillOpacity="0.13" clipPath="url(#payoff-above)" />
        <path d={area} fill="#e11d48" fillOpacity="0.13" clipPath="url(#payoff-below)" />

        {/* Baseline: break-even, and the only gridline worth drawing. */}
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth="1" />
        <text x={PAD.left - 8} y={zeroY + 4} textAnchor="end" className="fill-slate-400" fontSize="11">
          $0
        </text>
        <text x={PAD.left - 8} y={py(geom.yHi) + 4} textAnchor="end" className="fill-slate-400" fontSize="11">
          {money(geom.yHi)}
        </text>
        <text x={PAD.left - 8} y={py(geom.yLo) + 4} textAnchor="end" className="fill-slate-400" fontSize="11">
          {money(geom.yLo)}
        </text>

        {/* Strikes and the share basis, so the bends have names. Two rows,
            because a repair's short strike and its share basis can sit two
            dollars apart and their labels printed straight through each
            other — the first render of this chart read "S $3Ba6s2is50". */}
        {placedMarks.map((m) => (
          <g key={`${m.label}-${m.value}`}>
            <line
              x1={px(m.value)} x2={px(m.value)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3"
            />
            <text
              x={px(m.value)} y={PAD.top - 20 + m.row * 11} textAnchor="middle"
              className="fill-slate-400" fontSize="10"
            >
              {m.label}
            </text>
          </g>
        ))}

        <path d={line} fill="none" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" />

        {/* Where the whole book turns over. Labelled on the chart, because it
            is the number the reader came for. */}
        {crossings.map((c) => (
          <g key={c.price}>
            <circle cx={px(c.price)} cy={zeroY} r="4.5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
            <text
              x={px(c.price)} y={zeroY - 10} textAnchor="middle"
              className="fill-slate-900" fontSize="11" fontWeight="600"
            >
              {fmtMoney(c.price)}
            </text>
          </g>
        ))}

        {showSpot && (
          <g>
            <line
              x1={px(spot)} x2={px(spot)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="#0f172a" strokeWidth="2" strokeDasharray="4 3"
            />
            <text
              x={px(spot)} y={H - PAD.bottom + 24} textAnchor="middle"
              className="fill-slate-900" fontSize="11" fontWeight="600"
            >
              {fmtMoney(spot)}
            </text>
          </g>
        )}

        {/* The end ticks anchor inward, or a five-figure price runs off the
            edge of the frame — $410.04 lost its last character. */}
        {ticks.map((t, i) => (
          <text
            key={t}
            x={px(t)}
            y={H - PAD.bottom + 14}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            className="fill-slate-400"
            fontSize="10"
          >
            {fmtMoney(t)}
          </text>
        ))}

        {hover && (
          <g>
            <line
              x1={px(hover.price)} x2={px(hover.price)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="#64748b" strokeWidth="1"
            />
            <circle cx={px(hover.price)} cy={py(hover.pl)} r="4" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
            <text
              x={Math.min(px(hover.price) + 8, W - PAD.right - 90)}
              y={Math.max(py(hover.pl) - 8, PAD.top + 10)}
              className="fill-slate-900" fontSize="11" fontWeight="600"
            >
              {fmtMoney(hover.price)} → {hover.pl >= 0 ? "+" : ""}{fmtMoney(hover.pl)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
