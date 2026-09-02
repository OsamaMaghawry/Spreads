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
import useMarketStream from "@/lib/useMarketStream";
import { kindOf } from "@/lib/positionKind";

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
  const [qty, setQty] = useState(1);
  // Walk stays the default because it fills more often than a price left to
  // rest. "manual" and "market" are the two ways to override it.
  const [priceMode, setPriceMode] = useState("walk");
  const [manualPrice, setManualPrice] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [mode, setMode] = useState("whole"); // whole | legs
  const [selected, setSelected] = useState([]);
  const [openOrders, setOpenOrders] = useState(spread.openOrders || []);
  const { phase, log, run, stop, reset } = useCloseOrder();

  const allLegs = spreadLegs(spread);
  const pickedLegs = allLegs.filter((l) => selected.includes(l.symbol));
  const customLegs = mode === "legs" && pickedLegs.length > 0 ? pickedLegs : null;
  const legSig = customLegs ? customLegs.map((l) => l.symbol).join(",") : "";

  useEffect(() => {
    setQty(spread.qty);
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
    const wholeLegs = spread.single
      ? spreadLegs(spread).map((l) => ({ symbol: l.symbol, ratio: l.ratio, action: l.action }))
      : null;
    const body = {
      accountId: account.id,
      ...(customLegs
        ? { legs: customLegs.map((l) => ({ symbol: l.symbol, ratio: l.ratio, action: l.action })) }
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
  const priceQuote = quote
    ? { bid: quote.bidDebit, ask: quote.askDebit, mid: quote.midDebit, last: quote.lastAttemptDebit }
    : null;
  // The P/L rows follow the price being chosen, not the mid. The whole point
  // of "Set my price" is to see what THIS number yields, and a box above it
  // frozen at the mid contradicts it. Manual with a price -> that price;
  // anything else -> the mid, as before.
  const manualReadyForPl = priceMode === "manual" && typeof manualPrice === "number" && manualPrice > 0;
  const plDebit = manualReadyForPl ? manualPrice : midDebit;
  const plAt = manualReadyForPl ? `at ${fmtMoney(manualPrice)}` : "(mid)";
  const plPerContract = (spread.netCredit - plDebit) * 100;
  const unit = spread.type === "iron_condor" ? "condor" : "contract";
  // Resume from the highest price already attempted — either this session's memory
  // or the last limit price Alpaca has on record for this spread.
  const attempts = [getLastDebit(account.id, spread, customLegs), quote?.lastAttemptDebit].filter(
    (v) => typeof v === "number" && isFinite(v)
  );
  const lastDebit = attempts.length ? Math.max(...attempts) : null;
  const baseDebit = quote ? midDebit : 0.3;
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
    if (manualPrice === null && quote && midDebit > 0) setManualPrice(Math.round(midDebit * 100) / 100);
  }, [quote, midDebit, manualPrice]);

  // A different position, or a different set of legs, is a different price.
  useEffect(() => { setManualPrice(null); }, [spread, legSig]);

  const handleClose = () => {
    if (phase === "working") return;
    reset();
    if (phase === "filled") onDone();
    else onClose();
  };

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg">
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
            {account.name} · Expiry {spread.expiryFormatted} · {spread.qty} open {spread.type === "iron_condor" ? (spread.qty > 1 ? "condors" : "condor") : `contract${spread.qty > 1 ? "s" : ""}`}
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
                <LegsQuoteSummary quote={quote} qty={qty} />
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
              <input type="number" min={1} max={spread.qty} value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(spread.qty, parseInt(e.target.value) || 1)))}
                className={inputCls} />
            </div>

            {/* Its own full-width row: this is the decision that sets what the
                broker is told, not a size-of-a-dropdown afterthought beside the
                quantity. Walk stays first and stays the default because it
                fills more often than a price left to rest. */}
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">How to price it</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                {[
                  { id: "walk", label: "Walk to fill" },
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
                side="debit"
                id="close-limit-debit"
              />
            )}

            {customLegs && (
              <p className="text-xs text-slate-600 leading-relaxed">
                Closes{" "}
                {customLegs
                  .map((l) => `${qty * (l.ratio || 1)} contract${qty * (l.ratio || 1) > 1 ? "s" : ""} of ${legLabel(l)}`)
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
            {phase === "working" ? (
              <button onClick={stop} className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm transition-colors">
                Stop & cancel order
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