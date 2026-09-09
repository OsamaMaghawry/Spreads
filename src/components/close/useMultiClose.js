import { useState, useRef } from "react";
import { invokeFunction } from "@/lib/functions";
import { nextLimit, walkStart } from "@/lib/closeWalk";
import { closePlan, orderLegs } from "@/lib/closePlan";

// Closing several positions in one act, in an order that is safe at every step.
//
// The single-position ticket walks ONE order. This walks a SEQUENCE, and the
// sequence is the safety feature: `closePlan` puts every buy-back before every
// sale, so cover is never removed while the thing it covers is still open. Each
// order here waits for the one before it to fill completely before the next is
// sent -- fire-and-forget would defeat the ordering entirely, since the broker
// would work them concurrently and the sale could fill first.
//
// The walk itself is `nextLimit`/`walkStart` from closeWalk.js, the same
// functions the single ticket uses, so the two cannot drift on what a walk is
// allowed to do. Alpaca's own multi-position close is a MARKET liquidation;
// this exists because a market order on a wide options market is how a close
// gives away more than the position was worth.

const WALK_INTERVAL = 30000;
const POLL = 2000;
const MAX_TIME = 600000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = async (fn, payload) => {
  const { data } = await invokeFunction(fn, payload);
  if (data?.error) throw new Error(data.error);
  return data;
};
const round2 = (v) => Math.round(v * 100) / 100;
const priceLabel = (v) => `$${Math.abs(v).toFixed(2)} ${v < 0 ? "credit" : "debit"}`;

export default function useMultiClose() {
  // idle | working | done | stopped | failed
  const [phase, setPhase] = useState("idle");
  const [log, setLog] = useState([]);
  // Which order of the plan is in flight, and what has completed. The ticket
  // shows this as progress, because a half-finished sequence is a state the
  // user must be able to read at a glance.
  const [step, setStep] = useState(0);
  const [done, setDone] = useState([]);
  const stopRef = useRef(false);
  const genRef = useRef(0);

  const addLog = (msg) => setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg }]);

  const reset = () => {
    genRef.current += 1;
    stopRef.current = false;
    setPhase("idle");
    setLog([]);
    setStep(0);
    setDone([]);
  };
  const stop = () => { stopRef.current = true; };

  // Quote one order's legs. Returns null when the market cannot be judged --
  // the server refuses a one-sided book rather than inventing a mid, so this
  // is a real answer and not an outage.
  async function quoteFor(accountId, order) {
    try {
      return await invoke("spreadQuote", { accountId, legs: orderLegs(order) });
    } catch {
      return null;
    }
  }

  // Cancel, and CONFIRM it. Returns { outcome, filled }.
  //
  // The first version wrote `.catch(() => {})` here, which swallows exactly the
  // 422 Alpaca returns when an order cannot be cancelled BECAUSE IT ALREADY
  // FILLED -- the one signal that says "do not resubmit". A second order then
  // went out on top of a completed one. useCloseOrder has had ensureCanceled
  // for this since the single ticket was written; this reimplemented the walk
  // and dropped it.
  async function ensureCanceled(accountId, orderId) {
    await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
    let filled = 0;
    for (let i = 0; i < 10; i++) {
      const st = await invoke("manageOrder", { accountId, orderId, action: "get" }).catch(() => null);
      if (st) {
        filled = Math.max(filled, Number(st.filledQty) || 0);
        if (st.status === "filled") return { outcome: "filled", filled };
        if (["canceled", "rejected", "expired", "done_for_day"].includes(st.status)) {
          return { outcome: "canceled", filled };
        }
      }
      await sleep(1000);
    }
    return { outcome: "unknown", filled };
  }

  // Walk ONE order to a fill. Resolves { filled, orderId } or throws.
  async function walkOne(accountId, order, index, total, runKey) {
    const legs = orderLegs(order);
    const label = `Order ${index + 1} of ${total}`;

    const q0 = await quoteFor(accountId, order);
    // No two-sided market means no ceiling, and with no ceiling there is no
    // walk -- the same rule the single ticket follows. Refusing here is what
    // stops a sequence conceding blindly on a shut market.
    const start = walkStart(q0?.midDebit ?? null, null, q0);
    if (start === null) {
      addLog(`${label}: no two-sided market for these legs — nothing to walk toward. Stopping here.`);
      throw new Error("no market");
    }

    let debit = round2(start);
    let steps = 0;
    addLog(`${label}: submitting at ${priceLabel(debit)}…`);
    let res = await invoke("closeSpread", {
      accountId, legs, qty: order.qty, orderType: "limit", limitPrice: debit,
      ticker: order.ticker || null, quote: q0 || null, runKey, step: steps
    });
    // The unit the BROKER is working in, fixed for the life of this walk. The
    // server can rescale an unreduced ratio on the first submit; deriveUnit
    // already reduces so it should not, but adopting what it says it sent costs
    // nothing and is the only honest source for the number fills are counted
    // against.
    const unit = Number(res.sentQty) > 0 ? Number(res.sentQty) : order.qty;
    let orderId = res.orderId;

    // CUMULATIVE across every order this walk has submitted, not the max of any
    // one of them.
    //
    // The first version tracked a single `filledSoFar` from `st.filledQty` --
    // but a reprice cancels and REPLACES the order, and the replacement's
    // filledQty restarts at zero. So the count became the largest single-order
    // fill rather than the total, `remaining` overstated what was open, and
    // from the second reprice onward the resubmit bought back MORE than was
    // held: 9 of 10 contracts closed, and an order for 6 sent against the 1
    // still open. That opens a position rather than closing one.
    let closedTotal = 0;
    let thisOrder = 0;
    let lastStatus = null;
    let lastWalk = Date.now();
    const began = Date.now();

    while (true) {
      // Both exits go through the same reporting, because both discard an order
      // that may have done something on its way out.
      //
      // The first version awaited ensureCanceled and THREW AWAY its answer, so
      // an order that FILLED during the timeout cancel was reported "did not
      // complete (timeout)" -- the position closed, the screen saying it was
      // not, and the sequence halted with the user deciding by hand from a
      // false statement. That is the one signal F3 exists to respect, dropped
      // in a different branch. useCloseOrder.finishAsFailed has said all three
      // of these things since the single ticket was written.
      if (stopRef.current || Date.now() - began > MAX_TIME) {
        const why = stopRef.current ? "stopped" : "timeout";
        addLog(
          why === "stopped"
            ? `${label}: stopped by you — canceling.`
            : `${label}: 10 minutes without a fill — canceling.`
        );
        const cancel = await ensureCanceled(accountId, orderId);
        const total = closedTotal + Math.max(thisOrder, cancel.filled);
        if (cancel.outcome === "filled" || total >= unit) {
          addLog(`${label}: it actually filled while being canceled — this order is complete.`);
          return { filled: true, orderId };
        }
        if (total > 0) {
          addLog(`${label}: partially closed — ${total} of ${unit} filled, ${unit - total} still open.`);
        }
        if (cancel.outcome === "unknown") {
          addLog(
            `${label}: could not confirm the cancel. The order may still be working — check the Orders tab before placing another.`
          );
        }
        throw new Error(why);
      }

      const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
      if (st.status !== lastStatus) { addLog(`${label}: ${st.status}`); lastStatus = st.status; }
      const filledNow = Number(st.filledQty) || 0;
      if (filledNow > thisOrder) {
        thisOrder = filledNow;
        addLog(`${label}: filled ${closedTotal + thisOrder} of ${unit}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
      }
      if (st.status === "filled" || closedTotal + thisOrder >= unit) {
        addLog(`${label}: complete.`);
        return { filled: true, orderId };
      }
      if (["rejected", "expired", "canceled", "done_for_day"].includes(st.status)) {
        // A partial here stops the sequence: the orders after this one assume
        // it completed, and it did not.
        const total = closedTotal + thisOrder;
        addLog(`${label}: ${st.status}${total > 0 ? ` after ${total} of ${unit} filled` : ""}.`);
        throw new Error(st.status);
      }

      if (Date.now() - lastWalk >= WALK_INTERVAL) {
        const q = await quoteFor(accountId, order);
        const proposed = nextLimit(debit, q);
        if (proposed > debit) {
          addLog(`${label}: repricing ${priceLabel(debit)} → ${priceLabel(proposed)}`);
          const cancel = await ensureCanceled(accountId, orderId);
          // Whatever that order achieved is now final; fold it in before any
          // remainder is computed.
          closedTotal += Math.max(thisOrder, cancel.filled);
          thisOrder = 0;
          if (cancel.outcome === "filled" || closedTotal >= unit) {
            addLog(`${label}: filled during the reprice.`);
            return { filled: true, orderId };
          }
          if (cancel.outcome === "unknown") {
            // Never resubmit over an order whose fate is unknown -- that is how
            // a position gets closed twice.
            addLog(
              `${label}: could not confirm the cancel. Stopping rather than risking a second order — the original may still be working, so check the Orders tab before placing another.`
            );
            throw new Error("cancel unconfirmed");
          }
          const remaining = unit - closedTotal;
          if (!(remaining > 0)) {
            addLog(`${label}: complete.`);
            return { filled: true, orderId };
          }
          debit = proposed;
          steps += 1;
          res = await invoke("closeSpread", {
            accountId, legs, qty: remaining, orderType: "limit", limitPrice: debit,
            ticker: order.ticker || null, quote: q || null, runKey, step: steps
          });
          orderId = res.orderId;
          lastStatus = null;
        }
        lastWalk = Date.now();
      }
      await sleep(POLL);
    }
  }

  // Run the whole plan, in order, stopping at the first thing that does not
  // complete. Stopping is deliberate: the plan's safety depends on each step
  // having happened, so continuing past a failure would send a sale whose
  // buy-back never went through.
  async function run({ accountId, selected }) {
    const gen = ++genRef.current;
    stopRef.current = false;
    setLog([]);
    setDone([]);
    setStep(0);
    setPhase("working");

    // Ties every order in this sequence together, so the ladder can be read
    // back as one act when someone asks what the app did. The single ticket has
    // always written one; this is the path that can leave a half-closed book,
    // so it is the one where the trail matters most.
    const runKey = `${accountId}-multi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const plan = closePlan(selected);
    if (!plan.orders.length) { setPhase("failed"); addLog("Nothing selected to close."); return; }

    addLog(
      plan.atomic
        ? "One order — every leg fills together or not at all."
        : `${plan.orders.length} orders, sent one at a time. Buy-backs first, sales last.`
    );

    for (let i = 0; i < plan.orders.length; i++) {
      if (gen !== genRef.current) return;
      setStep(i);
      try {
        await walkOne(accountId, plan.orders[i], i, plan.orders.length, runKey);
        if (gen !== genRef.current) return;
        setDone((d) => [...d, i]);
      } catch (e) {
        if (gen !== genRef.current) return;
        const why = String(e?.message || e);
        addLog(
          i + 1 < plan.orders.length
            ? `Stopping: order ${i + 1} did not complete (${why}), and the orders after it assume it did. Nothing further was sent.`
            : `Order ${i + 1} did not complete (${why}).`
        );
        setPhase(why === "stopped" ? "stopped" : "failed");
        return;
      }
    }
    if (gen !== genRef.current) return;
    addLog("All selected positions closed.");
    setPhase("done");
  }

  return { phase, log, step, done, run, stop, reset };
}
