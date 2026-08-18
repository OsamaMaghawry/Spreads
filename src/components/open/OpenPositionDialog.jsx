import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search } from "lucide-react";
import StrategyPicker from "./StrategyPicker";
import SetupPreview from "./SetupPreview";

const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const label = "text-xs text-slate-500 block mb-1.5";

export default function OpenPositionDialog({ account, onClose, onDone }) {
  const [strategy, setStrategy] = useState("iron_condor");
  const [ticker, setTicker] = useState("SPY");
  const [dte, setDte] = useState(2);
  const [targetDelta, setTargetDelta] = useState(0.18);
  const [wingWidth, setWingWidth] = useState(1);
  const [putRatio, setPutRatio] = useState(2);
  const [callRatio, setCallRatio] = useState(1);
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState("limit");

  const [scanning, setScanning] = useState(false);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const isCondor = strategy === "iron_condor";

  const scan = async () => {
    setScanning(true);
    setError(null);
    setSetup(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("findEntry", {
        accountId: account.id,
        ticker,
        strategy,
        dte: Number(dte),
        targetDelta: Number(targetDelta),
        wingWidth: Number(wingWidth),
        putRatio: isCondor ? Number(putRatio) : 1,
        callRatio: isCondor ? Number(callRatio) : 1,
        minCredit: 0,
        maxCredit: 1000
      });
      const data = res.data || {};
      if (data.error) setError(data.error);
      else if (!data.ok) setError(data.reason || "No setup found.");
      else setSetup(data.setup);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("openPosition", {
        accountId: account.id,
        legs: setup.legs.map((l) => ({ symbol: l.symbol, ratio: l.ratio, side: l.side })),
        qty: Number(qty),
        orderType,
        limitPrice: setup.credit
      });
      if (res.data?.error) setError(res.data.error);
      else setResult(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && (result ? onDone() : onClose())}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Open a position — {account.name}</DialogTitle>
        </DialogHeader>

        <StrategyPicker value={strategy} onChange={(v) => { setStrategy(v); setSetup(null); setResult(null); }} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Ticker</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className={input} />
          </div>
          <div>
            <label className={label}>Max days to expiry</label>
            <input type="number" min={0} value={dte} onChange={(e) => setDte(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Target short delta</label>
            <input type="number" step="0.01" min={0.01} max={0.5} value={targetDelta}
              onChange={(e) => setTargetDelta(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Wing width ($)</label>
            <input type="number" step="0.5" min={0.5} value={wingWidth}
              onChange={(e) => setWingWidth(e.target.value)} className={input} />
          </div>
          {isCondor && (
            <>
              <div>
                <label className={label}>Put ratio</label>
                <input type="number" min={1} value={putRatio} onChange={(e) => setPutRatio(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Call ratio</label>
                <input type="number" min={1} value={callRatio} onChange={(e) => setCallRatio(e.target.value)} className={input} />
              </div>
            </>
          )}
        </div>

        <button
          onClick={scan}
          disabled={scanning || !ticker}
          className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {scanning ? "Scanning chain…" : "Find setup"}
        </button>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{error}</div>
        )}

        {setup && !result && (
          <>
            <SetupPreview setup={setup} qty={Number(qty) || 1} />

            <div className="flex gap-3">
              <div className="flex-1">
                <label className={label}>Quantity</label>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={input} />
              </div>
              <div className="flex-1">
                <label className={label}>Order type</label>
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

            <p className="text-xs text-slate-500 leading-relaxed">
              {orderType === "limit"
                ? `Limit order at the quoted net credit of $${setup.credit.toFixed(2)}, good for the day.`
                : "Market order executes immediately — the credit received may be lower than quoted."}
            </p>

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit — open {qty} {isCondor ? "condor" : "spread"}{Number(qty) > 1 ? "s" : ""} ({orderType})
            </button>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
              Order submitted — status <span className="font-medium">{result.status}</span>.
            </div>
            <button onClick={onDone} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
              Done — refresh positions
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}