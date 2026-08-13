import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";

const WALK_STEP = 0.02;
const WALK_INTERVAL = 30000;
const MAX_STEPS = 10;
const POLL = 2000;
const MAX_TIME = 600000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = async (fn, payload) => (await base44.functions.invoke(fn, payload)).data;
const round2 = (v) => Math.round(v * 100) / 100;

// Remembers the last limit price attempted per spread so a retry resumes from it.
const lastDebits = {};
const spreadKey = (accountId, spread) => `${accountId}_${spread.shortSymbol}_${spread.longSymbol}`;
export const getLastDebit = (accountId, spread) => lastDebits[spreadKey(accountId, spread)] ?? null;

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

  async function run({ accountId, spread, qty, orderType, startDebit }) {
    stopRef.current = false;
    setLog([]);
    setPhase("working");
    const params = { accountId, shortSymbol: spread.shortSymbol, longSymbol: spread.longSymbol, qty };
    const key = spreadKey(accountId, spread);
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
      addLog(`Submitting limit order at $${debit.toFixed(2)} debit…`);
      let res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit });
      let orderId = res.orderId;
      const start = Date.now();
      let lastWalk = start;
      let steps = 0;
      let lastStatus = null;

      while (true) {
        if (stopRef.current) {
          addLog("Stopped by user");
          await finishAsFailed(accountId, orderId);
          return;
        }
        if (Date.now() - start > MAX_TIME) {
          addLog(`Timeout reached (${MAX_TIME / 60000} min)`);
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

        if (steps < MAX_STEPS && Date.now() - lastWalk >= WALK_INTERVAL) {
          steps += 1;
          let proposed = round2(debit + WALK_STEP);
          const q = await invoke("spreadQuote", {
            accountId,
            shortSymbol: spread.shortSymbol,
            longSymbol: spread.longSymbol
          }).catch(() => null);
          if (q && q.askDebit) proposed = Math.max(debit, Math.min(proposed, round2(q.askDebit + 0.05)));

          if (Math.abs(proposed - debit) >= 0.01) {
            addLog(`Repricing (${steps}/${MAX_STEPS}): $${debit.toFixed(2)} → $${proposed.toFixed(2)}`);
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
              addLog(`Resubmitted at $${debit.toFixed(2)} (${res.orderId})`);
              lastStatus = null;
            }
          } else {
            addLog("No meaningful price change possible");
          }
          lastWalk = Date.now();
        }
        await sleep(POLL);
      }
    } catch (e) {
      addLog(`Error: ${e.response?.data?.error || e.message}`);
      setPhase("failed");
    }
  }

  const stop = () => { stopRef.current = true; };
  const reset = () => { setPhase("idle"); setLog([]); stopRef.current = true; };

  return { phase, log, run, stop, reset };
}