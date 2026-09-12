import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SetupPreview from "@/components/open/SetupPreview";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import PreTradeRisk from "@/components/common/PreTradeRisk";
import NumberField from "@/components/common/NumberField";
import OpenPricing, { openingDefaults } from "@/components/open/OpenPricing";
import useOpenOrder from "@/components/open/useOpenOrder";
import useLiveSetup from "@/components/open/useLiveSetup";
import RestingOrder from "@/components/open/RestingOrder";
import OrderLog from "@/components/close/OrderLog";
import UpgradePrompt from "@/components/billing/UpgradePrompt";
import TicketAnalysis from "@/components/open/TicketAnalysis";
import { unitFor } from "@/lib/setupUnit";
import { fmtMoney } from "@/lib/format";

const label = "text-xs text-slate-500 block mb-1.5";
const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

// `defaultAccountId` is which account the ticket opens on. The option chain
// is read on one account and the owner expects the ticket to arrive on that
// one, with the others still reachable from the selector -- "the accounts
// don't show up in the ticket from the chains. Only shows one account despite
// in the chain itself it shows all accounts."
//
// `onClose` receives `{ phase }` — what the ticket was doing when it was left.
// The chain uses it to decide whether the selection it came from is spent
// (an order went to the broker) or still wanted (the owner looked and went
// back to change a strike).
export default function TradeDialog({ setup, accounts, onClose, defaultAccountId = null, positions = null }) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id || ""
  );
  const [qty, setQty] = useState(1);
  const [priceMode, setPriceMode] = useState("walk");

  const account = accounts.find((a) => a.id === accountId);
  const unit = unitFor(setup.strategy);
  // A setup built from holdings (a covered call's cover and basis) belongs to
  // the account those holdings were read on.
  const coverMoved =
    !!setup.accountId && setup.accountId !== accountId && setup.strategy === "covered_call";

  // Walk by default, exactly as on the close ticket and Open Position. The
  // start and floor defaults are explained in OpenPricing.
  const [limitCredit, setLimitCredit] = useState(null);
  const [minCredit, setMinCredit] = useState(null);
  const { phase, log, upgrade, resting, run, stop, reset, replacePrice } = useOpenOrder();

  // Live under the ticket while it is priced and while a hand-priced order
  // rests; a screener row can be minutes old by the time it is opened.
  const live = useLiveSetup(accountId, setup, phase === "idle" || resting);

  useEffect(() => {
    const d = openingDefaults(setup);
    setLimitCredit(d.start);
    setMinCredit(d.floor);
  }, [setup]);

  const orderType = priceMode === "market" ? "market" : "limit";
  const creditReady = typeof limitCredit === "number" && limitCredit > 0;

  // A STRUCTURE THAT COSTS MONEY CANNOT BE SENT FROM THIS TICKET YET.
  //
  // Everything this dialog opens was, until the option chain, a credit
  // structure: the scanner builds nothing else. The chain made a debit
  // reachable for the first time — buy a put outright, or a vertical the
  // expensive way round — and the whole opening path is still written around
  // a credit: the price control says credit, the walk concedes downward
  // toward the bid, and `openPosition` sends a multi-leg limit as -|price|,
  // which tells the broker to PAY us for an order that costs us.
  //
  // Saying so is the only honest state until the debit path is built. The
  // alternative — leaving "Set a credit first" on screen — invites the user
  // to type a positive number for an order that will never fill at it.
  const isDebit = typeof setup.credit === "number" && setup.credit < 0;

  // Same rules as Open Position: a walk cannot be dismissed; a resting order
  // is left working (the log says so); a failure returns to the ticket with
  // the setup and price kept; filled or detached leaves.
  const handleDismiss = () => {
    if (phase === "working") {
      if (resting) stop();
      return;
    }
    if (phase === "failed") { reset(); return; }
    const was = phase;
    reset();
    onClose({ phase: was });
  };
  const closeTicket = () => { const was = phase; reset(); onClose({ phase: was }); };

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

        <SetupPreview setup={setup} qty={Number(qty) || 1} live={live} />

        {phase === "idle" && <PreTradeRisk setup={setup} accountId={accountId} qty={qty} />}

        {phase === "idle" && (
          <TicketAnalysis
            setup={setup}
            qty={Number(qty) || 1}
            net={priceMode === "manual" ? limitCredit : null}
            positions={positions}
          />
        )}

        {phase === "idle" && isDebit && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">
              This order costs {fmtMoney(Math.abs(setup.credit) * 100 * (Number(qty) || 1))} rather than paying a credit.
            </p>
            <p>
              Orders that pay a debit can&rsquo;t be sent from here yet — the pricing on this ticket works a
              credit down toward the bid, which is the wrong direction for an order you are paying for.
              The analysis above is correct; the submit is switched off until the debit path is built.
            </p>
          </div>
        )}

        {phase === "idle" && (
          <>
            <div>
              <label className={label}>Trade on account</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.is_paper ? "Paper" : "Live"})</option>
                ))}
              </select>
              {/* A covered call is only covered against the shares of the
                  account it is sent to. The chain read holdings and basis on
                  ONE account, so moving the ticket to another makes the cover
                  line on the preview a statement about somewhere else.
                  `openPosition`'s preflight is what actually binds; this is so
                  the screen does not claim otherwise in the meantime. */}
              {coverMoved && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Shares and basis above were read on {setup.accountName || "another account"}. On{" "}
                  {account?.name || "this account"} the cover behind this call may be different — the
                  order is checked against the account you send it to.
                </p>
              )}
            </div>

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
                  : `Submit — open ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} (${priceMode === "market" ? "market" : priceMode === "walk" ? "walk" : "limit"}) on ${account?.name || "…"}`
              }
              summary={summary}
              warnings={<PreTradeRisk setup={setup} accountId={accountId} qty={qty} />}
              onConfirm={submit}
              disabled={!accountId || isDebit || (orderType === "limit" && !creditReady)}
            />
          </>
        )}

        {phase !== "idle" && (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {phase === "failed" && upgrade && <UpgradePrompt message={upgrade} />}
            {phase === "working" && resting && (
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
              <button onClick={stop} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
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
                Done
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
