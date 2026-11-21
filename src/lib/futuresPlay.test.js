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

test("a breach inside a minute flattens at the minute's worst price and fails the challenge", () => {
  const r = rules({ dailyLoss: null });
  const challenge = { rules: r, state: newChallenge(r) };
  const book = { "/ES": long("/ES", 1, 5000) };
  // Low 4967: 33 points x $50 = $1,650 down at the worst, past the $1,600 maximum loss; it closes at 4990.
  const minutes = { "/ES": [bar("2026-11-24T15:00:00Z", 4995, 4996, 4967, 4990)] };
  const out = playFutures({ book, minutes, challenge });
  assert.equal(out.challenge.state.status, "failed");
  assert.equal(out.book["/ES"].qty, 0);
  assert.equal(out.book["/ES"].trades.at(-1).price, 4967);
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

test("past the flat-by time the position closes at the minute's close", () => {
  const r = rules({ flatBy: 16 * 60 + 55 });
  const challenge = { rules: r, state: newChallenge(r) };
  const book = { "/GC": long("/GC", 1, 2650) };
  const out = playFutures({ book, minutes: { "/GC": [bar("2026-11-24T21:55:00Z", 2651, 2652, 2650.5, 2651.5)] }, challenge });
  assert.equal(out.book["/GC"].qty, 0);
  assert.equal(out.book["/GC"].trades.at(-1).why, "flatby");
  assert.equal(out.book["/GC"].realized, 150); // 1.5 x $100
  assert.equal(out.challenge.state.status, "active");
});

test("the challenge counts only the futures in the book", () => {
  const book = { "/ES": long("/ES", 1, 5000), SPY: practiceFill(acctIn({}, "SPY"), { side: "buy", qty: 10, price: 600, time: 1 }) };
  const f = futuresFigures(book, 40000, () => 5010);
  assert.equal(f.balance, 40000);
  assert.equal(f.equity, 40500);
  assert.deepEqual(f.positions, [{ root: "ES", qty: 1 }]);
});
