import { timeToLogical, fibLevels, measure, durationText, hitTest, textBox } from "@/lib/chartDrawings";
import { px } from "@/lib/terminal";
import { badgeLayout, badgeAt } from "@/lib/marketEvents";

// The drawings, painted on the chart: a Lightweight Charts series primitive
// (the library's plugin interface), attached to the candle series so prices
// map through the same scale as the candles. One layer draws every drawing;
// the chart asks it to repaint on every pan and zoom, and the terminal asks
// it (update()) whenever a drawing changes. The arithmetic is in
// lib/chartDrawings.js; this is only paint.

const FONT = "11px ui-sans-serif, system-ui, -apple-system, sans-serif";

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function label(ctx, text, x, y, color, align = "left") {
  ctx.font = FONT;
  const w = ctx.measureText(text).width + 8;
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.fillStyle = color;
  ctx.fillRect(left, y - 8, w, 16);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + 4, y);
}

export class DrawingLayer {
  /** `read` returns { drawings, draft, selected, times, step } at paint time. */
  constructor(read) {
    this.read = read;
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    const layer = this;
    this.view = { renderer: () => ({ draw: (target) => layer.draw(target) }) };
    // Behind the candles: pre-market and after-hours shading.
    this.back = { zOrder: () => "bottom", renderer: () => ({ draw: (target) => layer.drawSessions(target) }) };
    // In front: earnings and economic releases, as badges along the foot.
    this.front = { zOrder: () => "top", renderer: () => ({ draw: (target) => layer.drawEvents(target) }) };
    this.views = [this.back, this.view, this.front];
    this.badges = [];
    this.axisViews = [];
  }

  attached({ chart, series, requestUpdate }) {
    this.chart = chart;
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  update() {
    this.requestUpdate?.();
  }

  paneViews() {
    return this.views;
  }

  // The library asks what is under the pointer; the answer sets the cursor,
  // so a drawing shows it can be picked up before it is clicked.
  hitTest(x, y) {
    const badge = badgeAt(this.badges, x, y);
    if (badge) return { cursorStyle: "pointer", externalId: badge.event.id, zOrder: "top" };
    const hit = hitTest(this.read().drawings || [], (p) => this.xy(p), x, y);
    return hit ? { cursorStyle: hit.handle === null ? "pointer" : "move", externalId: hit.id, zOrder: "top" } : null;
  }

  // A horizontal line's price on the price axis, as TradingView shows it.
  priceAxisViews() {
    const { drawings = [], draft } = this.read();
    const lines = [...drawings, ...(draft ? [draft] : [])].filter((d) => d.type === "hline");
    const views = lines.map((d) => ({
      coordinate: () => this.series?.priceToCoordinate(d.points[0].price) ?? -100,
      text: () => px(d.points[0].price),
      textColor: () => "#ffffff",
      backColor: () => d.color,
      visible: () => true,
      tickVisible: () => true
    }));
    // The library caches by array identity: hand back the same array while nothing changed.
    const key = lines.map((d) => `${d.id}:${d.points[0].price}:${d.color}`).join("|");
    if (key !== this.axisKey) { this.axisKey = key; this.axisViews = views; }
    return this.axisViews;
  }

  /** A stored point (moment, price) as pixels on the pane, or null when it cannot be placed. */
  xy(point) {
    if (!this.chart || !this.series || !point) return null;
    const { times, step } = this.read();
    const logical = timeToLogical(times || [], point.time, step || 60);
    if (logical === null) return null;
    const x = this.chart.timeScale().logicalToCoordinate(logical);
    const y = this.series.priceToCoordinate(point.price);
    return x === null || y === null ? null : { x, y };
  }

  // Shades each run of extended-hours candles on screen, edge to edge of
  // their bars, as TradingView does; only the visible range is walked.
  drawSessions(target) {
    const { extended } = this.read();
    if (!extended || !this.chart) return;
    const ts = this.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const half = ts.options().barSpacing / 2;
    const from = Math.max(0, Math.floor(range.from));
    const to = Math.min(extended.length - 1, Math.ceil(range.to));
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
      let start = null;
      for (let i = from; i <= to + 1; i++) {
        if (i <= to && extended[i]) { if (start === null) start = i; continue; }
        if (start !== null) {
          const x1 = ts.logicalToCoordinate(start);
          const x2 = ts.logicalToCoordinate(i - 1);
          if (x1 !== null && x2 !== null) ctx.fillRect(x1 - half, 0, x2 - x1 + 2 * half, mediaSize.height);
          start = null;
        }
      }
    });
  }

  // The events: a badge each, laid out along the foot of the price pane
  // (lib/marketEvents.js badgeLayout), hollow for one still to come, and a
  // dashed line up the chart from the one under the pointer.
  drawEvents(target) {
    const { events, hover } = this.read();
    if (!events?.length || !this.chart) { this.badges = []; return; }
    const ts = this.chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.badges = badgeLayout(events, (slot) => ts.logicalToCoordinate(slot), mediaSize.height)
        .filter((b) => b.x + b.w >= 0 && b.x <= mediaSize.width);
      ctx.save();
      ctx.font = "bold 9px ui-sans-serif, system-ui, -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      for (const b of this.badges) {
        const { color, upcoming, label, id } = b.event;
        if (id === hover) {
          const cx = b.dot ? b.x : b.x + b.w / 2;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, b.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        if (b.dot) {
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(b.x, b.y + 3, 3, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        const r = b.h / 2;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, r) : ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = upcoming ? "#ffffff" : color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = id === hover ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = upcoming ? color : "#ffffff";
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
      }
      ctx.restore();
    });
  }

  draw(target) {
    const { drawings = [], draft, selected } = this.read();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const d of drawings) this.paint(ctx, mediaSize, d, d.id === selected);
      if (draft) this.paint(ctx, mediaSize, draft, true);
    });
  }

  paint(ctx, size, d, selected) {
    const a = this.xy(d.points[0]);
    const b = d.points[1] ? this.xy(d.points[1]) : null;
    if (!a) return;
    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.setLineDash([]);
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

    if (d.type === "text") {
      // A note: the words on a pale card in the drawing's colour.
      if (!d.text) { ctx.restore(); return; }
      const box = textBox(d.text);
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, sans-serif";
      const w = Math.max(box.width, ctx.measureText(d.text).width + 12);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fillRect(a.x, a.y - box.height / 2, w, box.height);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.strokeRect(a.x, a.y - box.height / 2, w, box.height);
      ctx.fillStyle = d.color;
      ctx.textBaseline = "middle";
      ctx.fillText(d.text, a.x + 6, a.y + 0.5);
      ctx.restore();
      return;
    }
    if (d.type === "hline") {
      line(0, a.y, size.width, a.y);
    } else if (d.type === "vline") {
      line(a.x, 0, a.x, size.height);
    } else if (b && d.type === "trend") {
      line(a.x, a.y, b.x, b.y);
    } else if (b && d.type === "ray") {
      // On through the second point to the pane's edge.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = Math.max(size.width, size.height) * 4;
      const len = Math.hypot(dx, dy) || 1;
      line(a.x, a.y, a.x + (dx / len) * reach, a.y + (dy / len) * reach);
    } else if (b && d.type === "rect") {
      ctx.fillStyle = alpha(d.color, 0.12);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (b && d.type === "fib") {
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      ctx.lineWidth = 1;
      for (const { level, price } of fibLevels(d.points[0], d.points[1])) {
        const y = this.series.priceToCoordinate(price);
        if (y === null) continue;
        ctx.globalAlpha = level === 0 || level === 1 ? 1 : 0.75;
        line(left, y, right, y);
        ctx.globalAlpha = 1;
        // Outlined in white so the level reads over candles.
        ctx.font = FONT;
        ctx.textBaseline = "bottom";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 3;
        ctx.strokeText(`${level} (${px(price)})`, left + 4, y - 2);
        ctx.fillStyle = d.color;
        ctx.fillText(`${level} (${px(price)})`, left + 4, y - 2);
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1;
      }
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.5;
      line(a.x, a.y, b.x, b.y);
      ctx.globalAlpha = 1;
    } else if (b && d.type === "measure") {
      const { times, step } = this.read();
      const bars = timeToLogical(times || [], d.points[1].time, step || 60) - timeToLogical(times || [], d.points[0].time, step || 60);
      const m = measure(d.points[0], d.points[1], bars);
      const up = m.change >= 0;
      const tone = up ? "#059669" : "#e11d48";
      ctx.fillStyle = alpha(tone, 0.12);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1;
      line(a.x, a.y, b.x, b.y);
      const text = `${up ? "+" : ""}${px(m.change)} (${m.pct === null ? "—" : `${up ? "+" : ""}${(m.pct * 100).toFixed(2)}%`}) · ${Math.abs(m.bars)} bars · ${durationText(m.seconds)}`;
      label(ctx, text, (a.x + b.x) / 2, up ? Math.min(a.y, b.y) - 12 : Math.max(a.y, b.y) + 12, tone, "center");
    }

    // Handles on the selected drawing's points, for dragging.
    if (selected && d.type !== "hline" && d.type !== "vline") {
      for (const p of [a, b]) {
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
