import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, BellRing, StopCircle } from "lucide-react";
import StrategyPicker from "./StrategyPicker";
import ScanFilters from "./ScanFilters";
import CandidateList from "./CandidateList";
import SetupPreview from "./SetupPreview";
import useScanLoop from "./useScanLoop";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";

const DEFAULTS = {
  tickers: "SPY, QQQ",
  dteMin: 0,
  dteMax: 3,
  deltaMin: 0.12,
  deltaMax: 0.22,
  deltaStep: 0.02,
  widthMin: 1,
  widthMax: 3,
  widthStep: 1,
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
  const [orderType, setOrderType] = useState("limit");

  const { running, attempts, nextIn, candidates, skipped, error: scanError, start, stop, setCandidates } = useScanLoop();
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const isCondor = strategy === "iron_condor";
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const scan = () => {
    setError(null);
    setSetup(null);
    setResult(null);
    start(
      {
        accountId: account.id,
        strategy,
        tickers: cfg.tickers.split(",").map((t) => t.trim()).filter(Boolean),
        dteMin: Number(cfg.dteMin),
        dteMax: Number(cfg.dteMax),
        deltaMin: Number(cfg.deltaMin),
        deltaMax: Number(cfg.deltaMax),
        deltaStep: Number(cfg.deltaStep),
        widthMin: Number(cfg.widthMin),
        widthMax: Number(cfg.widthMax),
        widthStep: Number(cfg.widthStep),
        minCredit: Number(cfg.minCredit),
        maxCredit: 1000,
        maxRisk: cfg.maxRisk === "" ? null : Number(cfg.maxRisk),
        putRatio: isCondor ? Number(cfg.putRatio) : 1,
        callRatio: isCondor ? Number(cfg.callRatio) : 1
      },
      (found) => setSetup(found[0])
    );
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
      setError(e.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const label = "text-xs text-slate-500 block mb-1.5";
  const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <Dialog open onOpenChange={(o) => !o && (result ? onDone() : onClose())}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Open a position — {account.name}</DialogTitle>
        </DialogHeader>

        <StrategyPicker
          value={strategy}
          onChange={(v) => { setStrategy(v); setCandidates(null); setSetup(null); setResult(null); }}
        />

        <ScanFilters cfg={cfg} set={set} isCondor={isCondor} />

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

        {candidates?.length > 0 && !result && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-sm text-emerald-700 font-medium">
            <BellRing className="w-4 h-4" /> {candidates.length} setups found — scan stopped.
          </div>
        )}

        {(error || scanError) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{error || scanError}</div>
        )}

        {skipped.length > 0 && !result && (
          <div className="text-[11px] text-slate-500 leading-relaxed">
            Skipped: {skipped.map((s) => `${s.ticker} (${s.reason})`).join(" · ")}
          </div>
        )}

        {candidates?.length > 0 && !result && (
          <CandidateList candidates={candidates} selected={setup ? legKey(setup) : null} onSelect={setSetup} />
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

            <ConfirmSubmit
              label={`Submit — open ${qty} ${isCondor ? "condor" : "spread"}${Number(qty) > 1 ? "s" : ""} (${orderType}) on ${setup.ticker}`}
              summary={`${orderType === "limit" ? "Limit" : "Market"} order · open ${qty} ${setup.ticker} ${isCondor ? "condor" : "spread"}${Number(qty) > 1 ? "s" : ""} for $${setup.credit.toFixed(2)} credit each on ${account.name}.`}
              onConfirm={submit}
              submitting={submitting}
            />
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