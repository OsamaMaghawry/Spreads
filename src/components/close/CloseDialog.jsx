import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";
import useCloseOrder, { getLastDebit } from "./useCloseOrder";
import OrderLog from "./OrderLog";
import OpenOrdersPanel from "./OpenOrdersPanel";

export default function CloseDialog({ account, spread, onClose, onDone }) {
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState("limit");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [openOrders, setOpenOrders] = useState(spread.openOrders || []);
  const { phase, log, run, stop, reset } = useCloseOrder();

  useEffect(() => {
    setQty(spread.qty);
    setOpenOrders(spread.openOrders || []);
    setQuote(null);
    setQuoteLoading(true);
    base44.functions
      .invoke("spreadQuote", { accountId: account.id, shortSymbol: spread.shortSymbol, longSymbol: spread.longSymbol })
      .then((res) => setQuote(res.data))
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, [account.id, spread]);

  const midDebit = quote?.midDebit ?? 0;
  const plPerContract = (spread.netCredit - midDebit) * 100;
  const lastDebit = getLastDebit(account.id, spread);
  const startDebit = lastDebit ?? (quote ? midDebit : 0.3);

  const handleClose = () => {
    if (phase === "working") return;
    reset();
    if (phase === "filled") onDone();
    else onClose();
  };

  const inputCls = "w-full bg-[#0A0E16] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50";

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#111725] border-white/10 text-slate-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            Close {spread.ticker} {spread.shortStrike}/{spread.longStrike} put spread
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-500 -mt-2">
          {account.name} · Expiry {spread.expiryFormatted} · {spread.qty} open contracts
        </div>

        {phase === "idle" ? (
          <div className="space-y-4">
            {openOrders.length > 0 && (
              <OpenOrdersPanel accountId={account.id} orders={openOrders} onChange={setOpenOrders} />
            )}
            <div className="bg-[#0A0E16] border border-white/[0.06] rounded-lg p-3 text-sm">
              {quoteLoading ? (
                <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Fetching live quote…</div>
              ) : quote ? (
                <div className="grid grid-cols-2 gap-y-1.5 tabular-nums">
                  <span className="text-slate-500">Entry credit / contract</span><span className="text-right">{fmtMoney(spread.netCredit)}</span>
                  <span className="text-slate-500">Mid debit to close</span><span className="text-right">{fmtMoney(midDebit)}</span>
                  <span className="text-slate-500">Bid / Ask debit</span><span className="text-right">{fmtMoney(quote.bidDebit)} / {fmtMoney(quote.askDebit)}</span>
                  <span className="text-slate-500">P/L per contract (mid)</span>
                  <span className={`text-right font-medium ${plPerContract >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMoney(plPerContract)}</span>
                  <span className="text-slate-500">Total P/L for {qty} contract{qty > 1 ? "s" : ""}</span>
                  <span className={`text-right font-semibold ${plPerContract >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMoney(plPerContract * qty)}</span>
                </div>
              ) : (
                <span className="text-amber-400">Live quote unavailable — market may be closed.</span>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1.5">Quantity (max {spread.qty})</label>
                <input type="number" min={1} max={spread.qty} value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(spread.qty, parseInt(e.target.value) || 1)))}
                  className={inputCls} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1.5">Order type</label>
                <div className="flex rounded-lg overflow-hidden border border-white/10">
                  {["limit", "market"].map((t) => (
                    <button key={t} onClick={() => setOrderType(t)}
                      className={`flex-1 py-2 text-sm capitalize transition-colors ${orderType === t ? "bg-emerald-500/20 text-emerald-300" : "bg-[#0A0E16] text-slate-400 hover:text-white"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {orderType === "limit"
                ? lastDebit !== null
                  ? `Limit resumes from your last attempt at ${fmtMoney(lastDebit)} and walks up $0.02 every 30s (max 10 steps, 10 min timeout).`
                  : `Limit starts at the mid debit (${fmtMoney(midDebit)}) and walks up $0.02 every 30s (max 10 steps, 10 min timeout).`
                : "Market executes immediately at the current best price — may slip toward the ask."}
            </p>

            <button
              onClick={() => run({ accountId: account.id, spread, qty, orderType, startDebit })}
              disabled={openOrders.length > 0}
              className="w-full py-2.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {openOrders.length > 0
                ? "Cancel the open order first"
                : `Confirm — close ${qty} contract${qty > 1 ? "s" : ""} (${orderType})`}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <OrderLog log={log} phase={phase} />
            {phase === "working" ? (
              <button onClick={stop} className="w-full py-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.04] text-sm transition-colors">
                Stop & cancel order
              </button>
            ) : phase === "failed" ? (
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-colors">
                  Try again
                </button>
                <button onClick={handleClose} className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <button onClick={handleClose} className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors">
                Done — refresh positions
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}