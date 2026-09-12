import test from "node:test";
import assert from "node:assert/strict";
import { cashFlows, CASH_FLOW_TYPES } from "./cashFlows.ts";

// The owner's $700 deposit, in the shape Alpaca returns a non-trade activity.
const DEPOSIT = { id: "a1", activity_type: "CSD", date: "2026-09-04", net_amount: "700" };

test("a deposit becomes a signed dated amount", () => {
  assert.deepEqual(cashFlows([DEPOSIT]), [
    { id: "a1", day: "2026-09-04", amount: 700, kind: "CSD" }
  ]);
});

test("the SIGN comes from the amount, not the type", () => {
  // A JNLC can go either way depending on which side of the journal this
  // account is on, so deriving the sign from the type name would invert every
  // outbound journal.
  const out = cashFlows([
    { id: "w", activity_type: "CSW", date: "2026-09-05", net_amount: "-200" },
    { id: "j", activity_type: "JNLC", date: "2026-09-06", net_amount: "-50" },
    { id: "k", activity_type: "JNLC", date: "2026-09-07", net_amount: "50" }
  ]);
  assert.deepEqual(out.map((f) => f.amount), [-200, -50, 50]);
});

test("only cash types count; share transfers are not dollars we know", () => {
  // JNLS and ACATS move SHARES, whose basis this product cannot see. Counting
  // one as a dollar amount would state a cost we do not know.
  const out = cashFlows([
    DEPOSIT,
    { id: "s", activity_type: "JNLS", date: "2026-09-04", net_amount: "5000" },
    { id: "t", activity_type: "ACATS", date: "2026-09-04", net_amount: "9000" },
    { id: "f", activity_type: "FILL", date: "2026-09-04", net_amount: "120" }
  ]);
  assert.deepEqual(out.map((f) => f.id), ["a1"]);
  assert.ok(!CASH_FLOW_TYPES.includes("JNLS"));
});

test("NEVER LOOKED and LOOKED AND FOUND NONE stay different", () => {
  assert.equal(cashFlows(null), null);
  assert.equal(cashFlows(undefined), null);
  assert.deepEqual(cashFlows([]), []);
});

test("an unreadable amount is dropped, never read as zero", () => {
  // Zero is a statement that no money moved, which is precisely the thing we
  // would be wrong about. A dropped row makes the COUNT disagree with the
  // broker's, which is visible; a zero makes the TOTAL wrong, which is not.
  const out = cashFlows([
    DEPOSIT,
    { id: "b", activity_type: "CSD", date: "2026-09-05", net_amount: "" },
    { id: "c", activity_type: "CSD", date: "2026-09-05", net_amount: "n/a" },
    { id: "d", activity_type: "CSD", date: "bad-date", net_amount: "100" }
  ]);
  assert.deepEqual(out.map((f) => f.id), ["a1"]);
});

test("thousands separators do not truncate the amount", () => {
  // parseFloat("1,000.00") is 1, silently — a $1,000 deposit read as $1.
  const [f] = cashFlows([{ id: "x", activity_type: "CSD", date: "2026-09-04", net_amount: "1,500.50" }]);
  assert.equal(f.amount, 1500.5);
});

test("a repeated id cannot double a deposit", () => {
  // The feed is paged and other activity types are merged into it elsewhere.
  const out = cashFlows([DEPOSIT, { ...DEPOSIT }]);
  assert.equal(out.length, 1);
});

test("flows come back oldest first, so the weighting reads in order", () => {
  const out = cashFlows([
    { id: "2", activity_type: "CSD", date: "2026-09-09", net_amount: "1" },
    { id: "1", activity_type: "CSD", date: "2026-08-01", net_amount: "1" }
  ]);
  assert.deepEqual(out.map((f) => f.day), ["2026-08-01", "2026-09-09"]);
});
