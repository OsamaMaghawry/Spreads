import test from "node:test";
import assert from "node:assert/strict";
import { unitFor, isSingle, structureLabel, shortLegs, shortDelta } from "./setupUnit.js";

test("units per strategy", () => {
  assert.equal(unitFor("put_spread"), "spread");
  assert.equal(unitFor("call_spread"), "spread");
  assert.equal(unitFor("iron_condor"), "condor");
  assert.equal(unitFor("cash_secured_put"), "put");
  assert.equal(unitFor("covered_call"), "call");
  assert.equal(isSingle("cash_secured_put"), true);
  assert.equal(isSingle("put_spread"), false);
});

test("structure labels for spreads, condors and singles", () => {
  const spread = { strategy: "put_spread", legs: [{ role: "short_put", strike: 352.5, side: "sell", ratio: 1 }, { role: "long_put", strike: 350, side: "buy", ratio: 1 }] };
  assert.equal(structureLabel(spread), "352.5/350P");
  const condor = { strategy: "iron_condor", legs: [
    { role: "short_put", strike: 350, side: "sell", ratio: 2 }, { role: "long_put", strike: 345, side: "buy", ratio: 2 },
    { role: "short_call", strike: 370, side: "sell", ratio: 1 }, { role: "long_call", strike: 375, side: "buy", ratio: 1 }
  ] };
  assert.equal(structureLabel(condor), "2× 350/345P · 370/375C");
  assert.equal(structureLabel({ strategy: "cash_secured_put", legs: [{ role: "short_put", strike: 352.5, side: "sell" }] }), "352.5P · CSP");
  assert.equal(structureLabel({ strategy: "covered_call", sharesHeld: 300, legs: [{ role: "short_call", strike: 360, side: "sell" }] }), "360C on 300 sh");
});

test("the short leg's delta is reported unsigned, from the contract chosen", () => {
  // targetDelta is what the sweep asked for; it must never reach the screen.
  const csp = {
    strategy: "cash_secured_put",
    targetDelta: 0.16,
    legs: [{ role: "short_put", side: "sell", strike: 225, delta: -0.2437, ratio: 1 }]
  };
  assert.equal(shortDelta(csp), "0.24");
  assert.equal(shortLegs(csp).length, 1);

  const spread = {
    strategy: "put_spread",
    targetDelta: 0.12,
    legs: [
      { role: "short_put", side: "sell", strike: 352.5, delta: -0.183, ratio: 1 },
      { role: "long_put", side: "buy", strike: 350, delta: -0.14, ratio: 1 }
    ]
  };
  assert.equal(shortDelta(spread), "0.18", "the long leg is not the one reported");
});

test("a condor reports the nearer of its two shorts", () => {
  const condor = {
    strategy: "iron_condor",
    legs: [
      { role: "short_put", side: "sell", strike: 350, delta: -0.14, ratio: 1 },
      { role: "long_put", side: "buy", strike: 345, delta: -0.09, ratio: 1 },
      { role: "short_call", side: "sell", strike: 370, delta: 0.21, ratio: 1 },
      { role: "long_call", side: "buy", strike: 375, delta: 0.13, ratio: 1 }
    ]
  };
  assert.equal(shortDelta(condor), "0.21");
});

test("no usable delta reads as nothing, never as zero", () => {
  assert.equal(shortDelta({ legs: [{ side: "sell", delta: null }] }), null);
  assert.equal(shortDelta({ legs: [] }), null);
  assert.equal(shortDelta(null), null);
});
