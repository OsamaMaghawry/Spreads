import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, BellRing, StopCircle } from "lucide-react";
import StrategyPicker from "./StrategyPicker";
import ScanFilters from "./ScanFilters";
import CandidateList from "./CandidateList";
import SetupPreview from "./SetupPreview";
import useScanLoop from "./useScanLoop";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import PreTradeRisk from "@/components/common/PreTradeRisk";
import ScanPresets from "@/components/common/ScanPresets";
import NumberField from "@/components/common/NumberField";
import { SCOPE, saveLastUsed } from "@/lib/scanPresets";
import OpenPricing, { openingDefaults } from "./OpenPricing";
import useOpenOrder from "./useOpenOrder";
import useLiveSetup from "./useLiveSetup";
import { saveOrder, deleteSavedOrder } from "@/lib/savedOrders";
import { toast } from "@/components/ui/use-toast";
import RestingOrder from "./RestingOrder";
import OrderLog from "@/components/close/OrderLog";
import UpgradePrompt from "@/components/billing/UpgradePrompt";
import OrderWarnings from "./OrderWarnings";
import { unitFor, isSingle } from "@/lib/setupUnit";

const DEFAULTS = {
  tickers: "SPY, QQQ",
  dteMin: 0,
  dteMax: 3,
  deltaMin: 0.12,
  deltaMax: 0.22,
  widthMin: 1,
  widthMax: 3,
  minCredit: 0.2,
  maxRisk: "",
  putRatio: 2,
  callRatio: 1
};

const legKey = (s) => s.legs.map((l) => l.symbol).join("|");

export default function OpenPositionDialog({ account, onClose, onDone, prefill = null }) {
  const [strategy, setStrategy] = useState("iron_condor");
  const [cfg, setCfg] = useState(DEFAULTS);
  const [qty, setQty] = useState(1);

  const { running, attempts, nextIn, candidates, skipped, error: scanError, start, stop, setCandidates, marketOpen } = useScanLoop();
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);

  const isCondor = strategy === "iron_condor";
  const single = isSingle(strategy);
  const unit = unitFor(strategy);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  // Walk is the default here for the same reason it is on the close ticket: it
  // fills more often than a price left to rest. See OpenPricing for why the
  // start and floor default where they do.
  const [timeInForce, setTimeInForce] = useState("day");
  const [priceMode, setPriceMode] = useState("walk");
  // SAVE INSTEAD OF SEND. The owner: *"I want to add the Private option when
  // creating order too, something like a checkmark; unchecked by default."*
  //
  // Unchecked is the only defensible default and not merely what was asked
  // for: the dialog is called Open Position, its button says Submit, and a
  // trader who ticks nothing expects the order to reach the market. A default
  // that silently parked orders would make "I placed it" mean "I did not".
  const [savePrivate, setSavePrivate] = useState(false);
  // The saved ticket this dialog was opened from, if any. Held so the row can
  // be cleared once -- and only once -- the order actually reaches the broker.
  const [fromSaved, setFromSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [limitCredit, setLimitCredit] = useState(null);
  const [minCredit, setMinCredit] = useState(null);
  const { phase, log, upgrade, resting, warnings, run, stop: stopOrder, reset, replacePrice, sendAnyway } = useOpenOrder();

  // The market under the chosen setup, live while the ticket is being priced
  // and while a hand-priced order rests (so its price can be changed against
  // the quote as it is now). Off during a walk: the walk requotes itself.
  const live = useLiveSetup(account.id, setup, !!setup && (phase === "idle" || resting));

  // A different setup is a different price. Reseeding on the setup rather than
  // on every render is what lets a hand-set credit survive a re-render.
  useEffect(() => {
    const d = openingDefaults(setup);
    setLimitCredit(d.start);
    setMinCredit(d.floor);
  }, [setup]);

  // A SAVED TICKET, REOPENED. This is the only way a parked order reaches the
  // broker, deliberately: the release gate blocked a send button on the saved
  // card because it was a second route that bypassed the warning
  // acknowledgement, the risk panel and the drift check. Landing the ticket
  // here instead means every one of those applies, unchanged, because by this
  // point it is an ordinary order.
  //
  // The price is restored as the trader set it, and the mode is "manual" --
  // NOT the walk. A walk concedes toward the bid on its own; starting one on a
  // price chosen days ago, without the trader re-confirming it, would move
  // their limit while they watched. Manual rests exactly where they put it.
  useEffect(() => {
    if (!prefill) return;
    setFromSaved(prefill);
    setSetup({
      ticker: prefill.ticker,
      legs: (prefill.legs || []).map((l) => ({
        symbol: l.symbol,
        side: String(l.side || "").startsWith("sell") ? "sell" : "buy",
        ratio: l.ratio ?? 1
      }))
    });
    setQty(Number(prefill.qty) || 1);
    if (prefill.order_type === "market") {
      setPriceMode("market");
    } else {
      setPriceMode("manual");
      // Stored unsigned beside a flag. `openingDefaults` reseeds from the
      // setup, so this runs after it in a second effect keyed on the setup
      // landing -- see the guard below.
    }
    if (prefill.time_in_force === "gtc" || prefill.time_in_force === "day") {
      setTimeInForce(prefill.time_in_force);
    }
  }, [prefill]);

  // The saved price, applied AFTER `openingDefaults` has reseeded from the new
  // setup -- otherwise the default would overwrite it on the same tick. Runs
  // once per reopened ticket.
  const seededPrice = useRef(null);
  // Once the reopened ticket has actually reached the broker, the saved copy
  // stops being a ticket and becomes a duplicate of a live order -- so it goes.
  //
  // KEYED ON THE ORDER EXISTING, not on the dialog closing. "working" is
  // enough: the order is at the broker from that moment, whether it fills,
  // rests or is walked. Waiting for "filled" would leave a saved copy beside a
  // resting order, which is exactly the pair that gets sent twice.
  //
  // A failed delete is deliberately silent. The order is placed; that is the
  // part that matters, and an error box about housekeeping over a live ticket
  // would read as a problem with the order itself. The stale row shows as a
  // saved ticket the trader can delete.
  const clearedSaved = useRef(null);
  useEffect(() => {
    if (!fromSaved) return;
    if (!["working", "filled", "detached"].includes(phase)) return;
    if (clearedSaved.current === fromSaved.id) return;
    clearedSaved.current = fromSaved.id;
    const sent = Number(qty) || 0;
    const parked = Number(fromSaved.qty) || 0;
    deleteSavedOrder(fromSaved.id)
      .then(() => {
        toast({
          title: "Saved ticket sent",
          description:
            sent && parked && sent !== parked
              ? `Sent ${sent} of the ${parked} you had saved. The saved ticket has been removed — the remaining ${Math.max(parked - sent, 0)} is not queued anywhere.`
              : "It is with your broker now, and the saved copy has been removed."
        });
      })
      .catch(() => {
        toast({
          title: "Sent, but the saved copy is still here",
          description: "The order is with your broker. We could not remove the saved ticket — delete it under Saved so it is not sent twice."
        });
      });
  }, [fromSaved, phase, qty]);
  useEffect(() => {
    if (!fromSaved || !setup) return;
    if (seededPrice.current === fromSaved.id) return;
    if (fromSaved.order_type !== "limit" || fromSaved.limit_price === null) return;
    seededPrice.current = fromSaved.id;
    setLimitCredit(Math.abs(Number(fromSaved.limit_price)));
  }, [fromSaved, setup]);

  const orderType = priceMode === "market" ? "market" : "limit";
  const creditReady = typeof limitCredit === "number" && limitCredit > 0;

  // Merged over DEFAULTS so a preset saved before a filter existed still yields
  // a complete config — same reasoning as the screener's applyPreset.
  const applyPreset = (savedStrategy, savedConfig) => {
    setStrategy(savedStrategy);
    setCfg({ ...DEFAULTS, ...savedConfig });
    setCandidates(null);
    setSetup(null);
  };

  const scan = () => {
    setError(null);
    setSetup(null);
    // Never let recording the parameters block the scan.
    saveLastUsed(SCOPE.OPEN, strategy, cfg).catch(() => {});
    start(
      {
        accountId: account.id,
        strategy,
        tickers: cfg.tickers.split(",").map((t) => t.trim()).filter(Boolean),
        dteMin: Number(cfg.dteMin),
        dteMax: Number(cfg.dteMax),
        // Sweep granularity inside these ranges is the engine's call — see the
        // matching note in pages/Screener.jsx.
        deltaMin: Number(cfg.deltaMin),
        deltaMax: Number(cfg.deltaMax),
        widthMin: Number(cfg.widthMin),
        widthMax: Number(cfg.widthMax),
        minCredit: Number(cfg.minCredit),
        maxCredit: 1000,
        maxRisk: cfg.maxRisk === "" ? null : Number(cfg.maxRisk),
        putRatio: isCondor ? Number(cfg.putRatio) : 1,
        callRatio: isCondor ? Number(cfg.callRatio) : 1
      },
      (found) => setSetup(found[0])
    );
  };

  const submit = async () => {
    // Private tickets never touch `run`, which is the whole submit-and-watch
    // machine: no broker call, no polling, no walk. Routing them through it
    // and cancelling afterwards would put a real order on the market for the
    // moments in between, which is exactly what the checkbox says will not
    // happen.
    if (savePrivate) {
      setSaveBusy(true);
      setSaveError(null);
      try {
        await saveOrder({
          accountId: account.id,
          ticker: setup.ticker,
          legs: setup.legs.map((l) => ({ symbol: l.symbol, side: l.side, ratio: l.ratio })),
          qty: Number(qty),
          limitPrice: orderType === "limit" ? limitCredit : null,
          orderType,
          // A ticket built in this dialog is an OPENING structure priced as a
          // credit, which is what `limitCredit` means throughout it.
          netIsCredit: true,
          timeInForce
        });
        // `onDone` rather than `onClose`: the parent refetches, so the saved
        // ticket is visible in the Orders tab the moment the dialog closes
        // rather than after the next manual refresh.
        toast({
          title: "Saved for later",
          description: `${setup.ticker} was not sent to your broker. Find it under "Saved" in this account.`
        });
        onDone?.();
      } catch (e) {
        setSaveError(e.message || "Could not save it.");
      } finally {
        setSaveBusy(false);
      }
      return;
    }
    return run({
      accountId: account.id,
      setup,
      qty: Number(qty),
      orderType,
      startCredit: limitCredit,
      minCredit,
      priceMode,
      timeInForce
    });
  };

  // What the X and a click outside the dialog do depends on where the order is:
  //   walking   -- nothing, while it is still conceding. Dismissing would leave
  //                it stepping the price at the broker with nothing watching it.
  //   resting   -- stop watching. The order keeps working; the log says so and
  //                the next click leaves. A walk that has reached its floor is
  //                in this state too: it has stopped conceding and is simply
  //                sitting at that limit, so it must be leavable like any other
  //                resting order rather than trapping the ticket.
  //   failed    -- back to the ticket, setup and price kept. Nothing was sent,
  //                and losing the setup over a refused order is what sent the
  //                user back to the account page with nothing to retry.
  //   filled / detached -- leave and refresh.
  const handleDismiss = () => {
    if (phase === "working") {
      if (resting) stopOrder();
      return;
    }
    // Nothing was sent, so the X means "back to the ticket", not "leave".
    if (phase === "warned" || phase === "failed") { reset(); return; }
    const refresh = phase === "filled" || phase === "detached";
    reset();
    if (refresh) onDone(); else onClose();
  };
  const closeTicket = () => { reset(); onClose(); };

  const summary =
    priceMode === "market"
      ? `Market order · open ${qty} ${setup?.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account.name}.`
      : priceMode === "walk"
        ? `Limit order starting at $${(limitCredit ?? 0).toFixed(2)} credit, conceding toward the bid but never below $${(minCredit ?? 0).toFixed(2)} · open ${qty} ${setup?.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account.name}.`
        : `Limit order resting at $${(limitCredit ?? 0).toFixed(2)} credit — not walked · open ${qty} ${setup?.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account.name}.`;

  const label = "text-xs text-slate-500 block mb-1.5";
  const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <Dialog open onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Open a position — {account.name}</DialogTitle>
        </DialogHeader>

        {phase === "idle" && (
          <>
        <ScanPresets scope={SCOPE.OPEN} strategy={strategy} config={cfg} onApply={applyPreset} />

        <StrategyPicker
          value={strategy}
          onChange={(v) => { setStrategy(v); setCandidates(null); setSetup(null); reset(); }}
        />

        <ScanFilters cfg={cfg} set={set} isCondor={isCondor} single={single} strategy={strategy} />

        {running ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>
                {/* Outside the session there is nothing for a pass to find:
                    options do not trade, so the chain cannot move. Counting
                    down to the next attempt implies otherwise. */}
                {marketOpen
                  ? `Scanning continuously — pass ${attempts}${nextIn > 0 ? ` · retrying in ${nextIn}s` : "…"}`
                  : `Options open at 09:30 ET — scanning resumes then (pass ${attempts})`}
              </span>
            </div>
            <button
              onClick={stop}
              className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <StopCircle className="w-4 h-4" /> Stop scanning
            </button>
          </div>
        ) : (
          <button
            onClick={scan}
            disabled={!cfg.tickers.trim()}
            className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            {candidates ? "Scan again" : "Start scanning"}
          </button>
        )}

        {candidates?.length > 0 && phase === "idle" && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-sm text-emerald-700 font-medium">
            <BellRing className="w-4 h-4" /> {candidates.length} setups found — scan stopped.
          </div>
        )}

          </>
        )}

        {(error || scanError) && phase === "idle" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{error || scanError}</div>
        )}

        {skipped.length > 0 && phase === "idle" && (
          <div className="text-[11px] text-slate-500 leading-relaxed">
            Skipped: {skipped.map((s) => `${s.ticker} (${s.reason})`).join(" · ")}
          </div>
        )}

        {candidates?.length > 0 && phase === "idle" && (
          <CandidateList candidates={candidates} selected={setup ? legKey(setup) : null} onSelect={setSetup} />
        )}

        {setup && phase === "idle" && (
          <>
            <SetupPreview setup={setup} qty={Number(qty) || 1} live={live} />

            <PreTradeRisk setup={setup} accountId={account.id} qty={qty} />

            <div>
              <label className={label}>Quantity{setup.maxContracts ? ` — up to ${setup.maxContracts} on ${setup.sharesHeld} shares` : ""}</label>
              <NumberField value={qty} onChange={setQty} step={1} min={1} max={setup.maxContracts || undefined} ariaLabel="Quantity" />
            </div>

            <OpenPricing
              setup={setup}
              qty={Number(qty) || 1}
              unit={unit}
              priceMode={priceMode}
              onPriceMode={setPriceMode}
              credit={limitCredit}
              onCredit={setLimitCredit}
              minCredit={minCredit}
              onMinCredit={setMinCredit}
              timeInForce={timeInForce}
              onTimeInForce={setTimeInForce}
              liveQuote={live.quote}
            />

            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={savePrivate}
                onChange={(e) => setSavePrivate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span className="text-xs leading-relaxed">
                <span className="font-medium text-slate-800">Save for later — do not send this to the market</span>
                <span className="block text-slate-500 mt-0.5">
                  The ticket is kept in this account&rsquo;s Orders tab. Your broker never sees it, it holds no
                  place in the queue, and it cannot fill until you send it.
                </span>
              </span>
            </label>

            {saveError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</p>
            )}

            <ConfirmSubmit
              label={
                savePrivate
                  ? `Save for later — ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} on ${setup.ticker}, not sent`
                  : orderType === "limit" && !creditReady
                    ? "Set a credit first"
                    : `Submit — open ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} (${priceMode === "market" ? "market" : priceMode === "walk" ? "walk" : "limit"}) on ${setup.ticker}`
              }
              summary={
                savePrivate
                  ? `Saved, not sent · ${qty} ${setup?.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account.name}. Nothing reaches your broker.`
                  : summary
              }
              warnings={<PreTradeRisk setup={setup} accountId={account.id} qty={qty} />}
              onConfirm={submit}
              disabled={saveBusy || (!savePrivate && orderType === "limit" && !creditReady)}
            />
          </>
        )}

        {phase !== "idle" && (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {phase === "warned" && (
              <OrderWarnings warnings={warnings} onSend={sendAnyway} onBack={reset} />
            )}
            {phase === "failed" && upgrade && <UpgradePrompt message={upgrade} />}
            {phase === "working" && resting && setup && (
              <RestingOrder
                credit={limitCredit}
                onCredit={setLimitCredit}
                quote={live.quote}
                unit={unit}
                qty={Number(qty) || 1}
                onUpdate={replacePrice}
              />
            )}
            {phase === "working" ? (
              <button onClick={stopOrder} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
                {resting ? "Stop watching — the order keeps working" : "Stop & cancel order"}
              </button>
            ) : phase === "failed" ? (
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
                  Back to the ticket
                </button>
                <button onClick={closeTicket} className="flex-1 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                  Close ticket
                </button>
              </div>
            ) : phase === "warned" ? (
              // OrderWarnings carries its own two buttons.
              null
            ) : phase === "detached" ? (
              <button onClick={handleDismiss} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                Close — the order keeps working
              </button>
            ) : (
              <button onClick={handleDismiss} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                Done — refresh positions
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}