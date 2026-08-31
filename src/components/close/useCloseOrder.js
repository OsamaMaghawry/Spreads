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

  // Cancels an order and waits until Alpaca confirms it is dead (or filled),
  // reporting how many units went through on the way.
  //
  // This used to answer "filled" for a partially_filled order. A partial is not
  // a completed close: cancelling one leaves the unfilled remainder open, and
  // the caller needs the number to know what is still working.
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

  async function finishAsFailed(accountId, orderId, qty, filledSoFar = 0) {
    addLog("Canceling working order…");
    const result = await ensureCanceled(accountId, orderId);
    const filled = Math.max(filledSoFar, result.filled);

    if (result.outcome === "filled" || (qty && filled >= qty)) {
      addLog("Order actually filled during cancel");
      setPhase("filled");
      return;
    }
    // The dangerous case to report plainly: some of the position closed and the
    // rest did not. Treated as a failure rather than a fill, because the user
    // still holds something and has to decide what to do about it.
    if (filled > 0) {
      addLog(`Partially closed: ${filled} of ${qty} filled — ${qty - filled} still open.`);
      addLog("Close the remainder here or in Alpaca; this was not a completed close.");
      setPhase("failed");
      return;
    }
    if (result.outcome === "canceled") addLog("Order canceled — safe to place a new order now.");
    else addLog("Could not confirm cancellation — verify in Alpaca before placing a new order.");
    setPhase("failed");
  }

  async function run({ accountId, spread, qty, orderType, startDebit, legs }) {
    stopRef.current = false;
    setLog([]);
    setPhase("working");
    // Ties every order in this walk together, so the ladder can be read back as
    // one sequence when someone asks what the app tried.
    const runKey = `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const params = { accountId, ...legParams(spread, legs), qty, runKey, ticker: spread.ticker };
    const key = spreadKey(accountId, spread, legs);
    try {
      if (orderType === "market") {
        addLog("Submitting market order…");
        const res = await invoke("closeSpread", { ...params, orderType: "market", step: 0 });
        addLog(`Order submitted (${res.orderId})`);
        await sleep(2000);
        const st = await invoke("manageOrder", { accountId, orderId: res.orderId, action: "get" });
        addLog(`Status: ${st.status}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
        const marketFilled = Number(st.filledQty) || 0;
        if (st.status !== "filled" && marketFilled < qty) {
          addLog(`Filled ${marketFilled} of ${qty} — ${qty - marketFilled} still open.`);
          addLog("Not a completed close; check the position before placing another order.");
          setPhase("failed");
          return;
        }
        delete lastDebits[key];
        setPhase("filled");
        return;
      }

      let debit = round2(startDebit);
      lastDebits[key] = debit;
      addLog(`Submitting limit order at ${priceLabel(debit)}…`);
      let res = await invoke("closeSpread", { ...params, orderType: "limit", limitPrice: debit, step: 0 });
      let orderId = res.orderId;
      const start = Date.now();
      let lastWalk = start;
      let steps = 0;
      let lastStatus = null;
      // Units confirmed done. A close can fill in pieces, and every later
      // decision — what to resubmit, what to tell the user — depends on it.
      let filledSoFar = 0;
      // Set while parked at the ask ceiling, so the log says it once rather
      // than every thirty seconds.
      let holding = false;

      while (true) {
        if (stopRef.current) {
          addLog("Stopped by user");
          await finishAsFailed(accountId, orderId, qty, filledSoFar);
          return;
        }
        if (Date.now() - start > MAX_TIME) {
          addLog(`Timeout reached (${MAX_TIME / 60000} min) — canceling; the price never became marketable.`);
          await finishAsFailed(accountId, orderId, qty, filledSoFar);
          return;
        }
        const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
        if (st.status !== lastStatus) {
          addLog(`Status: ${st.status}`);
          lastStatus = st.status;
        }
        const filledNow = Number(st.filledQty) || 0;
        if (filledNow > filledSoFar) {
          filledSoFar = filledNow;
          addLog(`Filled ${filledSoFar} of ${qty}${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
        }
        // Only a complete fill ends this. `partially_filled` used to return here
        // announcing "Order filled", which closed the dialog as a success while
        // the rest of the position was still open — on a spread that can be a
        // leg left unhedged, reported as done.
        if (st.status === "filled") {
          addLog(`Order filled${st.filledAvgPrice ? ` @ $${st.filledAvgPrice}` : ""}`);
          delete lastDebits[key];
          setPhase("filled");
          return;
        }
        if (["rejected", "expired", "canceled"].includes(st.status)) {
          addLog(`Order ${st.status}`);
          // A day order that expires at the bell can already be part done. Say
          // what is still held rather than only how the order ended — that
          // remainder is the thing the user has to act on.
          if (filledSoFar > 0 && filledSoFar < qty) {
            addLog(`Partially closed: ${filledSoFar} of ${qty} filled — ${qty - filledSoFar} still open.`);
          }
          setPhase(filledSoFar >= qty ? "filled" : "failed");
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
            if (cancelResult.filled > filledSoFar) {
              filledSoFar = cancelResult.filled;
              addLog(`Filled ${filledSoFar} of ${qty} before the reprice`);
            }
            if (cancelResult.outcome === "filled" || filledSoFar >= qty) {
              addLog("Filled during reprice");
              delete lastDebits[key];
              setPhase("filled");
              return;
            }
            if (cancelResult.outcome === "unknown") {
              addLog("Could not confirm cancel — keeping current order working");
            } else {
              // Only what is still open. Resubmitting the original quantity
              // after a partial fill would close more than is held and open a
              // new position the other way.
              const remaining = qty - filledSoFar;
              debit = proposed;
              lastDebits[key] = debit;
              res = await invoke("closeSpread", {
                ...params,
                qty: remaining,
                orderType: "limit",
                limitPrice: debit,
                step,
                // The market this price was chosen against, stored beside it.
                quote: q || null
              });
              orderId = res.orderId;
              addLog(
                `Resubmitted ${remaining === qty ? "" : `${remaining} of ${qty} `}at ${priceLabel(debit)} (${res.orderId})`
              );
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