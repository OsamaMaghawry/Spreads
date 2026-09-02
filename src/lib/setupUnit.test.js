import test from "node:test";
import assert from "node:assert/strict";
import { unitFor, isSingle, structureLabel } from "./setupUnit.js";

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
