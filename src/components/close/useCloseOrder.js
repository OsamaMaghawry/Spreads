import { useState, useRef } from "react";
import { invokeFunction } from "@/lib/functions";
import { nextLimit } from "@/lib/closeWalk";

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

// Net price convention (Alpaca mleg): positive = net debit paid, negative = net credit received.
const priceLabel = (v) => `$${Math.abs(v).toFixed(2)} ${v < 0 ? "credit" : "debit"}`;

// Remembers the last limit price attempted per spread so a retry resumes from it.
const lastDebits = {};
const spreadKey = (accountId, spread, legs) =>
  legs
    ? `${accountId}_${legs.map((l) => l.symbol).join("_")}`
    : `${accountId}_${spread.shortSymbol}_${spread.longSymbol}${spread.callShortSymbol ? `_${spread.callShortSymbol}_${spread.callLongSymbol}` : ""}`;
const wholeParams = (spread) => ({
  shortSymbol: spread.shortSymbol,
  longSymbol: spread.longSymbol,
  callShortSymbol: spread.callShortSymbol,
  callLongSymbol: spread.callLongSymbol,
  putRatio: spread.putRatio || 1,
  callRatio: spread.callRatio || 1
});
// Either the whole structure, or an explicit subset of legs the user picked.
const legParams = (spread, legs) =>
  legs ? { legs: legs.map((l) => ({ symbol: l.symbol, ratio: l.ratio || 1, action: l.action })) } : wholeParams(spread);
export const getLastDebit = (accountId, spread, legs) => lastDebits[spreadKey(accountId, spread, legs)] ?? null;

export default function useCloseOrder() {
  const [phase, setPhase] = useState("idle"); // idle | working | filled | failed
  const [log, setLog] = useState([]);
  const stopRef = useRef(false);

  const addLog = (msg) => setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg }]);

  // Cancels an order and waits until Alpaca confirms it is dead (or filled).
  async function ensureCanceled(accountId, orderId) {
    await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
    for (let i = 0; i < 10; i++) {
      const st = await invoke("manageOrder", { accountId, orderId, action: "get" }).catch(() => null);
      if (st) {
        if (["filled", "partially_filled"].includes(st.status)) return "filled";
        if (["canceled", "rejected", "expired", "done_for_day"].includes(st.status)) return "canceled";
      }
      await sleep(1000);
    }
    return "unknown";
  }

  async function finishAsFailed(accountId, orderId) {
    addLog("Canceling working order…");
    const result = await ensureCanceled(accountId, orderId);
    if (result === "filled") {
      addLog("Order actually filled during cancel");
      setPhase("filled");
      return;
    }
    if (result === "canceled") addLog("Order canceled — safe to place a new order now.");
    else addLog("Could not confirm cancellation — verify in Alpaca before placing a new order.");
    setPhase("failed");
  }

  async function run({ accountId, spread, qty, orderType, startDebit, legs }) {
    stopRef.current = false;
    setLog([]);
    setPhase("working");
    const params = { accountId, ...legParams(spread, legs), qty };
    const key = spreadKey(accountId, spread, legs);
    try {
      if (orderType === "market") {
        addLog("Submitting market order…");
        const res = await invoke("closeSpread", { ...params, orderType: "market" });
        addLog(`Order submitted (${res.orderId})`);
        await sleep(2000);
        const st = await invoke("manageOrder", { accountId, orderId: res.orderId, action: "get" });
        addLog(`Status: ${st.status}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
        delete lastDebits[key];
        setPhase("filled");
        return;
      }

      let debit = round2(startDebit);
      lastDebits[key] = debit;
      addLog(`Submitting limit order at ${priceLabel(debit)}…`);
      let res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit });
      let orderId = res.orderId;
      const start = Date.now();
      let lastWalk = start;
      let steps = 0;
      let lastStatus = null;
      // Set while parked at the ask ceiling, so the log says it once rather
      // than every thirty seconds.
      let holding = false;

      while (true) {
        if (stopRef.current) {
          addLog("Stopped by user");
          await finishAsFailed(accountId, orderId);
          return;
        }
        if (Date.now() - start > MAX_TIME) {
          addLog(`Timeout reached (${MAX_TIME / 60000} min) — canceling; the price never became marketable.`);
          await finishAsFailed(accountId, orderId);
          return;
        }
        const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
        if (st.status !== lastStatus) {
          addLog(`Status: ${st.status}`);
          lastStatus = st.status;
        }
        if (["filled", "partially_filled"].includes(st.status)) {
          addLog(`Order filled${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
          delete lastDebits[key];
          setPhase("filled");
          return;
        }
        if (["rejected", "expired", "canceled"].includes(st.status)) {
          addLog(`Order ${st.status}`);
          setPhase("failed");
          return;
        }

        // No step limit: it keeps working the order until it fills, the user
        // stops it, or the timeout. The old cap of ten stopped the walk after
        // five minutes and then said nothing for five more, which is what a
        // user reported as "it just would not close".
        if (Date.now() - lastWalk >= WALK_INTERVAL) {
          steps += 1;
          const q = await invoke("spreadQuote", { accountId, ...legParams(spread, legs) }).catch(() => null);
          const proposed = nextLimit(debit, q);

          if (proposed > debit) {
            holding = false;
            addLog(`Repricing (step ${steps}): ${priceLabel(debit)} → ${priceLabel(proposed)}`);
            const cancelResult = await ensureCanceled(accountId, orderId);
            if (cancelResult === "filled") {
              addLog("Filled during reprice");
              delete lastDebits[key];
              setPhase("filled");
              return;
            }
            if (cancelResult === "unknown") {
              addLog("Could not confirm cancel — keeping current order working");
            } else {
              debit = proposed;
              lastDebits[key] = debit;
              res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit });
              orderId = res.orderId;
              addLog(`Resubmitted at ${priceLabel(debit)} (${res.orderId})`);
              lastStatus = null;
            }
          } else if (!holding) {
            holding = true;
            addLog(`At the ask ceiling (${priceLabel(debit)}) — holding here and following the market.`);
          }
          lastWalk = Date.now();
        }
        await sleep(POLL);
      }
    } catch (e) {
      addLog(`Error: ${e.message}`);
      setPhase("failed");
    }
  }

  const stop = () => { stopRef.current = true; };
  const reset = () => { setPhase("idle"); setLog([]); stopRef.current = true; };

  return { phase, log, run, stop, reset };
}