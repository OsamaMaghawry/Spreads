import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SetupPreview from "@/components/open/SetupPreview";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import RiskMeter from "@/components/common/RiskMeter";
import EarningsWarning from "@/components/common/EarningsWarning";

const label = "text-xs text-slate-500 block mb-1.5";
const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

export default function TradeDialog({ setup, accounts, onClose }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState("limit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [equity, setEquity] = useState(null);

  const account = accounts.find((a) => a.id === accountId);
  const unit = setup.strategy === "iron_condor" ? "condor" : "spread";
  const totalRisk = setup.maxRisk * (Number(qty) || 1);

  // Equity is per account, so it is refetched when the target account changes.
  // A failure leaves it null and RiskMeter says so rather than guessing.
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    setEquity(null);
    invokeFunction("accountEquity", { accountId })
      .then((res) => { if (live && !res.data?.error) setEquity(res.data?.equity ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [accountId]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await invokeFunction("openPosition", {
        accountId,
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Trade {setup.ticker} {unit}</DialogTitle>
        </DialogHeader>

        <SetupPreview setup={setup} qty={Number(qty) || 1} />

        {!result && (
          <>
            <EarningsWarning earnings={setup.earnings} ticker={setup.ticker} />
            <RiskMeter risk={totalRisk} equity={equity} />
          </>
        )}

        {!result && (
          <>
            <div>
              <label className={label}>Trade on account</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.is_paper ? "Paper" : "Live"})</option>
                ))}
              </select>
            </div>

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

            {error && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{error}</div>}

            <ConfirmSubmit
              label={`Submit — open ${qty} ${unit}${Number(qty) > 1 ? "s" : ""} (${orderType}) on ${account?.name || "…"}`}
              summary={`${orderType === "limit" ? "Limit" : "Market"} order · open ${qty} ${setup.ticker} ${unit}${Number(qty) > 1 ? "s" : ""} for $${setup.credit.toFixed(2)} credit each on ${account?.name || ""}.`}
              warnings={
                <>
                  <EarningsWarning earnings={setup.earnings} ticker={setup.ticker} />
                  <RiskMeter risk={totalRisk} equity={equity} />
                </>
              }
              onConfirm={submit}
              submitting={submitting}
              disabled={!accountId}
            />
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
              Order submitted on {account?.name} — status <span className="font-medium">{result.status}</span>.
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors">
              Done
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}