import { useState, useRef } from "react";
import { invokeFunction } from "@/lib/functions";
import { nextCredit, walkBounds } from "@/lib/openWalk";
import { netQuote } from "@/lib/priceVerdict";

// Working an opening order the way the close ticket works a closing one.
//
// The shape mirrors useCloseOrder deliberately -- submit, poll, reprice, cancel
// -- but three rules differ, and each is an asymmetry in what going wrong costs:
//
//   1. An open that never fills is not a failure to recover from. Nobody is
//      left holding anything. So the timeout simply cancels and says so.
//   2. Every resubmit goes back through openPosition, which re-runs its own
//      preflight: the spot drift check and the short-leg-through-strike check.
//      That is not overhead to route around -- if the underlying moves through
//      the short strike mid-walk, the trade the user approved no longer exists
//      and the walk must stop, not open it anyway.
//   3. There is no partial-fill reverse-position hazard here that resubmitting
//      the remainder cannot handle, but the remainder is still what gets
//      resubmitted: sending the original quantity after a partial would open
//      more contracts than the user asked for.

const WALK_INTERVAL = 30000;
const POLL = 2000;
const MAX_TIME = 600000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (v) => Math.round(v * 100) / 100;
const money = (v) => `$${Math.abs(v).toFixed(2)}`;

async function invoke(fn, payload) {
  const { data } = await invokeFunction(fn, payload);
  if (data?.error) {
    const err = new Error(data.error);
    err.staleSetup = !!data.staleSetup;
    throw err;
  }
  return data;
}

const orderLegs = (setup) => setup.legs.map((l) => ({ symbol: l.symbol, ratio: l.ratio, side: l.side }));

export default function useOpenOrder() {
  const [phase, setPhase] = useState("idle"); // idle | working | filled | failed
  const [log, setLog] = useState([]);
  const stopRef = useRef(false);

  const addLog = (msg) => setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg }]);

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

  // Ending a walk that did not fill. Says what was opened, if anything, because
  // a partial open is a real position at a real credit and the summary on
  // screen was written for the whole thing.
  async function finishUnfilled(accountId, orderId, qty, filledSoFar, why) {
    addLog(why);
    const result = await ensureCanceled(accountId, orderId);
    const filled = Math.max(filledSoFar, result.filled);
    if (result.outcome === "filled" || (qty && filled >= qty)) {
      addLog("Order filled during cancel");
      setPhase("filled");
      return;
    }
    if (filled > 0) {
      addLog(`Partly opened: ${filled} of ${qty} filled — you hold ${filled}, not ${qty}.`);
      setPhase("failed");
      return;
    }
    if (result.outcome === "canceled") addLog("Order canceled — nothing was opened.");
    else addLog("Could not confirm cancellation — check Alpaca before submitting again.");
    setPhase("failed");
  }

  // Follows an order the user priced themselves without ever touching it. Same
  // rule as the close ticket: a resting price is an instruction, so Stop detaches
  // the watcher and leaves the order working rather than cancelling it.
  async function watchResting(accountId, orderId, qty) {
    let lastStatus = null;
    let filledSoFar = 0;
    while (true) {
      if (stopRef.current) {
        addLog("Stopped watching. The order is still working at your credit —");
        addLog("cancel it from the Orders tab if you no longer want it.");
        setPhase("failed");
        return;
      }
      const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
      if (st.status !== lastStatus) { addLog(`Status: ${st.status}`); lastStatus = st.status; }
      const filledNow = Number(st.filledQty) || 0;
      if (filledNow > filledSoFar) {
        filledSoFar = filledNow;
        addLog(`Filled ${filledSoFar} of ${qty}${st.filledAvgPrice ? ` @ ${money(st.filledAvgPrice)}` : ""}`);
      }
      if (st.status === "filled") {
        addLog(`Order filled${st.filledAvgPrice ? ` @ ${money(st.filledAvgPrice)}` : ""}`);
        setPhase("filled");
        return;
      }
      if (["rejected", "expired", "canceled", "done_for_day"].includes(st.status)) {
        addLog(`Order ${st.status}`);
        if (filledSoFar > 0 && filledSoFar < qty) addLog(`Partly opened: ${filledSoFar} of ${qty}.`);
        setPhase(filledSoFar >= qty ? "filled" : "failed");
        return;
      }
      await sleep(POLL);
    }
  }

  // priceMode: "walk" concedes the credit toward the bid until it fills;
  // "manual" submits the credit the user chose and leaves it resting; "market"
  // takes whatever the book gives.
  async function run({ accountId, setup, qty, orderType, startCredit, minCredit, priceMode = "walk" }) {
    stopRef.current = false;
    setLog([]);
    setPhase("working");
    const base = {
      accountId,
      legs: orderLegs(setup),
      qty,
      // The spot this setup was built on, sent unchanged on every resubmit. A
      // walk can run for minutes; if the underlying leaves the setup behind, the
      // server refusing is the correct outcome, not an obstacle.
      expectedSpot: setup.spot
    };

    try {
      if (orderType === "market") {
        addLog("Submitting market order…");
        const res = await invoke("openPosition", { ...base, orderType: "market" });
        addLog(`Order submitted (${res.orderId})`);
        await sleep(2000);
        const st = await invoke("manageOrder", { accountId, orderId: res.orderId, action: "get" });
        addLog(`Status: ${st.status}${st.filledAvgPrice ? ` @ ${money(st.filledAvgPrice)}` : ""}`);
        const filled = Number(st.filledQty) || 0;
        if (st.status !== "filled" && filled < qty) {
          addLog(`Filled ${filled} of ${qty}.`);
          setPhase("failed");
          return;
        }
        setPhase("filled");
        return;
      }

      let credit = round2(startCredit);
      addLog(`Submitting limit order at ${money(credit)} credit…`);
      let res = await invoke("openPosition", { ...base, orderType: "limit", limitPrice: credit });
      let orderId = res.orderId;

      if (priceMode === "manual") {
        addLog(`Order resting at ${money(credit)} credit (${orderId})`);
        await watchResting(accountId, orderId, qty);
        return;
      }

      const bounds = walkBounds(credit, netQuote(setup.legs), minCredit);
      if (bounds.floor !== null) {
        addLog(
          bounds.willWalk
            ? `Walking from ${money(credit)} down to no less than ${money(bounds.floor)}.`
            : `Already at or below ${money(bounds.floor)} — resting here rather than conceding further.`
        );
      }

      const start = Date.now();
      let lastWalk = start;
      let steps = 0;
      let lastStatus = null;
      let filledSoFar = 0;
      let holding = false;

      while (true) {
        if (stopRef.current) {
          await finishUnfilled(accountId, orderId, qty, filledSoFar, "Stopped by user — canceling.");
          return;
        }
        if (Date.now() - start > MAX_TIME) {
          await finishUnfilled(
            accountId, orderId, qty, filledSoFar,
            `Timeout reached (${MAX_TIME / 60000} min) — canceling. Nobody is left holding anything.`
          );
          return;
        }

        const st = await invoke("manageOrder", { accountId, orderId, action: "get" });
        if (st.status !== lastStatus) { addLog(`Status: ${st.status}`); lastStatus = st.status; }
        const filledNow = Number(st.filledQty) || 0;
        if (filledNow > filledSoFar) {
          filledSoFar = filledNow;
          addLog(`Filled ${filledSoFar} of ${qty}${st.filledAvgPrice ? ` @ ${money(st.filledAvgPrice)}` : ""}`);
        }
        if (st.status === "filled") {
          addLog(`Order filled${st.filledAvgPrice ? ` @ ${money(st.filledAvgPrice)}` : ""}`);
          setPhase("filled");
          return;
        }
        if (["rejected", "expired", "canceled"].includes(st.status)) {
          addLog(`Order ${st.status}`);
          if (filledSoFar > 0 && filledSoFar < qty) addLog(`Partly opened: ${filledSoFar} of ${qty}.`);
          setPhase(filledSoFar >= qty ? "filled" : "failed");
          return;
        }

        if (Date.now() - lastWalk >= WALK_INTERVAL) {
          steps += 1;
          // Priced against the market as it is now, not as the scan left it —
          // the same reason the close walk requotes every step.
          const q = await invoke("spreadQuote", {
            accountId,
            // getLegsQuote branches on the literal "sell_to_close" and treats
            // everything else as a buy, so the scanner's bare "sell"/"buy"
            // would price every leg as a purchase and invert the credit.
            legs: setup.legs.map((l) => ({
              symbol: l.symbol,
              ratio: l.ratio,
              action: l.side === "sell" ? "sell_to_close" : "buy_to_close"
            }))
          }).catch(() => null);
          // spreadQuote answers in debits; an opening credit is its negation.
          const asCredit = q && Number.isFinite(q.bidDebit)
            ? { bid: round2(-q.askDebit), ask: round2(-q.bidDebit) }
            : null;
          const proposed = nextCredit(credit, asCredit, minCredit);

          if (proposed < credit) {
            holding = false;
            addLog(`Conceding (step ${steps}): ${money(credit)} → ${money(proposed)} credit`);
            const cancelResult = await ensureCanceled(accountId, orderId);
            if (cancelResult.filled > filledSoFar) {
              filledSoFar = cancelResult.filled;
              addLog(`Filled ${filledSoFar} of ${qty} before the reprice`);
            }
            if (cancelResult.outcome === "filled" || filledSoFar >= qty) {
              addLog("Filled during reprice");
              setPhase("filled");
              return;
            }
            if (cancelResult.outcome === "unknown") {
              addLog("Could not confirm cancel — keeping the current order working");
            } else {
              // Only what is still unopened. Resubmitting the full quantity
              // after a partial would open more than the user asked for.
              const remaining = qty - filledSoFar;
              credit = proposed;
              try {
                res = await invoke("openPosition", {
                  ...base, qty: remaining, orderType: "limit", limitPrice: credit
                });
              } catch (e) {
                // The server looked at the market again and refused. On a walk
                // this is the guard working, not an error to retry around.
                addLog(e.staleSetup ? `Stopped: ${e.message}` : `Refused: ${e.message}`);
                addLog("Nothing further was opened.");
                setPhase("failed");
                return;
              }
              orderId = res.orderId;
              addLog(
                `Resubmitted ${remaining === qty ? "" : `${remaining} of ${qty} `}at ${money(credit)} credit (${res.orderId})`
              );
              lastStatus = null;
            }
          } else if (!holding) {
            holding = true;
            addLog(`At your floor (${money(credit)}) — resting here and following the market.`);
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
