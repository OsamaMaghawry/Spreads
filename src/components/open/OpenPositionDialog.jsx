import { useState, useEffect } from "react";
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
import RestingOrder from "./RestingOrder";
import OrderLog from "@/components/close/OrderLog";
import UpgradePrompt from "@/components/billing/UpgradePrompt";
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

export default function OpenPositionDialog({ account, onClose, onDone }) {
  const [strategy, setStrategy] = useState("iron_condor");
  const [cfg, setCfg] = useState(DEFAULTS);
  const [qty, setQty] = useState(1);

  const { running, attempts, nextIn, candidates, skipped, error: scanError, start, stop, setCandidates } = useScanLoop();
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);

  const isCondor = strategy === "iron_condor";
  const single = isSingle(strategy);
  const unit = unitFor(strategy);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  // Walk is the default here for the same reason it is on the close ticket: it
  // fills more often than a price left to rest. See OpenPricing for why the
  // start and floor default where they do.
  const [priceMode, setPriceMode] = useState("walk");
  const [limitCredit, setLimitCredit] = useState(null);
  const [minCredit, setMinCredit] = useState(null);
  const { phase, log, upgrade, resting, run, stop: stopOrder, reset, replacePrice } = useOpenOrder();

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

  const submit = () =>
    run({
      accountId: account.id,
      setup,
      qty: Number(qty),
      orderType,
      startCredit: limitCredit,
      minCredit,
      priceMode
    });

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
    if (phase === "failed") { reset(); return; }
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
                Scanning continuously — pass {attempts}
                {nextIn > 0 ? ` · retrying in ${nextIn}s` : "…"}
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
              liveQuote={live.quote}
            />

            <ConfirmSubmit
              label={
                orderType === "limit" && !creditReady
                  ? "Set a credit first"
                  : `Submit — open ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} (${priceMode === "market" ? "market" : priceMode === "walk" ? "walk" : "limit"}) on ${setup.ticker}`
              }
              summary={summary}
              warnings={<PreTradeRisk setup={setup} accountId={account.id} qty={qty} />}
              onConfirm={submit}
              disabled={orderType === "limit" && !creditReady}
            />
          </>
        )}

        {phase !== "idle" && (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
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