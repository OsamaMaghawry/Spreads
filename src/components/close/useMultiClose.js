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

  // Walk ONE order to a fill. Resolves { filled, orderId } or throws.
  async function walkOne(accountId, order, index, total) {
    const legs = orderLegs(order);
    const qty = order.qty;
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
    addLog(`${label}: submitting at ${priceLabel(debit)}…`);
    let res = await invoke("closeSpread", {
      accountId, legs, qty, orderType: "limit", limitPrice: debit,
      ticker: order.legs[0]?.ticker || null, quote: q0 || null
    });
    // The server can rescale an unreduced ratio, which changes the unit the
    // broker reports fills in. Adopt what it says it sent.
    let unit = Number(res.sentQty) > 0 ? Number(res.sentQty) : qty;
    let orderId = res.orderId;
    let filledSoFar = 0;
    let lastStatus = null;
    let lastWalk = Date.now();
    const began = Date.now();

    while (true) {
      if (stopRef.current) {
        addLog(`${label}: stopped by you — canceling.`);
        await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
        throw new Error("stopped");
      }
      if (Date.now() - began > MAX_TIME) {
        addLog(`${label}: 10 minutes without a fill — canceling.`);
        await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
        throw new Error("timeout");
      }

      const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
      if (st.status !== lastStatus) { addLog(`${label}: ${st.status}`); lastStatus = st.status; }
      const filledNow = Number(st.filledQty) || 0;
      if (filledNow > filledSoFar) {
        filledSoFar = filledNow;
        addLog(`${label}: filled ${filledSoFar} of ${unit}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
      }
      if (st.status === "filled" || filledSoFar >= unit) {
        addLog(`${label}: complete.`);
        return { filled: true, orderId };
      }
      if (["rejected", "expired", "canceled", "done_for_day"].includes(st.status)) {
        // A partial here is the dangerous state, and it stops the sequence:
        // the next order assumes this one is done, and it is not.
        addLog(`${label}: ${st.status}${filledSoFar > 0 ? ` after ${filledSoFar} of ${unit} filled` : ""}.`);
        throw new Error(st.status);
      }

      if (Date.now() - lastWalk >= WALK_INTERVAL) {
        const q = await quoteFor(accountId, order);
        const proposed = nextLimit(debit, q);
        if (proposed > debit) {
          addLog(`${label}: repricing ${priceLabel(debit)} → ${priceLabel(proposed)}`);
          await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
          // Only what is still open, or the resubmit closes more than is held.
          const remaining = unit - filledSoFar;
          debit = proposed;
          res = await invoke("closeSpread", {
            accountId, legs, qty: remaining, orderType: "limit", limitPrice: debit,
            ticker: order.legs[0]?.ticker || null, quote: q || null
          });
          orderId = res.orderId;
          unit = Number(res.sentQty) > 0 ? Number(res.sentQty) + filledSoFar : unit;
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
        await walkOne(accountId, plan.orders[i], i, plan.orders.length);
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
