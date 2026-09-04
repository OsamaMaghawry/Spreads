import { useState, useEffect } from "react";
import { invokeFunction } from "@/lib/functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";
import useCloseOrder, { getLastDebit } from "./useCloseOrder";
import OrderLog from "./OrderLog";
import OpenOrdersPanel from "./OpenOrdersPanel";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import LegPicker from "./LegPicker";
import { spreadLegs, legLabel } from "@/lib/spreadLegs";
import LegsQuoteSummary from "./LegsQuoteSummary";
import PriceControl from "@/components/common/PriceControl";
import NumberField from "@/components/common/NumberField";
import useMarketStream from "@/lib/useMarketStream";
import { kindOf } from "@/lib/positionKind";
import RestingOrder from "@/components/open/RestingOrder";

// The spread's own bid/ask, re-read as fast as the broker will answer.
//
// Alpaca's option feed is a separate entitlement, so this cannot ride the
// underlying's websocket -- but a close is priced against the market as it is
// now, and a quote from when the dialog opened is what left an AMD ticket
// chasing a price that had already moved. Requests never stack: the next one is
// scheduled from when the last one finished, so a slow endpoint slows the loop
// instead of flooding it.
const QUOTE_REFRESH_MS = 1000;

export default function CloseDialog({ account, spread, onClose, onDone }) {
  // Held as typed, clamped where it is used. Clamping inside onChange meant a
  // half-typed number was rewritten under the cursor.
  const [qtyInput, setQtyInput] = useState("1");
  // Walk stays the default because it fills more often than a price left to
  // rest. "manual" and "market" are the two ways to override it.
  const [priceMode, setPriceMode] = useState(spread.shares ? "manual" : "walk");
  const [manualPrice, setManualPrice] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [mode, setMode] = useState("whole"); // whole | legs
  const [selected, setSelected] = useState([]);
  const [openOrders, setOpenOrders] = useState(spread.openOrders || []);
  const { phase, log, resting, run, stop, reset, replacePrice } = useCloseOrder();

  // The clamp the input no longer does: never below one, never more than the
  // position holds, and a half-typed field reads as one rather than NaN.
  const qty = Math.max(1, Math.min(spread.qty, parseInt(qtyInput, 10) || 1));

  const allLegs = spreadLegs(spread);
  const pickedLegs = allLegs.filter((l) => selected.includes(l.symbol));
  const customLegs = mode === "legs" && pickedLegs.length > 0 ? pickedLegs : null;
  const legSig = customLegs ? customLegs.map((l) => l.symbol).join(",") : "";

  useEffect(() => {
    setQtyInput(String(spread.qty));
    setOpenOrders(spread.openOrders || []);
    setMode(spread.presetLegSymbol ? "legs" : "whole");
    setSelected(spread.presetLegSymbol ? [spread.presetLegSymbol] : []);
  }, [spread]);

  useEffect(() => {
    if (mode === "legs" && !customLegs) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }
    // Guard the mount race: a whole-structure fetch in flight must not overwrite
    // the per-leg quote once the dialog switches into legs mode.
    let active = true;
    setQuote(null);
    setQuoteLoading(true);
    // A single position is quoted by its one leg. The paired shape would send a
    // null longSymbol and come back with no quote at all, so the ticket would
    // show "market may be closed" on a perfectly quotable contract.
    // assetClass rides along so a share lot is quoted on the stocks endpoint.
    // Without it the plain ticker went to the options endpoint, came back with
    // nothing, and the ticket fell through to the invented $0.30 below.
    const wire = (l) => ({
      symbol: l.symbol,
      ratio: l.ratio,
      action: l.action,
      ...(l.assetClass ? { assetClass: l.assetClass } : {})
    });
    const wholeLegs = spread.single ? spreadLegs(spread).map(wire) : null;
    const body = {
      accountId: account.id,
      ...(customLegs
        ? { legs: customLegs.map(wire) }
        : wholeLegs
          ? { legs: wholeLegs }
          : {
              shortSymbol: spread.shortSymbol,
              longSymbol: spread.longSymbol,
              callShortSymbol: spread.callShortSymbol,
              callLongSymbol: spread.callLongSymbol,
              putRatio: spread.putRatio || 1,
              callRatio: spread.callRatio || 1
            })
    };
    const fetchQuote = () =>
      invokeFunction("spreadQuote", body)
        .then((res) => active && setQuote(res.data?.error ? null : res.data))
        .catch(() => active && setQuote(null))
        .finally(() => active && setQuoteLoading(false));

    let timer = null;
    const loop = () => {
      if (!active) return;
      fetchQuote().finally(() => {
        if (active) timer = setTimeout(loop, QUOTE_REFRESH_MS);
      });
    };
    loop();
    return () => { active = false; clearTimeout(timer); };
  }, [account.id, spread, mode, legSig]);

  // The underlying, streaming for as long as the ticket is open. A close is
  // priced against the market as it is now, not as it was when the dialog
  // opened — and on a wide market that difference is the whole decision.
  const { prices: streamPrices } = useMarketStream(account.id, spread.ticker ? [spread.ticker] : []);
  const liveSpot = streamPrices[spread.ticker]?.price || 0;

  const midDebit = quote?.midDebit ?? 0;
  // The shared control speaks bid/ask/mid/last; spreadQuote speaks in debits.
  // Mapped here rather than teaching the control about spreads, so the open
  // ticket can use the same component with a credit.
  // Selling shares is quoted as a negative debit — money received — but a share
  // price on screen and on an equity order is a positive number of dollars.
  // Negating also swaps the two sides: the ask-debit is built from the bid.
  const priceQuote = quote
    ? spread.shares
      ? {
          bid: Math.abs(quote.askDebit),
          ask: Math.abs(quote.bidDebit),
          mid: Math.abs(quote.midDebit),
          last: quote.lastAttemptDebit === null || quote.lastAttemptDebit === undefined
            ? null
            : Math.abs(quote.lastAttemptDebit)
        }
      : { bid: quote.bidDebit, ask: quote.askDebit, mid: quote.midDebit, last: quote.lastAttemptDebit }
    : null;
  // The P/L rows follow the price being chosen, not the mid. The whole point
  // of "Set my price" is to see what THIS number yields, and a box above it
  // frozen at the mid contradicts it. Manual with a price -> that price;
  // anything else -> the mid, as before.
  const manualReadyForPl = priceMode === "manual" && typeof manualPrice === "number" && manualPrice > 0;
  const plDebit = manualReadyForPl ? manualPrice : midDebit;
  const plAt = manualReadyForPl ? `at ${fmtMoney(manualPrice)}` : "(mid)";
  // Shares are not contracts: one unit is one share, so the 100x option
  // multiplier does not apply, and the result of selling them is measured
  // against the basis rather than against a credit that was never received.
  // Using the option arithmetic here would have overstated a share close by
  // exactly 100x on a real position.
  const isShares = !!spread.shares;
  const multiplier = isShares ? 1 : 100;
  const plPerContract = isShares
    ? (Math.abs(plDebit) - (spread.shareBasis ?? spread.longEntryPrice ?? 0)) * multiplier
    : (spread.netCredit - plDebit) * multiplier;
  const unit = isShares ? "share" : spread.type === "iron_condor" ? "condor" : "contract";
  // Resume from the highest price already attempted — either this session's memory
  // or the last limit price Alpaca has on record for this spread.
  const attempts = [getLastDebit(account.id, spread, customLegs), quote?.lastAttemptDebit].filter(
    (v) => typeof v === "number" && isFinite(v)
  );
  const lastDebit = attempts.length ? Math.max(...attempts) : null;
  // $0.30 is a plausible opening bid to close a cheap contract and a nonsense
  // price for a share, so the fallback is options-only. Shares price manually
  // and refuse to submit without a real number rather than invent one.
  const baseDebit = quote ? midDebit : isShares ? null : 0.3;
  const walkStart = lastDebit !== null ? Math.max(lastDebit, baseDebit) : baseDebit;
  const orderType = priceMode === "market" ? "market" : "limit";
  // What actually gets sent. Manual uses the number in the stepper; the walk
  // uses its own resume-aware starting point.
  // In manual mode the price is the user's instruction and nothing else may
  // stand in for it. Falling back to walkStart here would arm the submit button
  // at an invented $0.30 whenever no quote had arrived to seed the stepper.
  const startDebit = priceMode === "manual" ? manualPrice : walkStart;
  const manualReady = typeof manualPrice === "number" && manualPrice > 0;

  // Seed the stepper from the mid once a quote lands, and only then: opening it
  // at a stale or invented number is how someone ends up resting an order at a
  // price that was never marketable. Untouched-only, so a live requote never
  // overwrites a price the user has already set.
  useEffect(() => {
    if (manualPrice !== null || !quote) return;
    // A share sale quotes as a negative debit, so the options guard (> 0) never
    // fired and the stepper stayed empty on every share position.
    const seed = spread.shares ? Math.abs(midDebit) : midDebit;
    if (seed > 0) setManualPrice(Math.round(seed * 100) / 100);
  }, [quote, midDebit, manualPrice, spread.shares]);

  // A different position, or a different set of legs, is a different price.
  useEffect(() => { setManualPrice(null); }, [spread, legSig]);

  // What the X and a click outside do depends on where the order is:
  //   walking  -- nothing. Dismissing would leave it repricing at the broker
  //               with nothing watching it.
  //   resting  -- leave, in ONE action. The order keeps working.
  //   filled / detached -- leave and refresh the positions behind.
  //
  // Resting used to take two clicks that read almost identically: "Stop
  // watching — the order keeps working" put the ticket into `detached`, which
  // then offered "Close — the order keeps working". Two buttons, nearly the
  // same sentence, for what is one decision — leave it alone. Stopping the
  // watcher and closing the ticket now happen together.
  const handleClose = () => {
    if (phase === "working" && !resting) return;
    if (resting) stop();
    reset();
    if (phase === "filled" || phase === "detached" || resting) onDone();
    else onClose();
  };

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            {spread.single
              ? `Close ${spread.qty} ${spread.ticker} ${kindOf(spread)?.label || "position"}${spread.legs?.[0] ? ` $${spread.legs[0].strike}${spread.legs[0].kind === "call" ? "C" : "P"}` : ""}`
              : spread.type === "iron_condor"
              ? `Close ${spread.ticker} ${spread.putRatio > 1 ? `${spread.putRatio}× ` : ""}${spread.longStrike}/${spread.shortStrike}P · ${spread.callRatio > 1 ? `${spread.callRatio}× ` : ""}${spread.callShortStrike}/${spread.callLongStrike}C iron condor`
              : spread.type === "call_spread"
                ? `Close ${spread.ticker} ${spread.shortStrike}/${spread.longStrike} call spread`
                : `Close ${spread.ticker} ${spread.shortStrike}/${spread.longStrike} put spread`}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-500 -mt-2 flex items-center gap-2 flex-wrap">
          <span>
            {account.name}
            {/* Shares have no expiry and are not contracts; the options subtitle
                read "Expiry undefined · 1000 open contracts" on a share lot. */}
            {isShares
              ? ` · ${spread.qty} share${spread.qty > 1 ? "s" : ""} held`
              : ` · Expiry ${spread.expiryFormatted} · ${spread.qty} open ${spread.type === "iron_condor" ? (spread.qty > 1 ? "condors" : "condor") : `contract${spread.qty > 1 ? "s" : ""}`}`}
          </span>
          {liveSpot > 0 && (
            <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {spread.ticker} {fmtMoney(liveSpot)}
            </span>
          )}
        </div>

        {phase === "idle" ? (
          <div className="space-y-4">
            {openOrders.length > 0 && (
              <OpenOrdersPanel accountId={account.id} orders={openOrders} onChange={setOpenOrders} />
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">What to close</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                {[["whole", "Whole position"], ["legs", "Individual legs"]].map(([m, l]) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-sm transition-colors ${mode === m ? "bg-emerald-100 text-emerald-700 font-medium" : "bg-white text-slate-500 hover:text-slate-900"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {mode === "legs" && (
              <LegPicker
                legs={allLegs}
                selected={selected}
                units={qty}
                onToggle={(sym) =>
                  setSelected((s) => (s.includes(sym) ? s.filter((x) => x !== sym) : [...s, sym]))
                }
              />
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
              {mode === "legs" && !customLegs ? (
                <span className="text-slate-500">Pick at least one leg to close.</span>
              ) : quoteLoading ? (
                <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Fetching live quote…</div>
              ) : quote && customLegs ? (
                <LegsQuoteSummary quote={quote} qty={qty} multiplier={multiplier} />
              ) : quote ? (
                <div className="grid grid-cols-2 gap-y-1.5 tabular-nums">
                  <span className="text-slate-500">Entry credit / {unit}</span><span className="text-right">{fmtMoney(spread.netCredit)}</span>
                  <span className="text-slate-500">Mid debit to close</span><span className="text-right">{fmtMoney(midDebit)}</span>
                  <span className="text-slate-500">Bid / Ask debit</span><span className="text-right">{fmtMoney(quote.bidDebit)} / {fmtMoney(quote.askDebit)}</span>
                  <span className="text-slate-500">P/L per {unit} {plAt}</span>
                  <span className={`text-right font-medium ${plPerContract >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(plPerContract)}</span>
                  <span className="text-slate-500">Total P/L for {qty} {unit}{qty > 1 ? "s" : ""} {plAt}</span>
                  <span className={`text-right font-semibold ${plPerContract >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(plPerContract * qty)}</span>
                </div>
              ) : (
                <span className="text-amber-600">Live quote unavailable — market may be closed.</span>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1.5">
                {mode === "legs" ? "Units to close" : "Quantity"} (max {spread.qty})
              </label>
              <NumberField value={qtyInput} onChange={setQtyInput} step={1} min={1} max={spread.qty}
                ariaLabel={mode === "legs" ? "Units to close" : "Quantity"} />
            </div>

            {/* Its own full-width row: this is the decision that sets what the
                broker is told, not a size-of-a-dropdown afterthought beside the
                quantity. Walk stays first and stays the default because it
                fills more often than a price left to rest. */}
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">How to price it</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                {[
                  // The walk concedes by paying more to close a short option.
                  // Selling shares concedes in the opposite direction, so
                  // offering the same walk here would move the price the wrong
                  // way on every step. Shares get a price you set, or the
                  // market, until the walk learns which way it is going.
                  ...(isShares ? [] : [{ id: "walk", label: "Walk to fill" }]),
                  { id: "manual", label: "Set my price" },
                  { id: "market", label: "Market" }
                ].map((t) => (
                  <button key={t.id} onClick={() => setPriceMode(t.id)}
                    className={`flex-1 py-2 text-sm transition-colors ${priceMode === t.id ? "bg-emerald-100 text-emerald-700 font-medium" : "bg-white text-slate-500 hover:text-slate-900"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {priceMode === "manual" && (
              <PriceControl
                price={manualPrice}
                onChange={setManualPrice}
                quote={priceQuote}
                unit={unit}
                qty={qty}
                multiplier={multiplier}
                side="debit"
                id="close-limit-debit"
              />
            )}

            {customLegs && (
              <p className="text-xs text-slate-600 leading-relaxed">
                Closes{" "}
                {customLegs
                  .map((l) =>
                    // legLabel already reads "1000 shares" for an equity leg, so
                    // prefixing a contract count would say it twice and wrongly.
                    l.assetClass === "equity"
                      ? legLabel(l)
                      : `${qty * (l.ratio || 1)} contract${qty * (l.ratio || 1) > 1 ? "s" : ""} of ${legLabel(l)}`
                  )
                  .join(", ")}
                .
              </p>
            )}

            <p className="text-xs text-slate-500 leading-relaxed">
              {priceMode === "manual"
                ? null
                : orderType === "limit"
                ? lastDebit !== null
                  ? `Limit resumes from your last attempt at ${fmtMoney(lastDebit)} — starting at ${fmtMoney(startDebit)} and stepping toward the ask every 30s until it fills. Never bids above the ask + $0.05. Stops after 10 min.`
                  : midDebit < 0
                    ? `Limit starts at the mid credit (${fmtMoney(Math.abs(midDebit))}) and concedes $0.02 every 30s (max 10 steps, 10 min timeout).`
                    : `Limit starts at the mid debit (${fmtMoney(midDebit)}) and steps toward the ask every 30s until it fills — bigger steps on a wider market. Never bids above the ask + $0.05. Stops after 10 min.`
                : "Market executes immediately at the current best price — may slip toward the ask."}
            </p>

            <ConfirmSubmit
              tone="rose"
              label={
                openOrders.length > 0
                  ? "Cancel the open order first"
                  : customLegs
                    ? `Close ${customLegs.length} selected leg${customLegs.length > 1 ? "s" : ""} (${orderType})`
                    : mode === "legs"
                      ? "Select legs to close"
                      : priceMode === "manual"
                      ? manualReady
                        ? `Close ${qty} ${unit}${qty > 1 ? "s" : ""} at ${fmtMoney(startDebit)}`
                        : "Set a price first"
                      : `Close ${qty} ${unit}${qty > 1 ? "s" : ""} (${priceMode === "market" ? "market" : "walk"})`
              }
              summary={`${
                priceMode === "market"
                  ? "Market order at the current best price"
                  : priceMode === "manual"
                    ? `Limit order resting at ${manualReady ? fmtMoney(startDebit) : "—"} — not walked`
                    : `Limit order starting at ${fmtMoney(startDebit)}, walked toward the ask`
              } · close ${
                customLegs ? `${customLegs.length} leg${customLegs.length > 1 ? "s" : ""} of` : ""
              } ${qty} ${spread.ticker} ${unit}${qty > 1 ? "s" : ""} on ${account.name}.`}
              onConfirm={() =>
                run({ accountId: account.id, spread, qty, orderType, startDebit, legs: customLegs, priceMode })
              }
              disabled={
                openOrders.length > 0 ||
                (mode === "legs" && !customLegs) ||
                (priceMode === "manual" && !manualReady)
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {/* Repricing in place is offered only where the broker actually
                supports it. Alpaca refuses to replace an equity order once it
                reaches `accepted` — "cannot replace order in accepted status",
                code 42210000 — which is the state a share order is in almost
                immediately, so the button was guaranteed to fail on shares. It
                is not shown there; the honest instruction is below instead. */}
            {phase === "working" && resting && !isShares && (
              <RestingOrder
                credit={manualPrice}
                onCredit={setManualPrice}
                quote={priceQuote}
                unit={unit}
                qty={qty}
                multiplier={multiplier}
                side="debit"
                onUpdate={replacePrice}
              />
            )}
            {phase === "working" && resting && isShares && (
              <p className="text-xs text-slate-600 leading-relaxed border border-slate-200 rounded-lg p-3">
                Your order is working at the broker and stays there until it fills or you
                cancel it. A share order cannot be repriced once the broker has accepted
                it — to trade at a different price, cancel this one from the{" "}
                <span className="font-medium">Orders</span> tab and place another.
              </p>
            )}
            {phase === "working" ? (
              <button
                onClick={resting ? handleClose : stop}
                className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors"
              >
                {resting ? "Done — the order keeps working" : "Stop & cancel order"}
              </button>
            ) : phase === "detached" ? (
              // Never "Try again" here: the order is live at the broker, and a
              // second one would close the position twice.
              <button onClick={handleClose} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                Close — the order keeps working
              </button>
            ) : phase === "failed" ? (
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
                  Try again
                </button>
                <button onClick={handleClose} className="flex-1 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <button onClick={handleClose} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
                Done — refresh positions
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}