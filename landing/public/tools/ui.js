// What every calculator page does with its form: read the inputs, show the
// figures or the one error, and draw the payoff at expiration. The math lives
// in calc.js; nothing here decides a number.

import { chartRange } from "./calc.js";

export const money = (v) =>
  (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A rate shown as a percent. Compounding a few days into a year produces
// numbers nobody can read; past 10,000% the figure says so instead.
export const pct = (v, digits = 1) =>
  !isFinite(v) || Math.abs(v) > 100 ? (v < 0 ? "below -10,000%" : "over 10,000%")
    : (v * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";

export const price = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };

// A number typed the way people type money: "$1,250.50" reads as 1250.5.
// Blank is NaN, so an optional field reads as absent rather than zero.
export function reader(form) {
  return (name) => {
    const raw = String(form.elements[name] ? form.elements[name].value : "").replace(/[$,%\s]/g, "");
    if (raw === "") return NaN;
    const v = parseFloat(raw);
    return isFinite(v) ? v : NaN;
  };
}

// Recompute on every keystroke and resize. `compute` returns a result or
// { error }; `show` paints a result.
export function wire(form, compute, show) {
  const err = form.querySelector(".err");
  const out = document.querySelector(".out");
  function update() {
    const r = compute();
    if (r.error) {
      err.textContent = r.error;
      err.hidden = false;
      if (out) out.setAttribute("data-stale", "");
      return;
    }
    err.hidden = true;
    if (out) out.removeAttribute("data-stale");
    show(r);
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (e) => e.preventDefault());
  let resized;
  window.addEventListener("resize", () => { clearTimeout(resized); resized = setTimeout(update, 150); });
  update();
  return update;
}

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, text) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
};
const css = (v) => `var(${v})`;
const short = (v) => (Math.round(v * 100) / 100).toString();

// Profit and loss at expiration for a position whose payoff is straight
// between its strikes (every strategy on /tools). `pl(s)` is the position's
// P/L at stock price s; `kinks` its strikes; `breakEvens` the zero crossings.
// `extent` adds prices the chart must reach without marking them as strikes
// (a single-strike position's breakeven, say).
export function drawPayoff(svg, { pl, kinks, breakEvens = [], spot = null, extent = [] }) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  // Drawn at the width it is shown at, so labels stay readable on a phone.
  const W = Math.round(Math.min(640, Math.max(300, svg.getBoundingClientRect().width || 640)));
  const H = W < 480 ? 240 : 280, L = 70, R = 16, T = 18, B = 42;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const [x0, x1] = chartRange([...kinks, ...extent], spot);
  const xs = [x0, ...[...new Set(kinks)].filter((k) => k > x0 && k < x1).sort((a, b) => a - b), x1];
  const ys = xs.map(pl);
  const top = Math.max(0, ...ys), bottom = Math.min(0, ...ys);
  const span = top - bottom || 1;
  const y1 = top + span * 0.18, y0 = bottom - span * 0.12;
  const X = (s) => L + ((s - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + ((y1 - v) / (y1 - y0)) * (H - T - B);

  const line = xs.map((s, i) => `${X(s).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" ");
  const id = svg.id || "payoff";
  const clip = (name, above) => {
    const c = el("clipPath", { id: `${id}-${name}` });
    c.appendChild(el("rect", { x: L, y: above ? T : Y(0), width: W - L - R, height: Math.max(0, above ? Y(0) - T : H - B - Y(0)) }));
    return c;
  };
  const defs = el("defs", {});
  defs.appendChild(clip("above", true));
  defs.appendChild(clip("below", false));
  svg.appendChild(defs);
  const area = `M${X(x0)},${Y(0)} L${line.replace(/ /g, " L")} L${X(x1)},${Y(0)} Z`;
  svg.appendChild(el("path", { d: area, fill: css("--mint-soft"), "clip-path": `url(#${id}-above)` }));
  svg.appendChild(el("path", { d: area, fill: css("--rose-soft"), "clip-path": `url(#${id}-below)` }));
  svg.appendChild(el("line", { x1: L, x2: W - R, y1: Y(0), y2: Y(0), stroke: css("--line"), "stroke-width": 1 }));
  svg.appendChild(el("polyline", { points: line, fill: "none", stroke: css("--brand"), "stroke-width": 2.5, "stroke-linejoin": "round" }));

  const text = (x, y, s, anchor = "middle", color = "--ink-mute") =>
    svg.appendChild(el("text", { x, y, "text-anchor": anchor, "font-size": 12, "font-family": "IBM Plex Mono, monospace", fill: css(color) }, s));

  // The best and worst the chart shows, and zero, on the left.
  const best = Math.max(...ys), worst = Math.min(...ys);
  if (best > 0) text(L - 8, Y(best) + 4, money(best), "end", "--mint");
  if (worst < 0) text(L - 8, Y(worst) + 4, money(worst), "end", "--rose");
  if (Math.abs(Y(0) - Y(best)) > 14 && Math.abs(Y(0) - Y(worst)) > 14) text(L - 8, Y(0) + 4, "$0", "end");

  for (const k of new Set(kinks)) {
    svg.appendChild(el("line", { x1: X(k), x2: X(k), y1: T, y2: H - B, stroke: css("--line"), "stroke-dasharray": "3 4" }));
    text(X(k), H - B + 16, short(k));
  }
  const many = breakEvens.length > 1;
  for (const be of breakEvens) {
    if (be == null || be < x0 || be > x1) continue;
    svg.appendChild(el("circle", { cx: X(be), cy: Y(0), r: 4, fill: css("--brand") }));
    text(X(be), H - 6, (many ? "BE " : "breakeven ") + be.toFixed(2), "middle", "--brand");
  }
  if (spot != null && spot >= x0 && spot <= x1) {
    svg.appendChild(el("line", { x1: X(spot), x2: X(spot), y1: T, y2: H - B, stroke: css("--ink-soft"), "stroke-width": 1.5 }));
    text(X(spot), T - 4, "now " + short(spot), "middle", "--ink-soft");
  }
}

// The expected move drawn as a bell: one and two standard deviations either
// side of today's price, labelled in dollars. A picture of the model's
// assumption, not of any forecast.
export function drawBell(svg, { price, move }) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = Math.round(Math.min(640, Math.max(300, svg.getBoundingClientRect().width || 640)));
  const H = W < 480 ? 210 : 240, L = 16, R = 16, T = 26, B = 44;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const X = (z) => L + ((z + 3) / 6) * (W - L - R);
  const Y = (d) => T + (1 - d) * (H - T - B);
  const pdf = (z) => Math.exp(-z * z / 2);
  const curve = (a, b) => {
    let d = `M${X(a).toFixed(1)},${Y(0).toFixed(1)}`;
    for (let i = 0; i <= 60; i++) { const z = a + ((b - a) * i) / 60; d += ` L${X(z).toFixed(1)},${Y(pdf(z)).toFixed(1)}`; }
    return d + ` L${X(b).toFixed(1)},${Y(0).toFixed(1)} Z`;
  };
  svg.appendChild(el("path", { d: curve(-3, 3), fill: css("--line-soft") }));
  svg.appendChild(el("path", { d: curve(-2, 2), fill: css("--brand-soft") }));
  svg.appendChild(el("path", { d: curve(-1, 1), fill: css("--brand"), "fill-opacity": 0.28 }));
  svg.appendChild(el("line", { x1: L, x2: W - R, y1: Y(0), y2: Y(0), stroke: css("--line") }));
  const text = (x, y, s, color = "--ink-mute", size = 12) =>
    svg.appendChild(el("text", { x, y, "text-anchor": "middle", "font-size": size, "font-family": "IBM Plex Mono, monospace", fill: css(color) }, s));
  const narrow = W < 460;
  const marks = narrow ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
  for (const z of marks) {
    svg.appendChild(el("line", { x1: X(z), x2: X(z), y1: Y(pdf(z)), y2: Y(0) + 4, stroke: css(z === 0 ? "--ink-soft" : "--brand"), "stroke-width": z === 0 ? 1.5 : 1 }));
    const v = Math.max(0, price + z * move);
    text(X(z), H - B + 18, short(v), z === 0 ? "--ink" : "--ink-soft");
  }
  text(X(0), H - 8, "today", "--ink-mute", 11);
  text(X(0), Y(pdf(0)) - 8, "68% inside ±1 sd", "--brand", 11);
  if (!narrow) text(X(1.6), Y(pdf(1.6)) - 10, "95% inside ±2 sd", "--ink-mute", 11);
}
