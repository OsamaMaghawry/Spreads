import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRules, newChallenge, challengeStep, canOrder, PROP_TEMPLATES } from "./propRules.js";

const rules50 = (over = {}) => cleanRules({ ...PROP_TEMPLATES["50K"], ...over }).rules;
const run = (rules, steps) => {
  let s = newChallenge(rules);
  let last;
  for (const x of steps) { last = challengeStep(s, rules, { minutes: 600, contracts: 0, ...x }); s = last.state; }
  return { s, last };
};

test("an end-of-day floor trails the closing balance and stops at the starting balance", () => {
  const r = rules50();
  const { s } = run(r, [
    { day: "2026-11-23", balance: 51000, equity: 51000, traded: true },
    { day: "2026-11-24", balance: 51000, equity: 51500 } // a new day: yesterday closed at 51,000
  ]);
  assert.equal(s.floor, 49000); // 51,000 - 2,000
  const { s: s2 } = run(r, [
    { day: "2026-11-23", balance: 52500, equity: 52500, traded: true },
    { day: "2026-11-24", balance: 52500, equity: 52500 }
  ]);
  assert.equal(s2.floor, 50000); // would be 50,500; locked at the start
});

test("an end-of-day floor does not move on open profit during the day", () => {
  const r = rules50();
  const { s } = run(r, [{ day: "2026-11-23", balance: 50000, equity: 51800, contracts: 1 }]);
  assert.equal(s.floor, 48000);
});

test("an intraday floor trails the highest equity, open profit included", () => {
  const r = rules50({ drawdown: "intraday", dailyLoss: null });
  const { s, last } = run(r, [
    { day: "2026-11-23", balance: 50000, equity: 51200, contracts: 1 },
    { day: "2026-11-23", balance: 50000, equity: 49200, contracts: 1 }
  ]);
  assert.equal(s.floor, 49200);
  assert.equal(s.status, "failed");
  assert.equal(last.flatten, true);
});

test("a static floor never moves", () => {
  const r = rules50({ drawdown: "static" });
  const { s } = run(r, [
    { day: "2026-11-23", balance: 53000, equity: 53000, traded: true },
    { day: "2026-11-24", balance: 53000, equity: 53000 }
  ]);
  assert.equal(s.floor, 48000);
});

test("the daily loss limit locks the day and the next session unlocks it", () => {
  const r = rules50();
  let { s, last } = run(r, [{ day: "2026-11-23", balance: 50000, equity: 48990, contracts: 2 }]);
  assert.equal(s.status, "locked");
  assert.equal(last.flatten, true);
  assert.equal(canOrder(s, r, { after: 1 }).ok, false);
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 50000, equity: 48990, contracts: 2 },
    { day: "2026-11-23", balance: 48990, equity: 48990 },
    { day: "2026-11-24", balance: 48990, equity: 48990 }
  ]));
  assert.equal(s.status, "active");
  assert.equal(canOrder(s, r, { after: 1 }).ok, true);
});

test("a daily loss set to fail ends the evaluation", () => {
  const { s } = run(rules50({ dailyLossMode: "fail" }), [{ day: "2026-11-23", balance: 49000, equity: 49000 }]);
  assert.equal(s.status, "failed");
});

test("the contract limit refuses an order that would hold too many", () => {
  const r = rules50();
  const s = newChallenge(r);
  assert.equal(canOrder(s, r, { after: 5 }).ok, true);
  assert.match(canOrder(s, r, { after: -6 }).reason, /limit is 5/);
});

test("passing needs the target, flat, and the minimum trading days", () => {
  const r = rules50();
  let { s } = run(r, [{ day: "2026-11-23", balance: 53100, equity: 53100, traded: true }]);
  assert.equal(s.status, "active"); // one day of two
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 51000, equity: 51000, traded: true },
    { day: "2026-11-24", balance: 53100, equity: 53300, contracts: 1, traded: true }
  ]));
  assert.equal(s.status, "active"); // still holding
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 51000, equity: 51000, traded: true },
    { day: "2026-11-24", balance: 53100, equity: 53100, traded: true }
  ]));
  assert.equal(s.status, "passed");
});

test("the consistency rule holds a pass back while one day is too large a share", () => {
  const r = rules50({ consistencyPct: 50 });
  const { s, last } = run(r, [
    { day: "2026-11-23", balance: 50500, equity: 50500, traded: true },
    { day: "2026-11-24", balance: 53100, equity: 53100, traded: true } // best day 2,600 of 3,100
  ]);
  assert.equal(s.status, "active");
  assert.equal(last.state.status, "active");
});

test("past the flat-by time a held position must be closed", () => {
  const r = rules50();
  const s = newChallenge(r);
  const out = challengeStep(s, r, { day: "2026-11-23", minutes: 16 * 60 + 59, balance: 50000, equity: 50100, contracts: 1 });
  assert.equal(out.flatten, true);
  assert.equal(challengeStep(s, r, { day: "2026-11-23", minutes: 16 * 60 + 58, balance: 50000, equity: 50100, contracts: 1 }).flatten, false);
});

test("rules without an account size or a maximum loss are refused", () => {
  assert.match(cleanRules({ accountSize: 0 }).reason, /account size/);
  assert.match(cleanRules({ maxLoss: "" }).reason, /maximum loss/);
});
