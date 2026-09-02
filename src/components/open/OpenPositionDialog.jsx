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
import { SCOPE, saveLastUsed } from "@/lib/scanPresets";
import OpenPricing, { openingDefaults } from "./OpenPricing";
import useOpenOrder from "./useOpenOrder";
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
  const { phase, log, upgrade, run, stop: stopOrder, reset } = useOpenOrder();

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

  // A working order must not be abandoned by a stray click outside the dialog:
  // dismissing while it walks would leave it running at the broker with nothing
  // watching it.
  const handleDismiss = () => {
    if (phase === "working") return;
    const done = phase === "filled";
    reset();
    if (done) onDone(); else onClose();
  };

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
            <SetupPreview setup={setup} qty={Number(qty) || 1} />

            <PreTradeRisk setup={setup} accountId={account.id} qty={qty} />

            <div>
              <label className={label}>Quantity{setup.maxContracts ? ` — up to ${setup.maxContracts} on ${setup.sharesHeld} shares` : ""}</label>
              <input type="number" min={1} max={setup.maxContracts || undefined} value={qty} onChange={(e) => setQty(e.target.value)} className={input} />
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
            {phase === "working" ? (
              <button onClick={stopOrder} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
                Stop &amp; cancel order
              </button>
            ) : phase === "failed" ? (
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
                  Try again
                </button>
                <button onClick={handleDismiss} className="flex-1 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
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