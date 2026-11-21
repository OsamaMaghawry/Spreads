import { test } from "node:test";
import assert from "node:assert/strict";
import { playFutures, futuresFigures } from "./futuresPlay.js";
import { acctIn, practiceFill, practiceExit } from "./replay.js";
import { cleanRules, newChallenge } from "./propRules.js";

const t = (iso) => Math.floor(Date.parse(iso) / 1000);
const bar = (iso, o, h, l, c, id = 1) => ({ time: t(iso), open: o, high: h, low: l, close: c, volume: 1, id });
const long = (symbol, qty, price) => practiceFill({ ...acctIn({}, symbol), fee: 0 }, { side: "buy", qty, price, time: t("2026-11-24T14:30:00Z") });
const rules = (over = {}) => cleanRules({ accountSize: 40000, profitTarget: 2400, maxLoss: 1600, drawdown: "eod", dailyLoss: 800, ...over }).rules;

test("a roll closes the position at the old contract's last price, not the new one's", () => {
  const book = { "/ES": practiceExit(long("/ES", 1, 5000), "stop", 4990, 5000).acct };
  const prev = { "/ES": bar("2026-12-14T14:30:00Z", 5000, 5001, 4999, 5002, 1) };
  const minutes = { "/ES": [bar("2026-12-14T14:31:00Z", 5050, 5051, 5049, 5050, 2)] };
  const out = playFutures({ book, minutes, prev });
  assert.equal(out.book["/ES"].qty, 0);
  assert.equal(out.book["/ES"].realized, 100); // 2 points x $50, not the $2,500 jump
  assert.equal(out.book["/ES"].stop, null);
  assert.equal(out.events[0].kind, "roll");
});

test("the stop works overnight: futures have no regular-hours filter", () => {
  const book = { "/MES": practiceExit(long("/MES", 2, 5000), "stop", 4995, 5000).acct };
  const minutes = { "/MES": [bar("2026-11-25T03:00:00Z", 4998, 4998, 4990, 4991)] }; // 22:00 New York
  const out = playFutures({ book, minutes });
  assert.equal(out.book["/MES"].qty, 0);
  assert.equal(out.book["/MES"].realized, -50); // 5 points x $5 x 2
});

test("a breach inside a minute flattens where equity crossed the floor and fails the challenge", () => {
  const r = rules({ dailyLoss: null });
  const challenge = { rules: r, state: newChallenge(r) };
  const book = { "/ES": long("/ES", 1, 5000) };
  // Low 4967: 33 points x $50 = $1,650 down at the worst, past the $1,600 maximum loss; it closes at 4990.
  const minutes = { "/ES": [bar("2026-11-24T15:00:00Z", 4995, 4996, 4967, 4990)] };
  const out = playFutures({ book, minutes, challenge });
  assert.equal(out.challenge.state.status, "failed");
  assert.equal(out.book["/ES"].qty, 0);
  assert.equal(out.book["/ES"].trades.at(-1).price, 4968); // 32 points x $50 = $1,600: the floor, not the minute's low
  assert.equal(out.challenge.state.balance, 40000 - 1600); // the figures follow the forced close
  assert.equal(out.book["/ES"].trades.at(-1).why, "breach");
  assert.ok(out.events.some((e) => e.kind === "failed"));
});

test("the daily loss limit locks the day; nothing fills until the 18:00 session", () => {
  const r = rules();
  const challenge = { rules: r, state: newChallenge(r) };
  let book = { "/MNQ": long("/MNQ", 10, 18000) };
  const minutes = { "/MNQ": [bar("2026-11-24T15:00:00Z", 17990, 17991, 17955, 17960)] }; // 45 points x $2 x 10 = $900 at the low
  let out = playFutures({ book, minutes, challenge });
  assert.equal(out.challenge.state.status, "locked");
  assert.equal(out.book["/MNQ"].qty, 0);
  // An order placed while locked does not fill the same day...
  book = { "/MNQ": { ...out.book["/MNQ"], orders: [{ id: 9, side: "buy", qty: 1, price: 17970, kind: "limit" }] } };
  out = playFutures({ book, minutes: { "/MNQ": [bar("2026-11-24T16:00:00Z", 17965, 17966, 17950, 17960)] }, challenge: out.challenge });
  assert.equal(out.book["/MNQ"].qty, 0);
  // ...and the next session unlocks.
  out = playFutures({ book: out.book, minutes: { "/MNQ": [bar("2026-11-24T23:05:00Z", 17960, 17961, 17959, 17960)] }, challenge: out.challenge });
  assert.equal(out.challenge.state.status, "active");
});

test("past the flat-by time the position closes at that minute's open", () => {
  const r = rules({ flatBy: 16 * 60 + 55 });
  const challenge = { rules: r, state: newChallenge(r) };
  const book = { "/GC": long("/GC", 1, 2650) };
  const out = playFutures({ book, minutes: { "/GC": [bar("2026-11-24T21:55:00Z", 2651, 2652, 2650.5, 2651.5)] }, challenge });
  assert.equal(out.book["/GC"].qty, 0);
  assert.equal(out.book["/GC"].trades.at(-1).why, "flatby");
  assert.equal(out.book["/GC"].realized, 100); // opened at 2651: 1 x $100
  assert.equal(out.challenge.state.status, "active");
});

test("the challenge counts only the futures in the book", () => {
  const book = { "/ES": long("/ES", 1, 5000), SPY: practiceFill(acctIn({}, "SPY"), { side: "buy", qty: 10, price: 600, time: 1 }) };
  const f = futuresFigures(book, 40000, () => 5010);
  assert.equal(f.balance, 40000);
  assert.equal(f.equity, 40500);
  assert.deepEqual(f.positions, [{ root: "ES", qty: 1 }]);
});

test("a minute that opens through the floor fills at its open", () => {
  const r = rules({ dailyLoss: null });
  const out = playFutures({ book: { "/ES": long("/ES", 1, 5000) }, minutes: { "/ES": [bar("2026-11-24T15:00:00Z", 4950, 4952, 4940, 4945)] }, challenge: { rules: r, state: newChallenge(r) } });
  assert.equal(out.book["/ES"].trades.at(-1).price, 4950);
});

test("a fill made by hand counts its day as traded", async () => {
  const { noteFill } = await import("./futuresPlay.js");
  const r = rules({ minDays: 1 });
  let ch = { rules: r, state: newChallenge(r) };
  ch = noteFill(ch, t("2026-11-24T15:00:00Z"));
  assert.equal(ch.state.days["2026-11-24"].traded, true);
  // Bought and sold by hand for +$2,500: the next minute passes it.
  const book = { "/ES": practiceFill(long("/ES", 1, 5000), { side: "sell", qty: 1, price: 5050, time: t("2026-11-24T15:01:00Z") }) };
  const out = playFutures({ book, minutes: { "/ES": [bar("2026-11-24T15:02:00Z", 5050, 5051, 5049, 5050)] }, challenge: ch });
  assert.equal(out.challenge.state.status, "passed");
});

test("an intraday floor trails the minute's best price for what is held", () => {
  const r = rules({ drawdown: "intraday", dailyLoss: null, lockAt: 60000 });
  const out = playFutures({ book: { "/ES": long("/ES", 1, 5000) }, minutes: { "/ES": [bar("2026-11-24T15:00:00Z", 5000, 5040, 5000, 5005)] }, challenge: { rules: r, state: newChallenge(r) } });
  assert.equal(out.challenge.state.floor, 40000 + 2000 - 1600); // high 5040: +$2,000
});

test("a working order that would pass the contract limit is cancelled when reached", () => {
  const r = rules({ maxContracts: 2 });
  const a = { ...long("/ES", 2, 5000), orders: [{ id: 1, side: "buy", qty: 1, price: 4995, kind: "limit" }] };
  const out = playFutures({ book: { "/ES": a }, minutes: { "/ES": [bar("2026-11-24T15:00:00Z", 4998, 4999, 4994, 4996)] }, challenge: { rules: r, state: newChallenge(r) } });
  assert.equal(out.book["/ES"].qty, 2);
  assert.deepEqual(out.book["/ES"].orders, []);
  assert.ok(out.events.some((e) => e.kind === "refused"));
});

test("a position entered after the roll minute is not rolled again, and a roll is not a trading day", () => {
  // Bought at 5050 in the new contract (time after the roll), then played over the roll minute again.
  const a = practiceFill({ ...acctIn({}, "/ES"), fee: 0 }, { side: "buy", qty: 1, price: 5050, time: t("2026-12-14T15:00:00Z") });
  const prev = { "/ES": bar("2026-12-14T14:30:00Z", 5000, 5001, 4999, 5000, 1) };
  let out = playFutures({ book: { "/ES": a }, minutes: { "/ES": [bar("2026-12-14T14:31:00Z", 5050, 5051, 5049, 5050, 2)] }, prev });
  assert.equal(out.book["/ES"].qty, 1);
  // A genuine roll: no trading day for it.
  const r = rules({ minDays: 1 });
  out = playFutures({ book: { "/ES": long("/ES", 1, 5000) }, minutes: { "/ES": [bar("2026-12-14T14:31:00Z", 5050, 5051, 5049, 5050, 2)] }, prev, challenge: { rules: r, state: newChallenge(r) } });
  assert.equal(out.book["/ES"].qty, 0);
  assert.equal(out.challenge.state.days["2026-12-14"].traded, false);
});

test("after a lock, the next session's first minute already fills", () => {
  const r = rules();
  let out = playFutures({ book: { "/MNQ": long("/MNQ", 10, 18000) }, minutes: { "/MNQ": [bar("2026-11-24T15:00:00Z", 17990, 17991, 17955, 17960)] }, challenge: { rules: r, state: newChallenge(r) } });
  assert.equal(out.challenge.state.status, "locked");
  const book = { "/MNQ": { ...out.book["/MNQ"], orders: [{ id: 9, side: "buy", qty: 1, price: 17962, kind: "limit" }] } };
  out = playFutures({ book, minutes: { "/MNQ": [bar("2026-11-24T23:00:00Z", 17965, 17966, 17960, 17961)] }, challenge: out.challenge });
  assert.equal(out.book["/MNQ"].qty, 1);
});

test("a minute with no trade date is still checked, under the last one", () => {
  const r = rules({ dailyLoss: null });
  let ch = { rules: r, state: newChallenge(r) };
  ch = playFutures({ book: { "/ES": long("/ES", 1, 5000) }, minutes: { "/ES": [bar("2026-12-24T17:00:00Z", 5000, 5001, 4999, 5000)] }, challenge: ch }).challenge;
  // 24 Dec 18:30 New York rolls into Christmas, a closure: a bar there still counts.
  const out = playFutures({ book: { "/ES": long("/ES", 1, 5000) }, minutes: { "/ES": [bar("2026-12-24T23:30:00Z", 4970, 4971, 4960, 4965)] }, challenge: ch });
  assert.equal(out.challenge.state.status, "failed");
});
