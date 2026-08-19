const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const label = "text-xs text-slate-500 block mb-1.5";

function Range({ title, note, min, max, step, onChange, hasStep = true, decimals = 2 }) {
  return (
    <div>
      <label className={label}>{title} <span className="text-slate-400">{note}</span></label>
      <div className={`grid ${hasStep ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        <input type="number" step={decimals === 2 ? "0.01" : "0.5"} value={min}
          onChange={(e) => onChange({ min: e.target.value })} className={input} placeholder="min" />
        <input type="number" step={decimals === 2 ? "0.01" : "0.5"} value={max}
          onChange={(e) => onChange({ max: e.target.value })} className={input} placeholder="max" />
        {hasStep && (
          <input type="number" step={decimals === 2 ? "0.01" : "0.5"} value={step}
            onChange={(e) => onChange({ step: e.target.value })} className={input} placeholder="step" />
        )}
      </div>
    </div>
  );
}

export default function ScanFilters({ cfg, set, isCondor }) {
  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Tickers <span className="text-slate-400">comma separated</span></label>
        <input value={cfg.tickers} onChange={(e) => set({ tickers: e.target.value.toUpperCase() })}
          className={input} placeholder="SPY, QQQ, IWM" />
      </div>

      <Range title="Days to expiry" note="min / max" hasStep={false} decimals={1}
        min={cfg.dteMin} max={cfg.dteMax}
        onChange={(v) => set({ dteMin: v.min ?? cfg.dteMin, dteMax: v.max ?? cfg.dteMax })} />

      <Range title="Short delta" note="min / max / step"
        min={cfg.deltaMin} max={cfg.deltaMax} step={cfg.deltaStep}
        onChange={(v) => set({ deltaMin: v.min ?? cfg.deltaMin, deltaMax: v.max ?? cfg.deltaMax, deltaStep: v.step ?? cfg.deltaStep })} />

      <Range title="Wing width ($)" note="min / max / step" decimals={1}
        min={cfg.widthMin} max={cfg.widthMax} step={cfg.widthStep}
        onChange={(v) => set({ widthMin: v.min ?? cfg.widthMin, widthMax: v.max ?? cfg.widthMax, widthStep: v.step ?? cfg.widthStep })} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Min credit</label>
          <input type="number" step="0.05" value={cfg.minCredit} onChange={(e) => set({ minCredit: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Max risk / unit ($, optional)</label>
          <input type="number" step="50" value={cfg.maxRisk} onChange={(e) => set({ maxRisk: e.target.value })} className={input} placeholder="any" />
        </div>
        {isCondor && (
          <>
            <div>
              <label className={label}>Put ratio</label>
              <input type="number" min={1} value={cfg.putRatio} onChange={(e) => set({ putRatio: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Call ratio</label>
              <input type="number" min={1} value={cfg.callRatio} onChange={(e) => set({ callRatio: e.target.value })} className={input} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}