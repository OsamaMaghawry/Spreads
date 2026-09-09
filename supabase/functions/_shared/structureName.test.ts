import test from "node:test";
import assert from "node:assert/strict";
import { structureName } from "./structureName.ts";

const E = "260918";
const call = (strike: number, qty: number, expiry = E) => ({ type: "C" as const, strike, qty, entryPrice: 1, expiry });
const put = (strike: number, qty: number, expiry = E) => ({ type: "P" as const, strike, qty, entryPrice: 1, expiry });
const stock = (qty: number) => ({ type: "S" as const, qty, entryPrice: 100 });

const label = (legs: any[]) => structureName(legs).label;
const kind = (legs: any[]) => structureName(legs).kind;

test("one leg says what it is", () => {
  assert.equal(label([call(105, -1)]), "Short 105C");
  assert.equal(label([put(95, 1)]), "Long 95P");
  assert.equal(label([stock(210)]), "Shares");
  assert.equal(label([stock(-210)]), "Short shares");
});

test("verticals are named by which way they lean, not by the premium", () => {
  assert.equal(label([call(100, 1), call(110, -1)]), "Bull call spread 100/110");
  assert.equal(label([call(100, -1), call(110, 1)]), "Bear call spread 100/110");
  assert.equal(label([put(100, 1), put(110, -1)]), "Bear put spread 100/110");
  assert.equal(label([put(100, -1), put(110, 1)]), "Bull put spread 100/110");
});

test("a ratio is named with its counts", () => {
  assert.equal(label([call(352.5, 1), call(362.5, -2)]), "1×2 call ratio 352.5/362.5");
  assert.equal(label([put(350, 1), put(340, -3)]), "1×3 put ratio 350/340");
  assert.equal(kind([call(352.5, 1), call(362.5, -2)]), "ratio_spread");
});

test("two expiries are a calendar or a diagonal", () => {
  assert.equal(label([call(100, -1, "260918"), call(100, 1, "261017")]), "Call calendar 100");
  assert.equal(label([call(100, -1, "260918"), call(110, 1, "261017")]), "Call diagonal 100/110");
});

test("a call and a put together", () => {
  assert.equal(label([call(100, 1), put(100, 1)]), "Long straddle 100");
  assert.equal(label([call(105, -1), put(95, -1)]), "Short strangle 95/105");
  assert.equal(label([call(100, 1), put(100, -1)]), "Synthetic long stock 100");
  assert.equal(label([call(110, 1), put(90, -1)]), "Risk reversal 90/110");
});

test("three legs", () => {
  assert.equal(label([call(100, 1), call(105, -2), call(110, 1)]), "Call butterfly 100/105/110");
  assert.equal(label([call(100, 1), call(105, -2), call(115, 1)]), "Broken-wing call butterfly 100/105/115");
  assert.equal(label([call(100, 1), call(110, -1), call(120, -1)]), "Call ladder 100/110/120");
  assert.equal(label([put(90, 1), put(95, -2), put(100, 1)]), "Put butterfly 90/95/100");
});

test("four legs", () => {
  const ic = [put(90, 1), put(95, -1), call(105, -1), call(110, 1)];
  assert.equal(label(ic), "Iron condor 90/95P / 105/110C");
  const ib = [put(90, 1), put(100, -1), call(100, -1), call(110, 1)];
  assert.equal(label(ib), "Iron butterfly 100");
  const ric = [put(90, -1), put(95, 1), call(105, 1), call(110, -1)];
  assert.equal(kind(ric), "reverse_iron_condor");
  const condor = [call(100, 1), call(105, -1), call(110, -1), call(115, 1)];
  assert.equal(label(condor), "Call condor 100/105/110/115");
  const box = [call(100, 1), call(110, -1), put(110, 1), put(100, -1)];
  assert.equal(label(box), "Box 100/110");
});

test("stock changes what the options are called", () => {
  assert.equal(label([stock(100), call(105, -1)]), "Covered call 105");
  assert.equal(label([stock(100), put(95, 1)]), "Protective put 95");
  assert.equal(label([stock(100), put(95, 1), call(105, -1)]), "Collar 95/105");
  assert.equal(label([stock(210), call(352.5, 1), call(362.5, -2)]), "Stock repair");
});

test("a short call with too few shares behind it is not a covered call", () => {
  assert.equal(label([stock(50), call(105, -1)]), "Short 105C + 50 shares");
});

// --- The property that matters ---------------------------------------------

test("anything unrecognised still gets a name, and the name says so honestly", () => {
  const odd = [call(100, 1), call(103, -1), call(107, 3), put(90, -2), call(120, -1)];
  const n = structureName(odd);
  assert.equal(n.label, "5-leg call/put structure");
  assert.equal(n.confident, false, "the flag a screen can use to soften the label");
  assert.equal(n.kind, "multi_leg");
});

test("a name is never empty, for any shape at all", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 0; n < 200; n++) {
    const legs: any[] = [];
    const count = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < count; i++) {
      const t = rnd() < 0.4 ? "C" : rnd() < 0.85 ? "P" : "S";
      legs.push({
        type: t,
        strike: t === "S" ? null : Math.round(80 + rnd() * 60),
        qty: (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)),
        entryPrice: 1,
        expiry: rnd() < 0.8 ? E : "261017"
      });
    }
    const r = structureName(legs);
    assert.ok(typeof r.label === "string" && r.label.length > 0, `empty label for ${JSON.stringify(legs)}`);
    assert.ok(typeof r.kind === "string" && r.kind.length > 0);
  }
});

test("no legs is a position, not a crash", () => {
  assert.equal(structureName([]).label, "Position");
  assert.equal(structureName(null as any).label, "Position");
});
