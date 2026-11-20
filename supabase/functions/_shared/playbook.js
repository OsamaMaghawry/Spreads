// The terminal's Playbook (20 Nov 2026, the owner: "I need to implement the
// Playbook too", then "Yes start phase 1, load the four example plays"; the
// design is the DeltaMint Playbook prototype of 16 Nov). Plays are the rules a
// person trades by; every entry sent from the ticket or a hotkey while a play
// is active is marked with it (functions/terminal, terminal_order_marks); a
// round trip's play is the play of the order that opened it; reviews and
// results are read from those. Pure, plain JavaScript, used by the server
// (functions/terminal) and the screen (src/lib/playbook.js), tested in
// src/lib/playbook.test.js.

export const SIDES = ["Long", "Short", "Both"];
export const TIMEFRAMES = ["1 min", "2 min", "5 min", "10 min", "15 min", "1 hour", "1 day"];
export const MISTAKES = ["Chased entry", "Before confirmation", "Moved stop", "No stop", "Exited early", "Held past invalidation", "Oversized", "Revenge trade"];
export const FOLLOWED = ["yes", "partly", "no"];
const CHECKLIST_MAX = 12;

/** The four plays a person starts with (the prototype's; the owner: "load the four example plays"). */
export const EXAMPLE_PLAYS = [
  {
    code: "FTS", name: "Failed-test short", side: "Short", timeframe: "10 min",
    checklist: ["News in the last 1–3 days, trade with it", "50 EMA under 200 EMA, price under both", "Cluster of 2+ levels at the test", "SPY under VWAP"],
    entry: "10-min close below VWAP and the 21 EMA after a failed test of the cluster",
    stop: "Above the highest high of the last 3 candles",
    exit: "Hold while 10-min closes stay under the 9 EMA; exit on the first close above it, or at the close",
    risk: "$100 per trade · max 3 trades a day", invalid: "A 10-min close back above the cluster top",
    notes: "The cluster is resistance overhead: prior-day low, open, 50 and 200 EMA stacked together. IWM Nov 12 is the model trade."
  },
  {
    code: "FTL", name: "Failed-test long", side: "Long", timeframe: "10 min",
    checklist: ["News in the last 1–3 days, trade with it", "50 EMA over 200 EMA, price over both", "Cluster of 2+ levels at the test", "SPY over VWAP"],
    entry: "10-min close above VWAP and the 21 EMA after a failed test of support",
    stop: "Below the lowest low of the last 3 candles",
    exit: "Hold while 10-min closes stay over the 9 EMA; exit on the first close below it, or at the close",
    risk: "$100 per trade · max 3 trades a day", invalid: "A 10-min close back below the cluster bottom",
    notes: "Mirror of the short. AMD Nov 12 is the model trade."
  },
  {
    code: "ND1", name: "News day-1 continuation", side: "Both", timeframe: "5 min",
    checklist: ["News in the last day", "Gap of 3%+ in the news direction", "Holds the VWAP side all morning", "Relative volume 2x or more"],
    entry: "First pullback to VWAP that holds, in the direction of the news",
    stop: "Beyond the pullback low (long) or high (short)",
    exit: "Half at +2R, rest on a 5-min close through VWAP",
    risk: "$150 per trade · max 2 trades a day", invalid: "Two 5-min closes on the wrong side of VWAP",
    notes: ""
  },
  {
    code: "LFB", name: "Low-float breakout", side: "Long", timeframe: "1 min",
    checklist: ["Float under 20M shares", "Relative volume 5x or more", "Fresh news today", "Breaks the pre-market high"],
    entry: "Break of the pre-market high on volume",
    stop: "Below the breakout candle low",
    exit: "Out on the first 1-min close below the 9 EMA",
    risk: "$40 per trade · max 4 trades a day", invalid: "Back under the pre-market high",
    notes: ""
  }
];

const text = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * A play as it may be stored, or why not: a code of 1 to 6 letters or digits
 * (upper case), a name, a side, a timeframe, up to 12 checklist items (blank
 * ones dropped), and the rules as text.
 */
export function cleanPlay(input) {
  const p = input && typeof input === "object" ? input : {};
  const code = String(p.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(code)) return { error: "The code is 1 to 6 letters or digits." };
  const name = text(p.name, 80);
  if (!name) return { error: "Give the play a name." };
  const side = SIDES.includes(p.side) ? p.side : null;
  if (!side) return { error: "Pick Long, Short or Both." };
  const timeframe = text(p.timeframe, 20);
  if (!timeframe) return { error: "Pick a timeframe." };
  const checklist = (Array.isArray(p.checklist) ? p.checklist : []).map((c) => text(c, 200)).filter(Boolean);
  if (checklist.length > CHECKLIST_MAX) return { error: `At most ${CHECKLIST_MAX} checklist items.` };
  return {
    play: {
      code, name, side, timeframe, checklist,
      entry: text(p.entry, 1000), stop: text(p.stop, 1000), exit: text(p.exit, 1000),
      risk: text(p.risk, 300), invalid: text(p.invalid, 300), notes: text(p.notes, 4000)
    }
  };
}

/** A round trip's key: its symbol and the second it opened. */
export const tripKey = (t) => `${t.symbol}|${t.entryTime}`;
export const TRIP_KEY = /^[A-Z0-9./]{1,24}\|[0-9]{9,11}$/;

/**
 * A review as it may be stored, or why not: the play set by hand (an id, or
 * "none" for no play), the stop typed, whether the plan was followed, the
 * mistakes from the list, the checklist items ticked (their text), notes.
 */
export function cleanReview(input) {
  const r = input && typeof input === "object" ? input : {};
  const stop = r.stop === null || r.stop === undefined || r.stop === "" ? null : Number(r.stop);
  if (stop !== null && !(Number.isFinite(stop) && stop > 0)) return { error: "The stop is a price above zero." };
  const followed = r.followed === null || r.followed === undefined || r.followed === "" ? null : r.followed;
  if (followed !== null && !FOLLOWED.includes(followed)) return { error: "Followed the plan: yes, partly or no." };
  const mistakes = [...new Set((Array.isArray(r.mistakes) ? r.mistakes : []).filter((m) => MISTAKES.includes(m)))];
  const checks = [...new Set((Array.isArray(r.checks) ? r.checks : []).map((c) => text(c, 200)).filter(Boolean))].slice(0, CHECKLIST_MAX);
  const play = r.play === "none" ? "none" : typeof r.play === "string" && /^[0-9a-f-]{36}$/i.test(r.play) ? r.play : null;
  return { review: { play, stop, followed, mistakes, checks, notes: text(r.notes, 4000) } };
}

/**
 * Each round trip with its play, initial stop and R.
 * - `marks`: { orderId: { play, stop } }, the entries sent with a play (and a bracket's stop);
 * - `stops`: [{ symbol, stop, at }], stops placed on positions (seconds);
 * - `reviews`: { tripKey: review } (cleanReview's shape).
 * The play: set by hand in a review, else the opening order's. The initial
 * stop: typed in a review, else the opening order's bracket stop, else the
 * first stop placed on the position from a minute before it opened until it
 * closed, on the losing side of the entry (a stop already past the entry is
 * not a risk). R: the profit taken over the risk, the stop's distance from the
 * average entry times the trip's largest size; only for a closed trip.
 */
export function withPlays(trips, { marks = {}, stops = [], reviews = {} } = {}) {
  return trips.map((t) => {
    const key = tripKey(t);
    const review = reviews[key] || null;
    const mark = t.entryOrderId ? marks[t.entryOrderId] || null : null;
    const byHand = review?.play === "none" || !!review?.play;
    const play = review?.play === "none" ? null : review?.play || mark?.play || null;
    const losing = (s) => (t.side === "long" ? s < t.avgEntry : s > t.avgEntry);
    let stop = null;
    let stopFrom = null;
    if (review?.stop > 0) { stop = review.stop; stopFrom = "hand"; }
    else if (mark?.stop > 0 && losing(mark.stop)) { stop = mark.stop; stopFrom = "bracket"; }
    else {
      const until = t.exitTime ?? Infinity;
      const first = stops.filter((s) => s.symbol === t.symbol && s.at >= t.entryTime - 60 && s.at <= until && s.stop > 0 && losing(s.stop))
        .sort((a, b) => a.at - b.at)[0];
      if (first) { stop = first.stop; stopFrom = "stop order"; }
    }
    const risk = stop ? Math.abs(t.avgEntry - stop) * t.size : null;
    const r = !t.open && risk > 0 ? t.realized / risk : null;
    return { ...t, key, play, playFrom: play || byHand ? (byHand ? "hand" : "order") : null, stop, stopFrom, risk, r, review };
  });
}

/** How sure a figure is, from how many trades it rests on. */
export const sampleFlag = (n) => (n < 10 ? "Too few to read" : n < 30 ? "Small sample" : null);

/**
 * The figures of a list of closed trips: how many, the win rate, R (average
 * and total, over the trips with a stop), the profit factor (gross profit
 * over gross loss), the average hold and the profit.
 */
export function playStats(list) {
  const closed = list.filter((t) => !t.open);
  const n = closed.length;
  const rs = closed.map((t) => t.r).filter((r) => r !== null && Number.isFinite(r));
  const won = closed.filter((t) => t.realized > 0).length;
  const grossWin = closed.filter((t) => t.realized > 0).reduce((a, t) => a + t.realized, 0);
  const grossLoss = -closed.filter((t) => t.realized < 0).reduce((a, t) => a + t.realized, 0);
  return {
    n, won, nR: rs.length,
    winRate: n ? won / n : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    totalR: rs.length ? rs.reduce((a, b) => a + b, 0) : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgHold: n ? closed.reduce((a, t) => a + (t.exitTime - t.entryTime), 0) / n : null,
    pl: closed.reduce((a, t) => a + t.realized, 0)
  };
}

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const nyMinute = (sec) => {
  const p = Object.fromEntries(NY.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
export const TIME_BUCKETS = ["Pre-market", "9:30–10:30", "10:30–12:00", "12:00–14:00", "14:00–16:00", "After hours"];
/** The New York part of the day a trip opened in. */
export function timeBucket(sec) {
  const m = nyMinute(sec);
  return m < 570 ? TIME_BUCKETS[0] : m < 630 ? TIME_BUCKETS[1] : m < 720 ? TIME_BUCKETS[2] : m < 840 ? TIME_BUCKETS[3] : m < 960 ? TIME_BUCKETS[4] : TIME_BUCKETS[5];
}

/**
 * A play's closed trips split four ways, each group with its own figures:
 * whether the plan was followed (reviewed trips), the time of day, each
 * checklist item present or not (reviewed trips only: an unreviewed trip has
 * no answer), and each mistake with what it cost (in R and in dollars).
 */
export function playSplits(list, checklist = []) {
  const closed = list.filter((t) => !t.open);
  const group = (label, l) => ({ label, n: l.length, stats: playStats(l) });
  const reviewed = closed.filter((t) => t.review);
  const followed = FOLLOWED.map((v) => group(v === "yes" ? "Followed" : v === "partly" ? "Partly" : "Broke the plan", reviewed.filter((t) => t.review.followed === v))).filter((g) => g.n);
  const times = TIME_BUCKETS.map((b) => group(b, closed.filter((t) => timeBucket(t.entryTime) === b))).filter((g) => g.n);
  const checks = checklist.flatMap((c) => [
    group(`${c}: yes`, reviewed.filter((t) => t.review.checks?.includes(c))),
    group(`${c}: no`, reviewed.filter((t) => !t.review.checks?.includes(c)))
  ]).filter((g) => g.n);
  const mistakes = MISTAKES.map((m) => {
    const l = reviewed.filter((t) => t.review.mistakes?.includes(m));
    const rs = l.map((t) => t.r).filter((r) => r !== null);
    return { label: m, n: l.length, r: rs.length ? rs.reduce((a, b) => a + b, 0) : null, pl: l.reduce((a, t) => a + t.realized, 0) };
  }).filter((x) => x.n).sort((a, b) => (a.r ?? 0) - (b.r ?? 0));
  return { followed, times, checks, mistakes };
}
