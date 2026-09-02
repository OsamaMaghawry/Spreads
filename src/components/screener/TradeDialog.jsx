import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SetupPreview from "@/components/open/SetupPreview";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import PreTradeRisk from "@/components/common/PreTradeRisk";
import OpenPricing, { openingDefaults } from "@/components/open/OpenPricing";
import useOpenOrder from "@/components/open/useOpenOrder";
import OrderLog from "@/components/close/OrderLog";
import UpgradePrompt from "@/components/billing/UpgradePrompt";

const label = "text-xs text-slate-500 block mb-1.5";
const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

export default function TradeDialog({ setup, accounts, onClose }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [qty, setQty] = useState(1);
  const [priceMode, setPriceMode] = useState("walk");

  const account = accounts.find((a) => a.id === accountId);
  const unit = setup.strategy === "iron_condor" ? "condor" : "spread";

  // Walk by default, exactly as on the close ticket and Open Position. The
  // start and floor defaults are explained in OpenPricing.
  const [limitCredit, setLimitCredit] = useState(null);
  const [minCredit, setMinCredit] = useState(null);
  const { phase, log, upgrade, run, stop, reset } = useOpenOrder();

  useEffect(() => {
    const d = openingDefaults(setup);
    setLimitCredit(d.start);
    setMinCredit(d.floor);
  }, [setup]);

  const orderType = priceMode === "market" ? "market" : "limit";
  const creditReady = typeof limitCredit === "number" && limitCredit > 0;

  // Never dismissed out from under a working order — it would keep walking at
  // the broker with nothing watching it.
  const handleDismiss = () => {
    if (phase === "working") return;
    reset();
    onClose();
  };

  const summary =
    priceMode === "market"
      ? `Market order · open ${qty} ${setup.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account?.name || ""}.`
      : priceMode === "walk"
        ? `Limit order starting at $${(limitCredit ?? 0).toFixed(2)} credit, conceding toward the bid but never below $${(minCredit ?? 0).toFixed(2)} · open ${qty} ${setup.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account?.name || ""}.`
        : `Limit order resting at $${(limitCredit ?? 0).toFixed(2)} credit — not walked · open ${qty} ${setup.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} on ${account?.name || ""}.`;

  // The spot this scan result was built on travels with every submit and every
  // reprice — see useOpenOrder. Screener rows sit on screen far longer than the
  // open dialog's do, so the server's drift check is what stands between a stale
  // row and an order priced against a market that has moved.
  const submit = () =>
    run({
      accountId,
      setup,
      qty: Number(qty),
      orderType,
      startCredit: limitCredit,
      minCredit,
      priceMode
    });

  return (
    <Dialog open onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Trade {setup.ticker} {unit}</DialogTitle>
        </DialogHeader>

        <SetupPreview setup={setup} qty={Number(qty) || 1} />

        {phase === "idle" && <PreTradeRisk setup={setup} accountId={accountId} qty={qty} />}

        {phase === "idle" && (
          <>
            <div>
              <label className={label}>Trade on account</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.is_paper ? "Paper" : "Live"})</option>
                ))}
              </select>
            </div>

            <div>
              <label className={label}>Quantity</label>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={input} />
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
                  : `Submit — open ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} (${priceMode === "market" ? "market" : priceMode === "walk" ? "walk" : "limit"}) on ${account?.name || "…"}`
              }
              summary={summary}
              warnings={<PreTradeRisk setup={setup} accountId={accountId} qty={qty} />}
              onConfirm={submit}
              disabled={!accountId || (orderType === "limit" && !creditReady)}
            />
          </>
        )}

        {phase !== "idle" && (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {phase === "failed" && upgrade && <UpgradePrompt message={upgrade} />}
            {phase === "working" ? (
              <button onClick={stop} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
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
                Done
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
