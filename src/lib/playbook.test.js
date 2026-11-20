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
  assert.deepEqual(r.review, { play: PLAY, stop: 163.2, followed: "partly", mistakes: ["Moved stop"], checks: ["SPY under VWAP"], notes: "ok" });
  assert.equal(cleanReview({ play: "none" }).review.play, "none");
  assert.equal(cleanReview({ play: "drop table" }).review.play, null);
  assert.match(cleanReview({ stop: -1 }).error, /above zero/);
  assert.match(cleanReview({ followed: "maybe" }).error, /yes, partly or no/);
  assert.equal(cleanReview({}).review.stop, null);
});

test("trip keys: the symbol and the second it opened", () => {
  assert.equal(tripKey({ symbol: "NVDA", entryTime: 1794581226 }), "NVDA|1794581226");
  assert.ok(TRIP_KEY.test("BTC/USD|1794581226"));
  assert.ok(!TRIP_KEY.test("nvda|1"));
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

test("splits: followed and checklist from reviewed trips; time of day in New York; mistakes by what they cost", () => {
  const t = (iso, realized, r, review = null) => ({ open: false, realized, r, entryTime: at(iso), exitTime: at(iso) + 600, review });
  const list = [
    t("2026-11-13T14:35:00Z", 300, 3, { followed: "yes", checks: ["SPY under VWAP"], mistakes: [] }),
    t("2026-11-13T15:45:00Z", -100, -1, { followed: "no", checks: [], mistakes: ["Chased entry", "Moved stop"] }),
    t("2026-11-13T19:30:00Z", -50, -0.5, { followed: "partly", checks: ["SPY under VWAP"], mistakes: ["Chased entry"] }),
    t("2026-11-13T12:00:00Z", 20, null)
  ];
  const s = playSplits(list, ["SPY under VWAP"]);
  assert.deepEqual(s.followed.map((g) => [g.label, g.n]), [["Followed", 1], ["Partly", 1], ["Broke the plan", 1]]);
  assert.deepEqual(s.times.map((g) => g.label), ["Pre-market", "9:30–10:30", "10:30–12:00", "14:00–16:00"]);
  assert.deepEqual(s.checks.map((g) => [g.label, g.n]), [["SPY under VWAP: yes", 2], ["SPY under VWAP: no", 1]]);
  assert.deepEqual(s.mistakes.map((m) => [m.label, m.n, m.r, m.pl]), [["Chased entry", 2, -1.5, -150], ["Moved stop", 1, -1, -100]]);
});

test("time of day across a clock change, and sample flags", () => {
  assert.equal(timeBucket(at("2026-07-01T13:35:00Z")), "9:30–10:30"); // summer: 9:35
  assert.equal(timeBucket(at("2026-12-01T14:35:00Z")), "9:30–10:30"); // winter: 9:35
  assert.equal(timeBucket(at("2026-12-01T21:05:00Z")), "After hours");
  assert.equal(sampleFlag(9), "Too few to read");
  assert.equal(sampleFlag(29), "Small sample");
  assert.equal(sampleFlag(30), null);
});
