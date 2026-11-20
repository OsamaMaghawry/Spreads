import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_PLAYS, cleanPlay, cleanReview, tripKey, TRIP_KEY, withPlays, playStats, playSplits, sampleFlag, timeBucket } from "./playbook.js";
import { newPractice, practiceFill, roundTrips } from "./replay.js";

const at = (s) => Date.parse(s) / 1000;
const PLAY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("the four example plays are valid as they stand", () => {
  assert.deepEqual(EXAMPLE_PLAYS.map((p) => p.code), ["FTS", "FTL", "ND1", "LFB"]);
  for (const p of EXAMPLE_PLAYS) assert.ok(cleanPlay(p).play, p.code);
});

test("a play: code, name, side and timeframe checked; blank checklist items dropped", () => {
  const ok = cleanPlay({ code: " fts ", name: " Failed-test short ", side: "Short", timeframe: "10 min", checklist: ["a", " ", "b"] });
  assert.equal(ok.play.code, "FTS");
  assert.equal(ok.play.name, "Failed-test short");
  assert.deepEqual(ok.play.checklist, ["a", "b"]);
  assert.match(cleanPlay({ code: "TOOLONG", name: "x", side: "Long", timeframe: "1 min" }).error, /1 to 6/);
  assert.match(cleanPlay({ code: "A-1", name: "x", side: "Long", timeframe: "1 min" }).error, /1 to 6/);
  assert.match(cleanPlay({ code: "A1", name: " ", side: "Long", timeframe: "1 min" }).error, /name/);
  assert.match(cleanPlay({ code: "A1", name: "x", side: "Sideways", timeframe: "1 min" }).error, /Long, Short or Both/);
  assert.match(cleanPlay({ code: "A1", name: "x", side: "Long", timeframe: "1 min", checklist: Array(13).fill("c") }).error, /At most 12/);
});

test("a review: stop, followed, mistakes from the list, play id or none", () => {
  const r = cleanReview({ play: PLAY, stop: "163.2", followed: "partly", mistakes: ["Moved stop", "Invented", "Moved stop"], checks: ["SPY under VWAP", ""], notes: " ok " });
  assert.deepEqual(r.review, { play: PLAY, stop: 163.2, followed: "partly", mistakes: ["Moved stop"], checks: ["SPY under VWAP"], checksFor: null, notes: "ok" });
  assert.equal(cleanReview({ checksFor: PLAY }).review.checksFor, PLAY);
  assert.equal(cleanReview({ play: "none" }).review.play, "none");
  assert.equal(cleanReview({ play: "drop table" }).review.play, null);
  assert.match(cleanReview({ stop: -1 }).error, /above zero/);
  assert.match(cleanReview({ followed: "maybe" }).error, /yes, partly or no/);
  assert.equal(cleanReview({}).review.stop, null);
});

test("trip keys: the symbol and the second it opened; a second trade in that second is told apart", () => {
  assert.equal(tripKey({ symbol: "NVDA", entryTime: 1794581226 }), "NVDA|1794581226");
  assert.equal(tripKey({ symbol: "NVDA", entryTime: 1794581226 }, 1), "NVDA|1794581226|1");
  assert.ok(TRIP_KEY.test("BTC/USD|1794581226"));
  assert.ok(TRIP_KEY.test("SPY|1795014000|1"));
  assert.ok(!TRIP_KEY.test("nvda|1"));
  // Buy, sell, buy SPY within one second: two trades, two keys.
  let a = newPractice(0);
  for (const [side, qty] of [["buy", 10], ["sell", 10], ["buy", 10]]) a = practiceFill(a, { side, qty, price: 600, time: 1795014000, orderId: side + qty });
  const keys = withPlays(roundTrips(a.trades).map((x) => ({ ...x, symbol: "SPY" }))).map((x) => x.key);
  assert.deepEqual(keys, ["SPY|1795014000", "SPY|1795014000|1"]);
});

// A short NVDA trade in two fills from order o1 (the play's), covered by o2.
const trades = (orderIds = ["o1", "o1", "o2"]) => {
  let a = newPractice(0);
  a = practiceFill(a, { side: "sell", qty: 100, price: 162.4, time: at("2026-11-13T14:40:00Z"), orderId: orderIds[0] });
  a = practiceFill(a, { side: "sell", qty: 71, price: 162.47, time: at("2026-11-13T14:40:02Z"), orderId: orderIds[1] });
  a = practiceFill(a, { side: "buy", qty: 171, price: 160.18, time: at("2026-11-13T15:20:00Z"), orderId: orderIds[2] });
  return roundTrips(a.trades).map((t) => ({ ...t, symbol: "NVDA" }));
};

test("a trip carries the order that opened it; its play is that order's", () => {
  const [t] = trades();
  assert.equal(t.entryOrderId, "o1");
  const [x] = withPlays([t], { marks: { o1: { play: PLAY, stop: 163.2 } } });
  assert.equal(x.play, PLAY);
  assert.equal(x.playFrom, "order");
  // Bracket stop 163.20 above a 162.43 average short entry: 0.77 × 171 risked.
  assert.equal(x.stopFrom, "bracket");
  assert.ok(Math.abs(x.risk - (163.2 - t.avgEntry) * 171) < 1e-9);
  assert.ok(Math.abs(x.r - t.realized / x.risk) < 1e-12);
  assert.ok(x.r > 2.8 && x.r < 3);
});

test("an order whose price was changed keeps its play (the mark moves to its new id)", () => {
  const [t] = trades(["o1b", "o1b", "o2"]);
  // functions/manageOrder copies o1's mark to o1b when the price changes.
  const [x] = withPlays([t], { marks: { o1: { play: PLAY }, o1b: { play: PLAY } } });
  assert.equal(x.play, PLAY);
});

test("the stop: typed beats bracket beats the first stop placed; wrong-side stops are not a risk", () => {
  const [t] = trades();
  const stops = [
    { symbol: "NVDA", stop: 163.5, at: at("2026-11-13T14:41:00Z") },
    { symbol: "NVDA", stop: 164, at: at("2026-11-13T14:45:00Z") },
    { symbol: "TSLA", stop: 300, at: at("2026-11-13T14:41:00Z") }
  ];
  assert.equal(withPlays([t], { stops })[0].stop, 163.5);
  assert.equal(withPlays([t], { stops })[0].stopFrom, "stop order");
  assert.equal(withPlays([t], { marks: { o1: { play: PLAY, stop: 163.2 } }, stops })[0].stop, 163.2);
  assert.equal(withPlays([t], { marks: { o1: { play: PLAY, stop: 163.2 } }, stops, reviews: { [tripKey(t)]: { stop: 163.9 } } })[0].stopFrom, "hand");
  // A stop below a short's entry (already in profit) is not its risk; one placed after it closed is not either.
  assert.equal(withPlays([t], { stops: [{ symbol: "NVDA", stop: 161, at: at("2026-11-13T14:41:00Z") }] })[0].stop, null);
  assert.equal(withPlays([t], { stops: [{ symbol: "NVDA", stop: 163, at: at("2026-11-13T15:30:00Z") }] })[0].stop, null);
  // No stop: no R.
  assert.equal(withPlays([t])[0].r, null);
});

test("a play set by hand wins, 'none' clears the order's; a carried-in position has no order and no play", () => {
  const [t] = trades();
  const marks = { o1: { play: PLAY } };
  assert.equal(withPlays([t], { marks, reviews: { [tripKey(t)]: { play: OTHER } } })[0].play, OTHER);
  const none = withPlays([t], { marks, reviews: { [tripKey(t)]: { play: "none" } } })[0];
  assert.equal(none.play, null);
  assert.equal(none.playFrom, "hand");
  let a = newPractice(0);
  a = practiceFill(a, { side: "buy", qty: 10, price: 100, time: 1, why: "carried" });
  a = practiceFill(a, { side: "sell", qty: 10, price: 101, time: 2, orderId: "o9" });
  const [c] = roundTrips(a.trades).map((x) => ({ ...x, symbol: "AAPL" }));
  assert.equal(c.carried, true);
  assert.equal(c.entryOrderId, null);
  assert.equal(withPlays([c], { marks: { o9: { play: PLAY } } })[0].play, null);
});

test("a play's figures: closed trips only, R over the ones with a stop", () => {
  const list = [
    { open: false, realized: 300, r: 3, entryTime: 0, exitTime: 600 },
    { open: false, realized: -100, r: -1, entryTime: 0, exitTime: 300 },
    { open: false, realized: 50, r: null, entryTime: 0, exitTime: 900 },
    { open: true, realized: 0, r: null, entryTime: 0, exitTime: null }
  ];
  const s = playStats(list);
  assert.equal(s.n, 3);
  assert.equal(s.won, 2);
  assert.ok(Math.abs(s.winRate - 2 / 3) < 1e-12);
  assert.equal(s.nR, 2);
  assert.equal(s.avgR, 1);
  assert.equal(s.totalR, 2);
  assert.equal(s.profitFactor, 3.5);
  assert.equal(s.avgHold, 600);
  assert.equal(s.pl, 250);
  assert.equal(playStats([{ open: false, realized: 10, r: null, entryTime: 0, exitTime: 1 }]).profitFactor, Infinity);
  assert.equal(playStats([]).winRate, null);
});

test("splits: followed and checklist only where answered; time of day in New York; mistakes by result", () => {
  const t = (iso, realized, r, review = null) => ({ open: false, realized, r, entryTime: at(iso), exitTime: at(iso) + 600, play: PLAY, review });
  const list = [
    t("2026-11-13T14:35:00Z", 300, 3, { followed: "yes", checks: ["SPY under VWAP"], checksFor: PLAY, mistakes: [] }),
    t("2026-11-13T15:45:00Z", -100, -1, { followed: "no", checks: [], checksFor: PLAY, mistakes: ["Chased entry", "Moved stop"] }),
    t("2026-11-13T19:30:00Z", -50, -0.5, { followed: "partly", checks: ["SPY under VWAP"], checksFor: PLAY, mistakes: ["Chased entry"] }),
    // A play picked from the table, its checklist never answered: no "no".
    t("2026-11-13T16:00:00Z", -80, -0.8, { play: PLAY, followed: null, checks: [], checksFor: null, mistakes: [] }),
    t("2026-11-13T12:00:00Z", 20, null)
  ];
  const s = playSplits(list, ["SPY under VWAP"], PLAY);
  assert.deepEqual(s.followed.map((g) => [g.label, g.n]), [["Followed", 1], ["Partly", 1], ["Broke the plan", 1]]);
  assert.deepEqual(s.times.map((g) => g.label), ["Before 9:30", "9:30–10:30", "10:30–12:00", "14:00–16:00"]);
  assert.deepEqual(s.checks.map((g) => [g.label, g.n]), [["SPY under VWAP: yes", 2], ["SPY under VWAP: no", 1]]);
  assert.deepEqual(s.answered, { followed: 3, checks: 3, of: 5 });
  assert.deepEqual(s.mistakes.map((m) => [m.label, m.n, m.r, m.pl]), [["Chased entry", 2, -1.5, -150], ["Moved stop", 1, -1, -100]]);
});

test("time of day across a clock change, and sample flags", () => {
  assert.equal(timeBucket(at("2026-07-01T13:35:00Z")), "9:30–10:30"); // summer: 9:35
  assert.equal(timeBucket(at("2026-12-01T14:35:00Z")), "9:30–10:30"); // winter: 9:35
  assert.equal(timeBucket(at("2026-12-01T21:05:00Z")), "After 16:00");
  assert.equal(timeBucket(at("2026-12-01T08:00:00Z")), "Before 9:30"); // a coin at 3:00
  assert.equal(sampleFlag(9), "Too few to read");
  assert.equal(sampleFlag(29), "Small sample");
  assert.equal(sampleFlag(30), null);
});

// 20 Nov review: R over the risk at entry (the opening order's size and price).
const trip = (fills, symbol = "XYZ") => {
  let a = newPractice(0);
  for (const [side, qty, price, time, orderId] of fills) a = practiceFill(a, { side, qty, price, time, orderId });
  return roundTrips(a.trades).map((x) => ({ ...x, symbol }));
};

test("R is over the risk at entry: adding to a winner, averaging down, adding below the bracket", () => {
  const marks = { o1: { play: PLAY, stop: 9 } };
  // A. Buy 100 at 10 (stop 9: $100 at risk), add 100 at 11, sell 200 at 12: +$300 = +3R.
  const [a] = withPlays(trip([["buy", 100, 10, 1000, "o1"], ["buy", 100, 11, 1100, "o2"], ["sell", 200, 12, 1200, "o3"]]), { marks });
  assert.equal(a.risk, 100);
  assert.ok(Math.abs(a.r - 3) < 1e-9);
  // B. Averaging down: add 100 at 9.50, stopped at 9: −$150 = −1.5R.
  const [b] = withPlays(trip([["buy", 100, 10, 1000, "o1"], ["buy", 100, 9.5, 1100, "o2"], ["sell", 200, 9, 1200, "o3"]]), { marks });
  assert.ok(Math.abs(b.r + 1.5) < 1e-9);
  // C. Add 300 at 8.50 below the bracket at 9, out at 8: the bracket still stands against the opening fill: −$350 = −3.5R.
  const [c] = withPlays(trip([["buy", 100, 10, 1000, "o1"], ["buy", 300, 8.5, 1100, "o2"], ["sell", 400, 8, 1200, "o3"]]), { marks });
  assert.equal(c.stop, 9);
  assert.ok(Math.abs(c.r + 3.5) < 1e-9);
  // The opening order's partial fills count together: 60 + 40 at 10.
  const [p] = withPlays(trip([["buy", 60, 10, 1000, "o1"], ["buy", 40, 10, 1001, "o1"], ["sell", 100, 11, 1200, "o3"]]), { marks });
  assert.equal(p.openQty, 100);
  assert.ok(Math.abs(p.r - 1) < 1e-9);
});

test("the initial stop: placed within five minutes of the entry, not after the symbol's previous trade; tiny or wrong-side stops give no R", () => {
  const t1 = trip([["buy", 100, 50, 10000, "o1"], ["sell", 100, 53, 20000, "o2"]]);
  // D. A stop placed 90 minutes in is not the initial stop.
  assert.equal(withPlays(t1, { stops: [{ symbol: "XYZ", stop: 49.95, at: 10000 + 5400 }] })[0].r, null);
  // Placed two minutes in: it is, and says so.
  const two = withPlays(t1, { stops: [{ symbol: "XYZ", stop: 49, at: 10120 }] })[0];
  assert.equal(two.stopAfter, 120);
  assert.ok(Math.abs(two.r - 3) < 1e-9);
  // A stop sent while the entry was still working (two minutes before it filled) is its stop.
  assert.equal(withPlays(t1, { stops: [{ symbol: "XYZ", stop: 49, at: 10000 - 120 }] })[0].stop, 49);
  // F. The previous trade's stop, placed 40 s before this one opened, is not this one's.
  const both = trip([["buy", 100, 10, 1000, "a1"], ["sell", 100, 10.3, 1960, "a2"], ["buy", 100, 10.2, 2000, "b1"], ["sell", 100, 10.4, 2100, "b2"]]);
  const f = withPlays(both, { stops: [{ symbol: "XYZ", stop: 9.8, at: 1940 }, { symbol: "XYZ", stop: 10.1, at: 2010 }] });
  assert.equal(f[1].stop, 10.1);
  assert.ok(Math.abs(f[1].r - 2) < 1e-9);
  // A one-cent stop on a $50 entry is too small to measure R by.
  assert.equal(withPlays(t1, { reviews: { [`XYZ|10000`]: { stop: 49.99 } } })[0].tinyRisk, true);
  assert.equal(withPlays(t1, { reviews: { [`XYZ|10000`]: { stop: 49.99 } } })[0].r, null);
  // A typed stop above a long's entry is refused, said so, and the bracket stands.
  const w = withPlays(t1, { marks: { o1: { stop: 48 } }, reviews: { [`XYZ|10000`]: { stop: 52 } } })[0];
  assert.equal(w.typedWrong, true);
  assert.equal(w.stop, 48);
});

test("scratch trades are neither won nor lost; the profit factor stays readable", () => {
  const t = (realized) => ({ open: false, realized, r: null, entryTime: 0, exitTime: 1 });
  const s = playStats([t(8.9e-14), t(-5.3e-15), t(100), t(100), t(100)]);
  assert.equal(s.won, 3);
  assert.equal(s.profitFactor, Infinity);
  const o = playStats([t(50), { open: true, realized: 150, r: null, entryTime: 0, exitTime: null }]);
  assert.deepEqual([o.n, o.open, o.openRealized], [1, 1, 150]);
  assert.equal(playStats([{ ...t(-20), r: null }, { ...t(100), r: 1, stopFrom: "hand" }]).noRPl, -20);
});
