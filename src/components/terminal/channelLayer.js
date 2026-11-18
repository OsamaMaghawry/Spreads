// The standard deviation channels, painted behind the candles: a Lightweight
// Charts series primitive on the candle series, like the drawings
// (drawingLayer.js). A line series stops at the last candle; a channel's
// lines run on past it to the chart's right edge (and back to its left edge
// when asked), as on TradingView with "Extend lines right" (18 Nov, the
// owner's NVDA chart). The fit itself is lib/indicators.js regressionChannel;
// this is only paint.
//
// Each channel: { from, to, start, slope, sd, extend, bands: [{ k, color }],
// fills: [{ from, to, color }] }, `from` and `to` the first and last candle's
// index (the chart's logical index), a band's or fill's edges in standard
// deviations from the line.

export class ChannelLayer {
  constructor() {
    this.channels = [];
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    const layer = this;
    this.views = [{ zOrder: () => "bottom", renderer: () => ({ draw: (target) => layer.draw(target) }) }];
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

  /** The channels to draw now (none: an empty list). */
  set(channels) {
    this.channels = Array.isArray(channels) ? channels.filter(Boolean) : [];
    this.requestUpdate?.();
  }

  paneViews() {
    return this.views;
  }

  draw(target) {
    if (!this.chart || !this.series || !this.channels.length) return;
    const ts = this.chart.timeScale();
    const series = this.series;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const leftEdge = ts.coordinateToLogical(0);
      const rightEdge = ts.coordinateToLogical(mediaSize.width);
      for (const c of this.channels) {
        const a = c.extend === "both" && leftEdge !== null ? Math.min(c.from, leftEdge) : c.from;
        const b = (c.extend === "right" || c.extend === "both") && rightEdge !== null ? Math.max(c.to, rightEdge) : c.to;
        const x1 = ts.logicalToCoordinate(a);
        const x2 = ts.logicalToCoordinate(b);
        if (x1 === null || x2 === null) continue;
        const y = (logical, k) => series.priceToCoordinate(c.start + c.slope * (logical - c.from) + k * c.sd);
        for (const f of c.fills || []) {
          const pts = [y(a, f.from), y(b, f.from), y(b, f.to), y(a, f.to)];
          if (pts.some((v) => v === null)) continue;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.moveTo(x1, pts[0]);
          ctx.lineTo(x2, pts[1]);
          ctx.lineTo(x2, pts[2]);
          ctx.lineTo(x1, pts[3]);
          ctx.closePath();
          ctx.fill();
        }
        ctx.lineWidth = 1.25;
        for (const band of c.bands || []) {
          const ya = y(a, band.k);
          const yb = y(b, band.k);
          if (ya === null || yb === null) continue;
          ctx.setLineDash(band.k === 0 ? [] : [5, 4]); // the fitted line solid, the bands dashed
          ctx.strokeStyle = band.color;
          ctx.beginPath();
          ctx.moveTo(x1, ya);
          ctx.lineTo(x2, yb);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    });
  }
}
