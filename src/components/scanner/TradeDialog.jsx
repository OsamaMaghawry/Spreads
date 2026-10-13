import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SetupPreview from "@/components/open/SetupPreview";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import PreTradeRisk from "@/components/common/PreTradeRisk";
import EarningsWarning from "@/components/common/EarningsWarning";
import NumberField from "@/components/common/NumberField";
import OpenPricing, { openingDefaults } from "@/components/open/OpenPricing";
import useOpenOrder from "@/components/open/useOpenOrder";
import useLiveSetup from "@/components/open/useLiveSetup";
import { saveOrder } from "@/lib/savedOrders";
import { toast } from "@/components/ui/use-toast";
import OrderSent from "@/components/open/OrderSent";
import OrderLog from "@/components/close/OrderLog";
import UpgradePrompt from "@/components/billing/UpgradePrompt";
import TicketAnalysis from "@/components/open/TicketAnalysis";
import OrderWarnings from "@/components/open/OrderWarnings";
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
export default function TradeDialog({ setup, accounts, onClose, defaultAccountId = null, positions = null, onLegQty = null }) {
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id || ""
  );
  // A setup built for a count (a protected repair opened for 2 x 100 shares)
  // opens at that count; everything else at 1.
  const [qty, setQty] = useState(setup.units || 1);
  // A QUANTITY PER LEG, on the option chain's two-leg tickets. The owner:
  // "buying 1 Call vs selling 2 calls ... to be able to control the quantity
  // for each leg". It is still one multi-leg order: spreadSetup turns the two
  // counts into the order's units (`qty` here) and leg ratios in lowest terms,
  // so 2 bought against 4 sold is sent as 2 units of 1:2. What is typed is
  // held as text until it is a whole number, so clearing a box to retype it
  // does not snap it to 1 under the cursor.
  const perLeg = typeof onLegQty === "function" && !!setup.legQty && (setup.legs || []).length === 2;
  const [legDraft, setLegDraft] = useState({});
  useEffect(() => {
    if (perLeg) setQty(setup.units || 1);
  }, [perLeg, setup.units]);
  // Day unless the user says otherwise -- the conservative of the two, and
  // what the ticket silently sent before it asked.
  const [timeInForce, setTimeInForce] = useState("day");
  // Walk by default, except on an order that COSTS money: the walk concedes
  // downward toward the bid, which is meaningless when you are the one paying.
  // OpenPricing hides it there, so the default has to move too or the ticket
  // opens on a mode with no control under it.
  const [priceMode, setPriceMode] = useState(
    typeof setup.credit === "number" && setup.credit < 0 ? "manual" : "walk"
  );

  const account = accounts.find((a) => a.id === accountId);
  const unit = unitFor(setup.strategy);

  // WHAT THE SELECTED ACCOUNT HOLDS -- not what the page that opened this
  // ticket was looking at. The owner: *"When I change the account, the
  // analysis keeps saying no TSLA for this account, it changing doesn't
  // refresh."* The `positions` prop was fixed at the moment the ticket opened,
  // so every figure in Advanced analysis described whichever account the chain
  // happened to be on. `syncAccounts` returns each account's own open
  // positions, so the selected one's book is already here; the prop is the
  // fallback for callers whose account list does not carry them.
  const book = Array.isArray(account?.spreads) ? account.spreads : positions;
  // A setup built from holdings (a covered call's cover and basis) belongs to
  // the account those holdings were read on.
  const coverMoved =
    !!setup.accountId && setup.accountId !== accountId && ["covered_call", "collar", "stock_repair", "protected_repair"].includes(setup.strategy);

  // Walk by default, exactly as on the close ticket and Open Position. The
  // start and floor defaults are explained in OpenPricing.
  const [limitCredit, setLimitCredit] = useState(null);
  // Save instead of send, unchecked by default -- the same control and the
  // same default as the Open Position ticket, because a trader who ticks
  // nothing must get the same behaviour from both screens.
  const [savePrivate, setSavePrivate] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [minCredit, setMinCredit] = useState(null);
  const { phase, log, upgrade, resting, restingAt, warnings, run, stop, reset, replacePrice, sendAnyway } = useOpenOrder();

  // Live under the ticket while it is priced and while a hand-priced order
  // rests; a Scanner row can be minutes old by the time it is opened.
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
  // The ticket works in MAGNITUDES and puts the sign back on here, in the one
  // place the order is built. See `openingDefaults` for why.
  const isDebit = typeof setup.credit === "number" && setup.credit < 0;
  // A change of leg quantities can turn a credit into a debit. The walk only
  // concedes toward the bid, which means nothing when paying, so it steps
  // aside rather than leaving the ticket on a mode with no control under it.
  useEffect(() => {
    if (isDebit && priceMode === "walk") setPriceMode("manual");
  }, [isDebit, priceMode]);
  // What the price actually means, signed the way the rest of the product
  // signs it: positive is taken in, negative is paid out.
  const signedNet = typeof limitCredit === "number" ? (isDebit ? -limitCredit : limitCredit) : null;

  // Same rules as Open Position: a walk cannot be dismissed; a resting order
  // is left working (the log says so); a failure returns to the ticket with
  // the setup and price kept; filled or detached leaves.
  //
  // A RESTING ORDER LEAVES IN ONE STEP. The X, a click outside and Done all
  // close the ticket and leave the order working. It used to take "Stop
  // watching" and then a second screen saying the same thing.
  const leave = () => { reset(); onClose({ phase: "detached" }); };
  const handleDismiss = () => {
    if (phase === "working") {
      if (resting) leave();
      return;
    }
    // Nothing was sent, so the X means "back to the ticket", not "leave".
    if (phase === "warned" || phase === "failed") { reset(); return; }
    const was = phase;
    reset();
    onClose({ phase: was });
  };
  const closeTicket = () => { const was = phase; reset(); onClose({ phase: was }); };

  // One noun for the price, decided by which way the money goes. A summary
  // that says "credit" over an order the user is paying for is the sentence
  // they read last before committing.
  const priced = isDebit ? "debit" : "credit";
  // What is being opened, in words. Per leg when the legs differ, because
  // "1 spread" over a 1:2 hides the second call.
  const legsText = perLeg
    ? setup.legs.map((l) => `${l.side === "sell" ? "sell" : "buy"} ${setup.legQty[l.symbol]}`).join(", ")
    : null;
  const sizeText = perLeg
    ? `${setup.ticker} ${setup.ratioLabel ? `${setup.ratioLabel} ratio` : unit} (${legsText})`
    : `${qty} ${setup.ticker} ${unit}${Number(qty) > 1 ? "s" : ""}`;
  const shortSize = perLeg ? legsText : `${qty} ${unit}${Number(qty) > 1 ? "s" : ""}`;
  const what = `open ${sizeText} on ${account?.name || ""}`;
  const summary =
    priceMode === "market"
      ? `Market order · ${what}.`
      : priceMode === "walk"
        ? `Limit order starting at $${(limitCredit ?? 0).toFixed(2)} credit, conceding toward the bid but never below $${(minCredit ?? 0).toFixed(2)} · ${what}.`
        : `Limit order resting at $${(limitCredit ?? 0).toFixed(2)} ${priced}, ${timeInForce === "gtc" ? "good til canceled" : "good for the day"} · ${what}.`;

  // The spot this scan result was built on travels with every submit and every
  // reprice — see useOpenOrder. Scanner rows sit on screen far longer than the
  // open dialog's do, so the server's drift check is what stands between a stale
  // row and an order priced against a market that has moved.
  const submit = async () => {
    // A private ticket never reaches `run`, so no order exists at the broker
    // even for an instant.
    if (savePrivate) {
      setSaveBusy(true);
      setSaveError(null);
      try {
        await saveOrder({
          accountId,
          ticker: setup.ticker,
          legs: setup.legs.map((l) => ({ symbol: l.symbol, side: l.side, ratio: l.ratio })),
          qty: Number(qty),
          limitPrice: orderType === "limit" ? limitCredit : null,
          orderType,
          // This dialog already knows which way the structure is priced, so
          // the stored row keeps that rather than re-deriving it from legs.
          netIsCredit: !isDebit,
          timeInForce,
          // The whole setup, for reading it back. Legs above are the payload;
          // this is what makes a reopened ticket show its strikes, expiry,
          // deltas and risk instead of dashes and "No ceiling".
          setup
        });
        toast({
          title: "Saved for later",
          description: `${setup.ticker} was not sent to your broker. Find it under "Saved" in that account.`
        });
        onClose({ phase: "saved" });
      } catch (e) {
        setSaveError(e.message || "Could not save it.");
      } finally {
        setSaveBusy(false);
      }
      return;
    }
    return run({
      accountId,
      setup,
      qty: Number(qty),
      orderType,
      startCredit: signedNet,
      minCredit,
      priceMode,
      timeInForce
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Trade {setup.ticker} {unit}</DialogTitle>
        </DialogHeader>

        <SetupPreview setup={setup} qty={Number(qty) || 1} live={live} />

        {/* EARNINGS BELONGS AT THE DECISION, NOT IN THE LIST.
            It was a badge in the results table and nowhere else, which put it
            in the one place it could not be explained -- a scanning column
            three characters wide -- and left it out of the one screen where
            money is actually committed. The owner, on the badge: *"What do you
            mean by 'No earning date'?!! It's so confusing."*
            Here there is room for the sentence, and it is read at the moment
            it can change what someone does. */}
        {phase === "idle" && (
          <EarningsWarning earnings={setup.earnings} ticker={setup.ticker} unknown={setup.earningsUnknown} why={setup.earningsUnknownWhy} />
        )}

        {phase === "idle" && <PreTradeRisk setup={setup} accountId={accountId} qty={qty} showEarnings={false} />}

        {phase === "idle" && (
          <TicketAnalysis
            setup={setup}
            qty={Number(qty) || 1}
            // The scan's own net when the price has not been set by hand, so
            // the curve and the figures beside it are the same trade. Signed,
            // because `pendingRows` reads the sign.
            net={priceMode === "manual" && signedNet !== null ? signedNet : setup.credit}
            positions={book}
          />
        )}

        {phase === "idle" && isDebit && (
          <div className="border border-slate-300 bg-slate-50 rounded-lg p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">
              This order costs money — {fmtMoney(Math.abs(setup.credit) * 100 * (Number(qty) || 1))} at the
              price below, not a credit received.
            </p>
            <p className="mt-1">
              The price you set is what you are willing to PAY, and &ldquo;Walk to fill&rdquo; is not offered:
              it concedes toward the bid, which only means something when you are the one being paid.
              Rest it at your price, or take the market.
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
                  {setup.coveredBy === "long_call" ? "The long call covering this" : "Shares and basis above"} were read on{" "}
                  {setup.accountName || "another account"}. On{" "}
                  {account?.name || "this account"} the cover behind this call may be different — the
                  order is checked against the account you send it to.
                </p>
              )}
            </div>

            {perLeg ? (
              <div>
                <label className={label}>Quantity per leg</label>
                <div className="space-y-2">
                  {setup.legs.map((l) => (
                    <div key={l.symbol} className="flex items-center gap-3">
                      <span className={`w-32 shrink-0 text-xs font-semibold ${l.side === "sell" ? "text-rose-700" : "text-emerald-700"}`}>
                        {l.side === "sell" ? "Sell" : "Buy"} {l.strike} {l.type === "put" ? "put" : "call"}
                        <span className="block text-[11px] font-normal text-slate-500 tabular-nums">{l.expiry}</span>
                      </span>
                      <NumberField
                        value={legDraft[l.symbol] ?? String(setup.legQty[l.symbol] ?? 1)}
                        onChange={(v) => {
                          setLegDraft((d) => ({ ...d, [l.symbol]: v }));
                          const n = Number(v);
                          if (Number.isInteger(n) && n >= 1 && n <= 99) onLegQty(l.symbol, l.side, n);
                        }}
                        step={1}
                        min={1}
                        max={99}
                        ariaLabel={`${l.side === "sell" ? "Sell" : "Buy"} ${l.strike} quantity`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
                {/* What actually reaches the broker, once: a ratio goes as
                    units of the smallest whole ratio, and that is what the
                    order screen at the broker will show. */}
                {setup.ratioLabel && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Sent as one order: {setup.units} × ({setup.legs.map((l) => `${l.side === "sell" ? "sell" : "buy"} ${l.ratio}`).join(", ")}).
                  </p>
                )}
              </div>
            ) : (
              <div>
                {/* The ceiling is CLICKABLE here too, so "up to 3 on 300 shares"
                    fills the field instead of being a number to copy by hand. A
                    covered call is the case where it matters: the maximum is
                    derived from the shares held, and getting it wrong means an
                    order the broker refuses. */}
                <label className={label}>
                  Quantity
                  {setup.maxContracts ? (
                    <>
                      {" — up to "}
                      <button
                        type="button"
                        onClick={() => setQty(String(setup.maxContracts))}
                        className="text-emerald-700 hover:underline"
                        title={`Use all ${setup.maxContracts}`}
                      >
                        {setup.maxContracts}
                      </button>
                      {setup.coveredBy === "long_call" ? " against your long call" : ` on ${setup.sharesHeld} shares`}
                    </>
                  ) : null}
                </label>
                <NumberField value={qty} onChange={setQty} step={1} min={1} max={setup.maxContracts || undefined} ariaLabel="Quantity" />
                {/* Short on purpose -- the owner: "I don't want the text on the
                    ticket itself too long". One sentence for what this IS, since
                    it is filed under covered calls and behaves like a spread; the
                    arithmetic is in the preview beside it. */}
                {setup.coveredBy === "long_call" && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    A spread, not a covered call: if this is assigned you&rsquo;ll be short 100 {setup.ticker} shares,
                    not delivering shares you own. Your broker must allow spreads (options level 3 on Alpaca).
                  </p>
                )}
              </div>
            )}

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
              liveQuote={isDebit ? live.debitQuote : live.quote}
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
                  The ticket is kept in that account&rsquo;s Orders tab. Your broker never sees it, it holds no
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
                  ? `Save for later — ${shortSize}, not sent`
                  : orderType === "limit" && !creditReady
                    ? "Set a credit first"
                    : `Submit — open ${shortSize} (${priceMode === "market" ? "market" : priceMode === "walk" ? "walk" : "limit"}) on ${account?.name || "…"}`
              }
              summary={
                savePrivate
                  ? `Saved, not sent · ${sizeText} on ${account?.name || "…"}. Nothing reaches your broker.`
                  : summary
              }
              warnings={<PreTradeRisk setup={setup} accountId={accountId} qty={qty} />}
              onConfirm={submit}
              disabled={!accountId || saveBusy || (!savePrivate && orderType === "limit" && !creditReady)}
            />
          </>
        )}

        {phase === "working" && resting && (
          <OrderSent
            price={restingAt ?? limitCredit}
            priced={priced}
            size={sizeText}
            accountName={account?.name}
            timeInForce={timeInForce}
            log={log}
            phase={phase}
            onDone={leave}
            quote={live.quote}
            onUpdate={replacePrice}
          />
        )}

        {phase !== "idle" && !(phase === "working" && resting) && (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {phase === "warned" && (
              <OrderWarnings warnings={warnings} onSend={sendAnyway} onBack={reset} />
            )}
            {phase === "failed" && upgrade && <UpgradePrompt message={upgrade} />}
            {phase === "working" ? (
              // Only a walk still conceding reaches here: stopping it cancels.
              <button onClick={stop} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
                Stop &amp; cancel order
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
              // OrderWarnings carries its own two buttons; a third saying
              // "Done" under them would be a third answer to a two-way choice.
              null
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
