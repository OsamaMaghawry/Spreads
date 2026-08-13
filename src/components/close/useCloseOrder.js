import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";

const WALK_STEP = 0.02;
const WALK_INTERVAL = 30000;
const MAX_STEPS = 5;
const POLL = 2000;
const MAX_TIME = 300000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = async (fn, payload) => (await base44.functions.invoke(fn, payload)).data;
const round2 = (v) => Math.round(v * 100) / 100;

export default function useCloseOrder() {
  const [phase, setPhase] = useState("idle"); // idle | working | filled | failed
  const [log, setLog] = useState([]);
  const stopRef = useRef(false);

  const addLog = (msg) => setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg }]);

  async function run({ accountId, spread, qty, orderType, startDebit }) {
    stopRef.current = false;
    setLog([]);
    setPhase("working");
    const params = { accountId, shortSymbol: spread.shortSymbol, longSymbol: spread.longSymbol, qty };
    try {
      if (orderType === "market") {
        addLog("Submitting market order…");
        const res = await invoke("closeSpread", { ...params, orderType: "market" });
        addLog(`Order submitted (${res.orderId})`);
        await sleep(2000);
        const st = await invoke("manageOrder", { accountId, orderId: res.orderId, action: "get" });
        addLog(`Status: ${st.status}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
        setPhase("filled");
        return;
      }

      let debit = round2(startDebit);
      addLog(`Submitting limit order at $${debit.toFixed(2)} debit…`);
      let res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit });
      let orderId = res.orderId;
      const start = Date.now();
      let lastWalk = start;
      let steps = 0;
      let lastStatus = null;

      while (!stopRef.current) {
        if (Date.now() - start > MAX_TIME) {
          addLog("Timeout reached — canceling order");
          await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
          setPhase("failed");
          return;
        }
        const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
        if (st.status !== lastStatus) {
          addLog(`Status: ${st.status}`);
          lastStatus = st.status;
        }
        if (["filled", "partially_filled"].includes(st.status)) {
          addLog(`Order filled${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
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
          if (q && q.askDebit) proposed = Math.min(proposed, round2(q.askDebit + 0.05));

          if (Math.abs(proposed - debit) >= 0.01) {
            addLog(`Repricing (${steps}/${MAX_STEPS}): $${debit.toFixed(2)} → $${proposed.toFixed(2)}`);
            await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
            await sleep(1000);
            const race = await invoke("manageOrder", { accountId, orderId, action: "get" }).catch(() => null);
            if (race && ["filled", "partially_filled"].includes(race.status)) {
              addLog("Filled during reprice");
              setPhase("filled");
              return;
            }
            debit = proposed;
            res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit });
            orderId = res.orderId;
            addLog(`Resubmitted at $${debit.toFixed(2)} (${res.orderId})`);
            lastStatus = null;
          } else {
            addLog("No meaningful price change possible");
          }
          lastWalk = Date.now();
        }
        await sleep(POLL);
      }

      addLog("Stopped — canceling working order");
      await invoke("manageOrder", { accountId, orderId, action: "cancel" }).catch(() => {});
      setPhase("failed");
    } catch (e) {
      addLog(`Error: ${e.response?.data?.error || e.message}`);
      setPhase("failed");
    }
  }

  const stop = () => { stopRef.current = true; };
  const reset = () => { setPhase("idle"); setLog([]); stopRef.current = true; };

  return { phase, log, run, stop, reset };
}