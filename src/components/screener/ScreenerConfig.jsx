const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const label = "text-xs text-slate-500 block mb-1.5";

export const SCREENER_DEFAULTS = {
  universe: "top50",
  customTickers: "",
  dteMin: 0,
  dteMax: 5,
  deltaMin: 0.12,
  deltaMax: 0.22,
  deltaStep: 0.02,
  widthMin: 1,
  widthMax: 3,
  widthStep: 1,
  minCredit: 0.2,
  maxRisk: "",
  minRoR: 15,
  putRatio: 1,
  callRatio: 1
};

function Range({ title, note, min, max, step, onChange, hasStep = true }) {
  return (
    <div>
      <label className={label}>{title} <span className="text-slate-400">{note}</span></label>
      <div className={`grid ${hasStep ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        <input type="number" step="0.01" value={min} onChange={(e) => onChange({ min: e.target.value })} className={input} placeholder="min" />
        <input type="number" step="0.01" value={max} onChange={(e) => onChange({ max: e.target.value })} className={input} placeholder="max" />
        {hasStep && (
          <input type="number" step="0.01" value={step} onChange={(e) => onChange({ step: e.target.value })} className={input} placeholder="step" />
        )}
      </div>
    </div>
  );
}

export default function ScreenerConfig({ cfg, set, isCondor }) {
  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Universe</label>
        <select value={cfg.universe} onChange={(e) => set({ universe: e.target.value })} className={input}>
          <option value="top50">Top 50 most liquid (fast)</option>
          <option value="sp500">Full S&amp;P 500 (slow)</option>
          <option value="custom">Custom ticker list</option>
        </select>
      </div>

      {cfg.universe === "custom" && (
        <div>
          <label className={label}>Tickers <span className="text-slate-400">comma separated</span></label>
          <input value={cfg.customTickers} onChange={(e) => set({ customTickers: e.target.value.toUpperCase() })}
            className={input} placeholder="WMT, TGT, COST" />
        </div>
      )}

      <Range title="Days to expiry" note="min / max" hasStep={false}
        min={cfg.dteMin} max={cfg.dteMax}
        onChange={(v) => set({ dteMin: v.min ?? cfg.dteMin, dteMax: v.max ?? cfg.dteMax })} />

      <Range title="Short delta" note="min / max / step"
        min={cfg.deltaMin} max={cfg.deltaMax} step={cfg.deltaStep}
        onChange={(v) => set({ deltaMin: v.min ?? cfg.deltaMin, deltaMax: v.max ?? cfg.deltaMax, deltaStep: v.step ?? cfg.deltaStep })} />

      <Range title="Wing width ($)" note="min / max / step"
        min={cfg.widthMin} max={cfg.widthMax} step={cfg.widthStep}
        onChange={(v) => set({ widthMin: v.min ?? cfg.widthMin, widthMax: v.max ?? cfg.widthMax, widthStep: v.step ?? cfg.widthStep })} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Min credit ($)</label>
          <input type="number" step="0.05" value={cfg.minCredit} onChange={(e) => set({ minCredit: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>Max risk / unit ($)</label>
          <input type="number" step="50" value={cfg.maxRisk} onChange={(e) => set({ maxRisk: e.target.value })} className={input} placeholder="any" />
        </div>
        <div>
          <label className={label}>Min return on risk (%)</label>
          <input type="number" step="1" value={cfg.minRoR} onChange={(e) => set({ minRoR: e.target.value })} className={input} />
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