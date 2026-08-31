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

export default function CloseDialog({ account, spread, onClose, onDone }) {
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState("limit");
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
    invokeFunction("spreadQuote", {
      accountId: account.id,
      ...(customLegs
        ? { legs: customLegs.map((l) => ({ symbol: l.symbol, ratio: l.ratio, action: l.action })) }
        : {
            shortSymbol: spread.shortSymbol,
            longSymbol: spread.longSymbol,
            callShortSymbol: spread.callShortSymbol,
            callLongSymbol: spread.callLongSymbol,
            putRatio: spread.putRatio || 1,
            callRatio: spread.callRatio || 1
          })
    })
      .then((res) => active && setQuote(res.data?.error ? null : res.data))
      .catch(() => active && setQuote(null))
      .finally(() => active && setQuoteLoading(false));
    return () => { active = false; };
  }, [account.id, spread, mode, legSig]);

  const midDebit = quote?.midDebit ?? 0;
  const plPerContract = (spread.netCredit - midDebit) * 100;
  const unit = spread.type === "iron_condor" ? "condor" : "contract";
  // Resume from the highest price already attempted — either this session's memory
  // or the last limit price Alpaca has on record for this spread.
  const attempts = [getLastDebit(account.id, spread, customLegs), quote?.lastAttemptDebit].filter(
    (v) => typeof v === "number" && isFinite(v)
  );
  const lastDebit = attempts.length ? Math.max(...attempts) : null;
  const baseDebit = quote ? midDebit : 0.3;
  const startDebit = lastDebit !== null ? Math.max(lastDebit, baseDebit) : baseDebit;

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
            {spread.type === "iron_condor"
              ? `Close ${spread.ticker} ${spread.putRatio > 1 ? `${spread.putRatio}× ` : ""}${spread.longStrike}/${spread.shortStrike}P · ${spread.callRatio > 1 ? `${spread.callRatio}× ` : ""}${spread.callShortStrike}/${spread.callLongStrike}C iron condor`
              : spread.type === "call_spread"
                ? `Close ${spread.ticker} ${spread.shortStrike}/${spread.longStrike} call spread`
                : `Close ${spread.ticker} ${spread.shortStrike}/${spread.longStrike} put spread`}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-500 -mt-2">
          {account.name} · Expiry {spread.expiryFormatted} · {spread.qty} open {spread.type === "iron_condor" ? (spread.qty > 1 ? "condors" : "condor") : `contract${spread.qty > 1 ? "s" : ""}`}
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
                  <span className="text-slate-500">P/L per {unit} (mid)</span>
                  <span className={`text-right font-medium ${plPerContract >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(plPerContract)}</span>
                  <span className="text-slate-500">Total P/L for {qty} {unit}{qty > 1 ? "s" : ""}</span>
                  <span className={`text-right font-semibold ${plPerContract >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(plPerContract * qty)}</span>
                </div>
              ) : (
                <span className="text-amber-600">Live quote unavailable — market may be closed.</span>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1.5">
                  {mode === "legs" ? "Units to close" : "Quantity"} (max {spread.qty})
                </label>
                <input type="number" min={1} max={spread.qty} value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(spread.qty, parseInt(e.target.value) || 1)))}
                  className={inputCls} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1.5">Order type</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-300">
                  {["limit", "market"].map((t) => (
                    <button key={t} onClick={() => setOrderType(t)}
                      className={`flex-1 py-2 text-sm capitalize transition-colors ${orderType === t ? "bg-emerald-100 text-emerald-700 font-medium" : "bg-white text-slate-500 hover:text-slate-900"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
              {orderType === "limit"
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
                      : `Close ${qty} ${unit}${qty > 1 ? "s" : ""} (${orderType})`
              }
              summary={`${orderType === "limit" ? `Limit order starting at ${fmtMoney(startDebit)}` : "Market order at the current best price"} · close ${
                customLegs ? `${customLegs.length} leg${customLegs.length > 1 ? "s" : ""} of` : ""
              } ${qty} ${spread.ticker} ${unit}${qty > 1 ? "s" : ""} on ${account.name}.`}
              onConfirm={() => run({ accountId: account.id, spread, qty, orderType, startDebit, legs: customLegs })}
              disabled={openOrders.length > 0 || (mode === "legs" && !customLegs)}
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