import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRules, newChallenge, challengeStep, canOrder, heldContracts } from "./propRules.js";

// Illustrative numbers only, not any firm's.
const BASE = { accountSize: 40000, profitTarget: 2400, maxLoss: 1600, drawdown: "eod", dailyLoss: 800, flatBy: 16 * 60 + 55, minDays: 2 };
const rulesOf = (over = {}) => {
  const out = cleanRules({ ...BASE, ...over });
  assert.equal(out.reason, undefined);
  return out.rules;
};
const run = (rules, steps) => {
  let s = newChallenge(rules);
  let last;
  for (const x of steps) { last = challengeStep(s, rules, { minutes: 600, contracts: 0, ...x }); s = last.state; }
  return { s, last };
};

test("required rules are refused when blank; optional ones are off, never filled in", () => {
  assert.match(cleanRules({ ...BASE, accountSize: 0 }).reason, /account size/);
  assert.match(cleanRules({ ...BASE, profitTarget: "" }).reason, /profit target/);
  assert.match(cleanRules({ ...BASE, maxLoss: null }).reason, /maximum loss/);
  assert.match(cleanRules({ ...BASE, drawdown: undefined }).reason, /maximum loss moves/);
  const { rules } = cleanRules({ accountSize: 150000, profitTarget: 9000, maxLoss: 4500, drawdown: "static" });
  assert.equal(rules.dailyLoss, null);
  assert.equal(rules.maxContracts, null);
  assert.equal(rules.flatBy, null);
  assert.equal(rules.minDays, 0);
  assert.equal(rules.lockAt, 150000);
});

test("an end-of-day floor trails the closing equity and stops at the lock", () => {
  const r = rulesOf();
  let { s } = run(r, [
    { day: "2026-11-23", balance: 40800, equity: 40800, traded: true },
    { day: "2026-11-24", balance: 40800, equity: 41000 }
  ]);
  assert.equal(s.floor, 39200); // 40,800 - 1,600
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 42000, equity: 42000, traded: true },
    { day: "2026-11-24", balance: 42000, equity: 42000 }
  ]));
  assert.equal(s.floor, 40000); // would be 40,400; locked at the start
  ({ s } = run(rulesOf({ lockAt: 40100 }), [
    { day: "2026-11-23", balance: 42000, equity: 42000, traded: true },
    { day: "2026-11-24", balance: 42000, equity: 42000 }
  ]));
  assert.equal(s.floor, 40100); // locked at start + $100
});

test("an end-of-day floor marks a held position at the close, and does not move during the day", () => {
  const r = rulesOf({ flatBy: null });
  let { s } = run(r, [{ day: "2026-11-23", balance: 40000, equity: 41000, contracts: 1 }]);
  assert.equal(s.floor, 38400);
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 40000, equity: 41000, contracts: 1 },
    { day: "2026-11-24", balance: 40000, equity: 41000, contracts: 1 }
  ]));
  assert.equal(s.floor, 39400); // trailed the 41,000 equity at the close
});

test("an intraday floor trails the highest equity, open profit included", () => {
  const r = rulesOf({ drawdown: "intraday", dailyLoss: null });
  const { s, last } = run(r, [
    { day: "2026-11-23", balance: 40000, equity: 41000, contracts: 1 },
    { day: "2026-11-23", balance: 40000, equity: 39400, contracts: 1 }
  ]);
  assert.equal(s.floor, 39400);
  assert.equal(s.status, "failed");
  assert.equal(last.flatten, true);
});

test("a static floor never moves", () => {
  const { s } = run(rulesOf({ drawdown: "static" }), [
    { day: "2026-11-23", balance: 43000, equity: 43000, traded: true },
    { day: "2026-11-24", balance: 43000, equity: 43000 }
  ]);
  assert.equal(s.floor, 38400);
});

test("a breach inside a bar counts: the floor is checked at the bar's worst price", () => {
  const { s } = run(rulesOf({ dailyLoss: null }), [{ day: "2026-11-23", balance: 40000, equity: 39900, worstEquity: 38390, contracts: 1 }]);
  assert.equal(s.status, "failed");
});

test("the daily loss limit locks the day and the next session unlocks it", () => {
  const r = rulesOf();
  let { s, last } = run(r, [{ day: "2026-11-23", balance: 40000, equity: 39190, contracts: 2 }]);
  assert.equal(s.status, "locked");
  assert.equal(last.flatten, true);
  assert.equal(canOrder(s, r, { after: 1 }).ok, false);
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 40000, equity: 39190, contracts: 2 },
    { day: "2026-11-23", balance: 39190, equity: 39190 },
    { day: "2026-11-24", balance: 39190, equity: 39190 }
  ]));
  assert.equal(s.status, "active");
  assert.equal(canOrder(s, r, { after: 1 }).ok, true);
});

test("a position carried over the 18:00 roll: today counts only its move since the roll", () => {
  const r = rulesOf({ flatBy: null });
  // Carried loser: -$600 open at the roll, -$700 the next day = $100 lost today.
  let { s } = run(r, [
    { day: "2026-11-23", balance: 40000, equity: 39400, contracts: 1 },
    { day: "2026-11-24", balance: 40000, equity: 39300, contracts: 1 }
  ]);
  assert.equal(s.status, "active");
  // Carried winner: +$700 open at the roll, -$200 the next day = $900 lost today.
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 40000, equity: 40700, contracts: 1 },
    { day: "2026-11-24", balance: 40000, equity: 39800, contracts: 1 }
  ]));
  assert.equal(s.status, "locked");
  // Measured from the prior closed balance instead, the same day is a $200 loss.
  ({ s } = run(rulesOf({ flatBy: null, dailyBase: "balance" }), [
    { day: "2026-11-23", balance: 40000, equity: 40700, contracts: 1 },
    { day: "2026-11-24", balance: 40000, equity: 39800, contracts: 1 }
  ]));
  assert.equal(s.status, "active");
});

test("closed results only, when the firm does not count open losses against the day", () => {
  const { s } = run(rulesOf({ dailyCountsOpen: false }), [{ day: "2026-11-23", balance: 40000, equity: 39100, contracts: 1 }]);
  assert.equal(s.status, "active");
});

test("a daily loss set to fail ends the evaluation", () => {
  const { s } = run(rulesOf({ dailyLossMode: "fail" }), [{ day: "2026-11-23", balance: 39200, equity: 39200 }]);
  assert.equal(s.status, "failed");
});

test("contracts are counted gross, micros whole or as a tenth", () => {
  const book = [{ root: "ES", qty: 2 }, { root: "MES", qty: -10 }, { root: "MNQ", qty: 5 }];
  assert.equal(heldContracts(book, {}), 17);
  assert.equal(heldContracts(book, { microsAsFraction: true }), 3.5);
  const r = rulesOf({ maxContracts: 3, microsAsFraction: true });
  const s = newChallenge(r);
  assert.equal(canOrder(s, r, { after: 3 }).ok, true);
  assert.match(canOrder(s, r, { after: 3.5 }).reason, /limit is 3/);
});

test("passing needs the target, flat, and the minimum trading days", () => {
  const r = rulesOf();
  let { s } = run(r, [{ day: "2026-11-23", balance: 42500, equity: 42500, traded: true }]);
  assert.equal(s.status, "active"); // one day of two
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 41000, equity: 41000, traded: true },
    { day: "2026-11-24", balance: 42500, equity: 42600, contracts: 1, traded: true }
  ]));
  assert.equal(s.status, "active"); // still holding
  ({ s } = run(r, [
    { day: "2026-11-23", balance: 41000, equity: 41000, traded: true },
    { day: "2026-11-24", balance: 42500, equity: 42500, traded: true }
  ]));
  assert.equal(s.status, "passed");
});

test("the consistency rule, against the profit or against the target", () => {
  const days = [
    { day: "2026-11-23", balance: 40400, equity: 40400, traded: true },
    { day: "2026-11-24", balance: 42500, equity: 42500, traded: true } // best day 2,100 of 2,500 profit
  ];
  assert.equal(run(rulesOf({ consistencyPct: 50 }), days).s.status, "active");
  assert.equal(run(rulesOf({ consistencyPct: 85 }), days).s.status, "passed"); // 2,100 <= 85% of the 2,500 profit (2,125)
  assert.equal(run(rulesOf({ consistencyPct: 85, consistencyBase: "target" }), days).s.status, "active"); // 2,100 > 85% of the 2,400 target (2,040)
});

test("past the flat-by time a held position must be closed", () => {
  const r = rulesOf();
  const s = newChallenge(r);
  assert.equal(challengeStep(s, r, { day: "2026-11-23", minutes: 16 * 60 + 55, balance: 40000, equity: 40100, contracts: 1 }).flatten, true);
  assert.equal(challengeStep(s, r, { day: "2026-11-23", minutes: 16 * 60 + 54, balance: 40000, equity: 40100, contracts: 1 }).flatten, false);
});
