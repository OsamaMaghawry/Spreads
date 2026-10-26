// The stock screener's arithmetic: one row per share from the server's two
// reads (functions/terminal "screen": the whole market's snapshot, and the
// daily numbers), the fields a trader filters on, the ready-made screens for
// stocks in play, and the filtering and sorting. Pure, and tested
// (screener.test.js); components/terminal/Screener.jsx draws it.
//
// The owner, 24 Oct 2026: "Stock Screener, with some extensive filtrations
// like the advanced tools to see the stocks in play."
//
// Today's figures combine with the daily ones here, in the browser, so a
// screen moves with the price: RSI folds today's price into Wilder's running
// averages, the 52-week range takes in today's high and low, performance is
// measured from the live price.
//
// The same rows serve the historical screen (25 Oct: "Historical screener to
// filter stock in history to get the criteria for the stocks in play at that
// period"): a past day's figures at its open or its close stand in for
// today's (functions/terminal "screen" stage "history"), and a field shows
// only where it is known at that moment (`when`).

/** The server's rows (column names, then arrays) as objects. */
export function decodeUniverse(data) {
  const cols = data?.columns || [];
  return (data?.rows || []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const ratio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b - 1 : null);
const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * A historical row's daily numbers, from the norms it carries (the days
 * before its date), until the year of candles for it has been read.
 */
export function partialStats(u) {
  if (!u?.lastDate) return null;
  return {
    lastDate: u.lastDate, lastClose: num(u.lastClose), bars: null,
    closes: { d5: num(u.d5), d21: num(u.d21), d63: null, d126: null, d252: null, ytd: null },
    avgVol20: num(u.avgVol20), avgVol50: null, avgDollar20: num(u.avgDollar20),
    sma20: num(u.sma20), sma50: null, sma200: null, rsi: null, atr14: num(u.atr14), high52: null, low52: null, partial: true
  };
}

/**
 * One share's screen row. `today` is the New York date. When the day's candle
 * is newer than the last finished day in the daily numbers, today is folded
 * in; when it is the same day (a weekend, or before the open), the daily
 * numbers already hold it.
 */
export function screenRow(u, stats, today) {
  const price = num(u.price);
  const s = stats || null;
  const live = s ? (u.day ? u.day > s.lastDate : s.lastDate < today) : false;
  // Before the open on a weekday the day's candle is still yesterday's: the
  // move is measured from yesterday's close, the gap is where the price is
  // now against it, today's volume is the pre-market's so far (where it has
  // been read: `pmVolume`), and the day before is the candle's own day.
  const weekday = ![0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay());
  const preOpen = !!(u.day && u.day < today && weekday && num(u.close) !== null);
  const ref = preOpen ? num(u.close) : num(u.prevClose);
  const volume = preOpen ? num(u.pmVolume) : num(u.volume);
  const [beforeClose, beforeVolume] = preOpen ? [num(u.close), num(u.volume)] : [num(u.prevClose), num(u.prevVolume)];
  const high52 = s?.high52 == null ? null : live && num(u.high) !== null ? Math.max(s.high52, u.high) : s.high52;
  const low52 = s?.low52 == null ? null : live && num(u.low) !== null ? Math.min(s.low52, u.low) : s.low52;
  let rsi = null;
  if (s?.rsi) {
    let { gain, loss } = s.rsi;
    if (live && price !== null) {
      const d = price - s.lastClose;
      gain = (gain * 13 + Math.max(d, 0)) / 14;
      loss = (loss * 13 + Math.max(-d, 0)) / 14;
    }
    rsi = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  const range = !preOpen && num(u.high) !== null && num(u.low) !== null && u.high > u.low ? (price - u.low) / (u.high - u.low) : null;
  const mid = num(u.bid) && num(u.ask) && u.ask >= u.bid ? (u.bid + u.ask) / 2 : null;
  return {
    symbol: u.symbol, name: u.name || "", exchange: u.exchange || "", fund: !!u.fund, options: !!u.options, shortable: !!u.shortable, easyToBorrow: !!u.easyToBorrow,
    price, priceAt: u.priceAt || null, prevClose: ref, preOpen,
    changePct: ratio(price, ref),
    gapPct: preOpen ? ratio(price, ref) : ratio(num(u.open), ref),
    volume,
    dollarVol: price !== null && volume !== null ? price * volume : null,
    prevDollarVol: beforeClose !== null && beforeVolume !== null ? beforeClose * beforeVolume : null,
    relVol: volume !== null && s?.avgVol20 ? volume / s.avgVol20 : null,
    avgVol20: s?.avgVol20 ?? null,
    avgDollar20: s?.avgDollar20 ?? null,
    marketCap: num(u.shares) && price !== null ? u.shares * price : null,
    rangePos: range,
    fromVwap: preOpen ? null : ratio(price, num(u.vwap)),
    spreadPct: mid ? (u.ask - u.bid) / mid : null,
    high52, low52,
    fromHigh52: ratio(price, high52),
    fromLow52: ratio(price, low52),
    rsi,
    atrPct: s?.atr14 && price ? s.atr14 / price : null,
    vsSma20: ratio(price, s?.sma20),
    vsSma50: ratio(price, s?.sma50),
    vsSma200: ratio(price, s?.sma200),
    perf1w: ratio(price, s?.closes?.d5),
    perf1m: ratio(price, s?.closes?.d21),
    perf3m: ratio(price, s?.closes?.d63),
    perf6m: ratio(price, s?.closes?.d126),
    perfYtd: ratio(price, s?.closes?.ytd),
    perf1y: ratio(price, s?.closes?.d252),
    pmVolume: num(u.pmVolume),
    pmChangePct: ratio(num(u.pmLast), ref),
    earnDate: u.earnDate || null,
    earnSession: u.earnSession || null,
    earningsIn: u.earnDate ? dayDiff(u.earnDate, today) : null,
    hasDaily: !!s
  };
}

// The fields a screen filters and sorts on. `pct`: stored as a fraction,
// typed and shown as a percentage. `daily`: needs the daily numbers.
export const FIELDS = [
  { id: "price", label: "Price", unit: "$", group: "Price and volume", hint: "Last trade, pre-market and after hours included" },
  { id: "volume", label: "Volume today", unit: "shares", group: "Price and volume", wholeDay: true, hint: "Consolidated, 15 minutes delayed; before the open, the pre-market's so far" },
  { id: "relVol", label: "Relative volume", unit: "x", group: "Price and volume", daily: true, wholeDay: true, hint: "Today's volume ÷ the 20-day average (not adjusted for time of day)" },
  { id: "dollarVol", label: "Dollar volume today", unit: "$", group: "Price and volume", wholeDay: true },
  { id: "prevDollarVol", label: "Dollar volume, the day before", unit: "$", group: "Price and volume", hint: "The previous session's close × its volume" },
  { id: "pmVolume", label: "Pre-market volume", unit: "shares", group: "Price and volume", hint: "4:00 to 9:30 New York, consolidated (today's up to 15 minutes ago); read for the biggest moves among shares trading $1M a day, and today for the most traded too" },
  { id: "avgVol20", label: "Average volume (20 days)", unit: "shares", group: "Price and volume", daily: true },
  { id: "avgDollar20", label: "Average dollar volume (20 days)", unit: "$", group: "Price and volume", daily: true },
  { id: "marketCap", label: "Market cap", unit: "$", group: "Price and volume", hint: "Shares outstanding from the company's latest SEC filing × price" },
  { id: "spreadPct", label: "Bid-ask spread", unit: "%", pct: true, group: "Price and volume", live: true, hint: "IEX quote; wide outside market hours" },
  { id: "changePct", label: "Change today", unit: "%", pct: true, group: "Today", wholeDay: true },
  { id: "gapPct", label: "Gap", unit: "%", pct: true, group: "Today", hint: "The open against the previous close; before the open, the price now against it" },
  { id: "pmChangePct", label: "Pre-market change", unit: "%", pct: true, group: "Today", hint: "The last pre-market price against the previous close" },
  { id: "rangePos", label: "Position in today's range", unit: "%", pct: true, group: "Today", wholeDay: true, hint: "0% at the day's low, 100% at its high" },
  { id: "fromVwap", label: "Price vs VWAP", unit: "%", pct: true, group: "Today", wholeDay: true },
  { id: "rsi", label: "RSI (14 days)", unit: "", group: "Trend and momentum", daily: true },
  { id: "atrPct", label: "ATR (14 days) as % of price", unit: "%", pct: true, group: "Trend and momentum", daily: true },
  { id: "vsSma20", label: "Price vs 20-day average", unit: "%", pct: true, group: "Trend and momentum", daily: true },
  { id: "vsSma50", label: "Price vs 50-day average", unit: "%", pct: true, group: "Trend and momentum", daily: true },
  { id: "vsSma200", label: "Price vs 200-day average", unit: "%", pct: true, group: "Trend and momentum", daily: true },
  { id: "fromHigh52", label: "From 52-week high", unit: "%", pct: true, group: "52 weeks", daily: true },
  { id: "fromLow52", label: "From 52-week low", unit: "%", pct: true, group: "52 weeks", daily: true },
  { id: "perf1w", label: "Performance, 1 week", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "perf1m", label: "Performance, 1 month", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "perf3m", label: "Performance, 3 months", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "perf6m", label: "Performance, 6 months", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "perfYtd", label: "Performance, year to date", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "perf1y", label: "Performance, 1 year", unit: "%", pct: true, group: "Performance", daily: true },
  { id: "earningsIn", label: "Earnings within (days)", unit: "days", group: "Company and events", live: true, hint: "Calendar days to the next scheduled report" }
];

/**
 * Whether a field is known at a screen's moment: `when` is "live", or a past
 * day's "open" or "close".
 */
export function fieldKnown(id, when) {
  const f = FIELD[id];
  if (!f) return id === "symbol";
  if (when === "live") return true;
  if (f.live) return false;
  return when === "close" || !f.wholeDay;
}
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
export const GROUPS = [...new Set(FIELDS.map((f) => f.group))];

/** "500k", "2.5m", "1b", "3%", "1,200" typed into a filter, as a number (a percentage as typed). */
export function parseAmount(text) {
  const t = String(text ?? "").trim().toLowerCase().replace(/[,$%\s]/g, "");
  if (!t) return null;
  const m = t.match(/^(-?\d*\.?\d+)([kmbt]?)$/);
  if (!m) return null;
  return Number(m[1]) * { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]];
}

/**
 * A screen's settings: numeric ranges by field (as typed: 3 for 3%), and the
 * choices that are not ranges. Anything unknown or malformed is dropped.
 */
export const EMPTY_SCREEN = { ranges: {}, type: "all", exchange: "all", options: false, shortable: false, trend: "any", gapAbs: null, sort: { key: "dollarVol", dir: "desc" } };

export function cleanScreen(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const ranges = {};
  for (const [id, v] of Object.entries(r.ranges || {})) {
    if (!FIELD[id] || !v || typeof v !== "object") continue;
    const min = num(v.min);
    const max = num(v.max);
    if (min !== null || max !== null) ranges[id] = { min, max };
  }
  const sortKey = FIELD[r.sort?.key] || ["symbol"].includes(r.sort?.key) ? r.sort.key : EMPTY_SCREEN.sort.key;
  return {
    ranges,
    type: ["all", "stocks", "funds"].includes(r.type) ? r.type : "all",
    exchange: ["all", "NASDAQ", "NYSE", "ARCA", "AMEX", "BATS"].includes(r.exchange) ? r.exchange : "all",
    options: !!r.options,
    shortable: !!r.shortable,
    trend: ["any", "above3", "below3", "above200", "below200", "cross50"].includes(r.trend) ? r.trend : "any",
    // A gap at least this big either way, in percent.
    gapAbs: num(r.gapAbs) !== null && r.gapAbs > 0 ? num(r.gapAbs) : null,
    sort: { key: sortKey, dir: r.sort?.dir === "asc" ? "asc" : "desc" }
  };
}

const TRENDS = {
  any: () => true,
  above3: (row) => row.vsSma20 > 0 && row.vsSma50 > 0 && row.vsSma200 > 0,
  below3: (row) => row.vsSma20 < 0 && row.vsSma50 < 0 && row.vsSma200 < 0,
  above200: (row) => row.vsSma200 > 0,
  below200: (row) => row.vsSma200 < 0,
  // Above the 50-day average now, within 3% of it: just crossed or testing it.
  cross50: (row) => row.vsSma50 > 0 && row.vsSma50 <= 0.03
};
export const TREND_CHOICES = [
  ["any", "Any trend"], ["above3", "Above the 20, 50 and 200-day averages"], ["below3", "Below all three averages"],
  ["above200", "Above the 200-day average"], ["below200", "Below the 200-day average"], ["cross50", "Just above the 50-day (within 3%)"]
];

/** Whether a row passes every setting of a screen. A figure a range needs and the row lacks fails it. */
export function passes(row, screen) {
  if (screen.type === "stocks" && row.fund) return false;
  if (screen.type === "funds" && !row.fund) return false;
  if (screen.exchange !== "all" && row.exchange !== screen.exchange) return false;
  if (screen.options && !row.options) return false;
  if (screen.shortable && !row.shortable) return false;
  for (const t of screen.trends || [screen.trend]) if (!TRENDS[t](row)) return false;
  if (screen.gapAbs !== null && screen.gapAbs !== undefined && !(Math.abs(row.gapPct) * 100 >= screen.gapAbs)) return false;
  for (const [id, { min, max }] of Object.entries(screen.ranges)) {
    const v = row[id];
    if (v === null || v === undefined || !Number.isFinite(v)) return false;
    const scale = FIELD[id].pct ? 100 : 1;
    if (min !== null && v * scale < min) return false;
    if (max !== null && v * scale > max) return false;
  }
  return true;
}

/** Rows in a screen's order; a row without the figure goes last either way. */
export function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const xn = x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x));
    const yn = y === null || y === undefined || (typeof y === "number" && !Number.isFinite(y));
    if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
    if (typeof x === "string") return sign * x.localeCompare(y);
    return sign * (x - y);
  });
}

/** Whether a screen asks for figures only the daily numbers give. */
export const needsDaily = (screen) => (screen.trends || [screen.trend]).some((t) => t !== "any") || Object.keys(screen.ranges).some((id) => FIELD[id].daily);

const tighter = (a, b, pick) => (a === null || a === undefined ? b ?? null : b === null || b === undefined ? a : pick(a, b));

/**
 * Your filters and any ready-made screens as one: every condition of each
 * must hold (25 Oct: "Make no Or in the screener. All should be and"). Two
 * ranges on the same figure narrow to where they overlap; every trend
 * applies; the larger of two either-way gaps. Your choices of type,
 * exchange, options and shortable stay as they are; the sort is yours.
 */
export function combineScreens(mine, presetIds = []) {
  const ranges = Object.fromEntries(Object.entries(mine.ranges).map(([id, r]) => [id, { ...r }]));
  const trends = mine.trend && mine.trend !== "any" ? [mine.trend] : [];
  let gapAbs = mine.gapAbs ?? null;
  for (const id of presetIds) {
    const p = PRESETS.find((x) => x.id === id)?.screen;
    if (!p) continue;
    for (const [field, r] of Object.entries(p.ranges || {})) {
      const cur = ranges[field];
      ranges[field] = cur ? { min: tighter(cur.min, r.min, Math.max), max: tighter(cur.max, r.max, Math.min) } : { ...r };
    }
    if (p.trend && p.trend !== "any" && !trends.includes(p.trend)) trends.push(p.trend);
    if (p.gapAbs) gapAbs = tighter(gapAbs, p.gapAbs, Math.max);
  }
  return { ...mine, ranges, trends: trends.length ? trends : ["any"], gapAbs };
}

/** The figures whose conditions cannot all hold at once (a minimum above the maximum). */
export const conflicts = (screen) => Object.entries(screen.ranges).filter(([, r]) => r.min !== null && r.max !== null && r.min > r.max).map(([id]) => id);

// Ready-made screens for stocks in play. Each sets its own floor on price and
// liquidity, so a one-share print on a dollar stock does not top the list.
const liquid = { price: { min: 2, max: null }, dollarVol: { min: 1e6, max: null } };
// A gap is known before the day's volume is: its floor is the day before's.
const liquidBefore = { price: { min: 2, max: null }, prevDollarVol: { min: 1e6, max: null } };
export const PRESETS = [
  { id: "gapUp", label: "Gapping up", note: "Opened 3% or more above yesterday's close", screen: { ranges: { ...liquidBefore, gapPct: { min: 3, max: null } }, sort: { key: "gapPct", dir: "desc" } } },
  { id: "gapDown", label: "Gapping down", note: "Opened 3% or more below yesterday's close", screen: { ranges: { ...liquidBefore, gapPct: { min: null, max: -3 } }, sort: { key: "gapPct", dir: "asc" } } },
  { id: "pmGappers", label: "Gappers with pre-market volume", note: "Gapped 4% or more either way with 100,000 shares or more traded before the open", screen: { ranges: { ...liquidBefore, pmVolume: { min: 100000, max: null } }, gapAbs: 4, sort: { key: "pmVolume", dir: "desc" } } },
  { id: "gainers", label: "Top gainers", note: "Up 5% or more today", screen: { ranges: { ...liquid, changePct: { min: 5, max: null } }, sort: { key: "changePct", dir: "desc" } } },
  { id: "losers", label: "Top losers", note: "Down 5% or more today", screen: { ranges: { ...liquid, changePct: { min: null, max: -5 } }, sort: { key: "changePct", dir: "asc" } } },
  { id: "unusualVolume", label: "Unusual volume", note: "Twice the usual volume or more, on a share that normally trades 300,000 a day", screen: { ranges: { price: { min: 2, max: null }, relVol: { min: 2, max: null }, avgVol20: { min: 300000, max: null } }, sort: { key: "relVol", dir: "desc" } } },
  { id: "active", label: "Most active", note: "The most dollars traded today", screen: { ranges: { price: { min: 1, max: null } }, sort: { key: "dollarVol", dir: "desc" } } },
  { id: "highs", label: "At 52-week highs", note: "Within 1% of the year's high", screen: { ranges: { price: { min: 2, max: null }, avgDollar20: { min: 5e6, max: null }, fromHigh52: { min: -1, max: null } }, sort: { key: "changePct", dir: "desc" } } },
  { id: "lows", label: "Near 52-week lows", note: "Within 3% of the year's low", screen: { ranges: { price: { min: 2, max: null }, avgDollar20: { min: 5e6, max: null }, fromLow52: { min: null, max: 3 } }, sort: { key: "changePct", dir: "asc" } } },
  { id: "oversold", label: "Oversold (RSI under 30)", note: "14-day RSI below 30", screen: { ranges: { price: { min: 2, max: null }, avgDollar20: { min: 5e6, max: null }, rsi: { min: null, max: 30 } }, sort: { key: "rsi", dir: "asc" } } },
  { id: "overbought", label: "Overbought (RSI over 70)", note: "14-day RSI above 70", screen: { ranges: { price: { min: 2, max: null }, avgDollar20: { min: 5e6, max: null }, rsi: { min: 70, max: null } }, sort: { key: "rsi", dir: "desc" } } },
  { id: "uptrend", label: "Uptrend", note: "Above its 20, 50 and 200-day averages", screen: { ranges: { price: { min: 5, max: null }, avgDollar20: { min: 10e6, max: null } }, trend: "above3", sort: { key: "perf1m", dir: "desc" } } },
  { id: "volatile", label: "Wide daily ranges", note: "Average true range 5% of the price or more", screen: { ranges: { price: { min: 2, max: null }, avgDollar20: { min: 10e6, max: null }, atrPct: { min: 5, max: null } }, sort: { key: "atrPct", dir: "desc" } } },
  { id: "earnings", label: "Earnings this week", note: "A report scheduled in the next 7 days", screen: { ranges: { price: { min: 2, max: null }, earningsIn: { min: 0, max: 7 } }, sort: { key: "earningsIn", dir: "asc" } } }
];

/** Whether a ready-made screen can run at a moment: every field it filters and sorts on is known then. */
export const presetKnown = (p, when) => Object.keys(p.screen.ranges || {}).every((id) => fieldKnown(id, when)) && fieldKnown(p.screen.sort?.key || "symbol", when);

export const presetScreen = (id) => {
  const p = PRESETS.find((x) => x.id === id);
  return cleanScreen({ ...EMPTY_SCREEN, ...(p?.screen || {}) });
};

/**
 * Which shares to read daily numbers for: the most traded yesterday (dollars),
 * from $1 up, capped. Reading a year of candles for every listed name would
 * take minutes; the screen says how many are covered.
 */
export function dailyCandidates(rows, cap = 3000) {
  return rows
    .filter((r) => r.price >= 1 && r.prevDollarVol > 0)
    .sort((a, b) => b.prevDollarVol - a.prevDollarVol)
    .slice(0, cap)
    .map((r) => r.symbol);
}

/**
 * Whose pre-market to read today (the server reads minute candles, a few
 * hundred shares at most): the biggest moves either way since the last close
 * among shares that traded $1M the day before, then the most traded of the
 * rest, where SPY and the large names are even on a quiet morning.
 */
export function premarketPicks(rows, movers = 300, active = 100) {
  const liquid = rows.filter((r) => r.price >= 1 && r.prevDollarVol >= 1e6);
  const move = (r) => (Number.isFinite(r.gapPct) ? Math.abs(r.gapPct) : -1);
  const picked = liquid.slice().sort((a, b) => move(b) - move(a)).slice(0, movers).map((r) => r.symbol);
  const taken = new Set(picked);
  const busiest = liquid.filter((r) => !taken.has(r.symbol)).sort((a, b) => b.prevDollarVol - a.prevDollarVol).slice(0, active).map((r) => r.symbol);
  return [...picked, ...busiest];
}

/** "1.2B", "350M", "48K" for volumes and dollars. */
export function bigNumber(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(v));
}
