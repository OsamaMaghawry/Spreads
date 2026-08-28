import { useState } from "react";

// Signups per day over the last 30 days.
//
// One series, so there is no legend — the heading names it — and one hue
// rather than a categorical palette. Bars rather than a line because the
// values are counts of discrete events on discrete days, not a continuous
// quantity sampled over time.
//
// Zero days are drawn as a visible baseline sliver rather than nothing, so a
// quiet day reads as "zero" instead of "no data".
export default function SignupsChart({ data }) {
  const [hover, setHover] = useState(null);

  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);

  return (
    <div className="rounded-lg border border-dm-line bg-dm-panel p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-dm-text">Signups — last 30 days</h3>
        <span className="text-xs text-dm-sub tabular-nums">{total} total</span>
      </div>

      <div className="relative mt-4">
        <div className="flex h-24 items-end gap-[2px]">
          {data.map((d) => {
            const pct = (d.count / max) * 100;
            const active = hover?.date === d.date;
            return (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d)}
                onBlur={() => setHover(null)}
                aria-label={`${d.date}: ${d.count} signup${d.count === 1 ? "" : "s"}`}
                // The button is the full column height so the hit target is
                // far larger than the bar it selects — a 2px-tall zero bar is
                // otherwise impossible to hover.
                className="group relative flex h-full flex-1 items-end"
              >
                <span
                  className="w-full rounded-t-[4px] transition-colors"
                  style={{
                    height: `${Math.max(pct, 2)}%`,
                    background: active ? "var(--dm-accent-bright)" : "var(--dm-accent)",
                    opacity: d.count === 0 ? 0.25 : 1
                  }}
                />
              </button>
            );
          })}
        </div>

        {hover && (
          <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-dm-line bg-dm-panel px-2 py-1 text-[11px] text-dm-text shadow-sm">
            <span className="tabular-nums">{hover.date}</span>
            <span className="mx-1.5 text-dm-line">|</span>
            <span className="tabular-nums font-medium">
              {hover.count} signup{hover.count === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-dm-sub tabular-nums">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
