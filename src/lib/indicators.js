// The terminal chart's indicators: moving averages, VWAP, Bollinger Bands on
// the price; RSI, MACD, Stochastic and ATR in panes of their own.
//
// The owner, 24 Oct 2026: "I want to add indicators EMA, MA, VWAP, MACD, RSI,
// Bollinger bands, etc...". The definitions are the standard ones every
// charting package uses, so a reading here matches the same reading on
// TradingView or a broker's platform: Wilder's smoothing for RSI and ATR, an
// EMA seeded with the simple average of its first period, population standard
// deviation for the bands, VWAP restarting each session. Pure, so every rule
// is tested (indicators.test.js); a value is null until enough bars exist.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential average, seeded with the simple average of the first `period` values. Nulls in, nulls skipped. */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  let seed = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (prev === null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
        seed = null;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's RSI: average gain over average loss, each smoothed by 1/period. */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) { gain /= period; loss /= period; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
      continue;
    }
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const sig = ema(line, signal);
  return { macd: line, signal: sig, hist: line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null)) };
}

/** Slow stochastic: %K over `period`, smoothed by `smooth`; %D its `d`-bar average. */
export function stochastic(bars, period = 14, smooth = 3, d = 3) {
  const raw = bars.map((_, i) => {
    if (i < period - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low); }
    return hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
  });
  const k = smoothNullable(raw, smooth);
  return { k, d: smoothNullable(k, d) };
}

function smoothNullable(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    const win = values.slice(i - period + 1, i + 1);
    if (win.some((v) => v === null)) continue;
    out[i] = win.reduce((a, b) => a + b, 0) / period;
  }
  return out;
}

/** Wilder's average true range. */
export function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  let avg = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < period) {
      avg += tr;
      if (i === period - 1) { avg /= period; out[i] = avg; }
      continue;
    }
    avg = (avg * (period - 1) + tr) / period;
    out[i] = avg;
  }
  return out;
}

/** Volume-weighted average price of the typical price, restarting whenever `sessionOf` changes. */
export function vwap(bars, sessionOf) {
  const out = new Array(bars.length).fill(null);
  let key = null;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const k = sessionOf(b.time);
    if (k !== key) { key = k; pv = 0; vol = 0; }
    const v = Number(b.volume) || 0;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : (b.high + b.low + b.close) / 3;
  }
  return out;
}

// ---------- the catalogue the chart offers ----------

export const INDICATORS = {
  sma: { label: "Moving average (SMA)", pane: "price", params: [{ key: "period", label: "Period", value: 50 }] },
  ema: { label: "Exponential MA (EMA)", pane: "price", params: [{ key: "period", label: "Period", value: 21 }] },
  vwap: { label: "VWAP", pane: "price", params: [] },
  bb: { label: "Bollinger Bands", pane: "price", params: [{ key: "period", label: "Period", value: 20 }, { key: "mult", label: "Std dev", value: 2 }] },
  rsi: { label: "RSI", pane: "own", params: [{ key: "period", label: "Period", value: 14 }] },
  macd: { label: "MACD", pane: "own", params: [{ key: "fast", label: "Fast", value: 12 }, { key: "slow", label: "Slow", value: 26 }, { key: "signal", label: "Signal", value: 9 }] },
  stoch: { label: "Stochastic", pane: "own", params: [{ key: "period", label: "%K", value: 14 }, { key: "smooth", label: "Smooth", value: 3 }, { key: "d", label: "%D", value: 3 }] },
  atr: { label: "ATR", pane: "own", params: [{ key: "period", label: "Period", value: 14 }] }
};

// Line colours: each new average takes the next, so EMA 9 and EMA 21 differ.
export const LINE_COLORS = ["#2563eb", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export function defaultParams(type) {
  return Object.fromEntries((INDICATORS[type]?.params || []).map((p) => [p.key, p.value]));
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};

/** The indicator list read back from storage: unknown types dropped, periods kept within sense. */
export function cleanIndicators(list) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && INDICATORS[x.type] && typeof x.id === "string")
    .slice(0, 12)
    .map((x) => {
      const params = {};
      for (const p of INDICATORS[x.type].params) {
        params[p.key] = p.key === "mult" ? Math.min(5, Math.max(0.5, Number(x.params?.[p.key]) || p.value)) : clampInt(x.params?.[p.key], 1, 500, p.value);
      }
      return { id: x.id, type: x.type, params, color: LINE_COLORS.includes(x.color) ? x.color : LINE_COLORS[0] };
    });
}

export function indicatorLabel(x) {
  const p = x.params || {};
  switch (x.type) {
    case "sma": return `SMA ${p.period}`;
    case "ema": return `EMA ${p.period}`;
    case "vwap": return "VWAP";
    case "bb": return `BB ${p.period}, ${p.mult}`;
    case "rsi": return `RSI ${p.period}`;
    case "macd": return `MACD ${p.fast}, ${p.slow}, ${p.signal}`;
    case "stoch": return `Stoch ${p.period}, ${p.smooth}, ${p.d}`;
    case "atr": return `ATR ${p.period}`;
    default: return x.type;
  }
}

/**
 * The lines (and histogram) an indicator draws, as chart data: one entry per
 * line, each a list of { time, value } with the warm-up bars left out.
 * Reference lines (RSI 70/30, Stochastic 80/20) come back as `levels`.
 */
export function indicatorSeries(x, bars, sessionOf) {
  const closes = bars.map((b) => b.close);
  const p = x.params || defaultParams(x.type);
  const line = (key, values, color, extra = {}) => ({
    key, color, kind: "line", ...extra,
    data: values.map((value, i) => (value === null || !Number.isFinite(value) ? null : { time: bars[i].time, value })).filter(Boolean)
  });
  switch (x.type) {
    case "sma": return { lines: [line("sma", sma(closes, p.period), x.color)] };
    case "ema": return { lines: [line("ema", ema(closes, p.period), x.color)] };
    case "vwap": return { lines: [line("vwap", vwap(bars, sessionOf), x.color, { width: 2 })] };
    case "bb": {
      const b = bollinger(closes, p.period, p.mult);
      return { lines: [line("upper", b.upper, x.color), line("mid", b.mid, x.color, { dashed: true }), line("lower", b.lower, x.color)] };
    }
    case "rsi": return { lines: [line("rsi", rsi(closes, p.period), "#7c3aed")], levels: [70, 30], range: [0, 100] };
    case "macd": {
      const m = macd(closes, p.fast, p.slow, p.signal);
      return {
        lines: [
          { ...line("hist", m.hist, "#94a3b8"), kind: "histogram", data: m.hist.map((value, i) => (value === null ? null : { time: bars[i].time, value, color: value >= 0 ? "#05966966" : "#e11d4866" })).filter(Boolean) },
          line("macd", m.macd, "#2563eb"),
          line("signal", m.signal, "#d97706")
        ]
      };
    }
    case "stoch": {
      const s = stochastic(bars, p.period, p.smooth, p.d);
      return { lines: [line("k", s.k, "#2563eb"), line("d", s.d, "#d97706")], levels: [80, 20], range: [0, 100] };
    }
    case "atr": return { lines: [line("atr", atr(bars, p.period), "#0891b2")] };
    default: return { lines: [] };
  }
}
