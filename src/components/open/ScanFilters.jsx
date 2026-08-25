import NumberField from "@/components/common/NumberField";

const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const label = "text-xs text-slate-500 block mb-1.5";

// Step per unit — see the same table in screener/ScreenerConfig.jsx. Days used
// to step by 0.5 here, which is not a thing a day can do.
const STEP = { dte: 1, delta: 0.01, width: 0.5, credit: 0.05, risk: 50, ratio: 1 };

function Range({ title, note, min, max, step, onChange, hasStep = true, fieldStep }) {
  return (
    <div>
      <label className={label}>{title} <span className="text-slate-400">{note}</span></label>
      <div className={`grid ${hasStep ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        <NumberField value={min} onChange={(v) => onChange({ min: v })} step={fieldStep} min={0} placeholder="min" ariaLabel={`${title} minimum`} />
        <NumberField value={max} onChange={(v) => onChange({ max: v })} step={fieldStep} min={0} placeholder="max" ariaLabel={`${title} maximum`} />
        {hasStep && (
          <NumberField value={step} onChange={(v) => onChange({ step: v })} step={fieldStep} min={fieldStep} placeholder="step" ariaLabel={`${title} step`} />
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

      <Range title="Days to expiry" note="min / max" hasStep={false} fieldStep={STEP.dte}
        min={cfg.dteMin} max={cfg.dteMax}
        onChange={(v) => set({ dteMin: v.min ?? cfg.dteMin, dteMax: v.max ?? cfg.dteMax })} />

      <Range title="Short delta" note="min / max / step" fieldStep={STEP.delta}
        min={cfg.deltaMin} max={cfg.deltaMax} step={cfg.deltaStep}
        onChange={(v) => set({ deltaMin: v.min ?? cfg.deltaMin, deltaMax: v.max ?? cfg.deltaMax, deltaStep: v.step ?? cfg.deltaStep })} />

      <Range title="Wing width ($)" note="min / max / step" fieldStep={STEP.width}
        min={cfg.widthMin} max={cfg.widthMax} step={cfg.widthStep}
        onChange={(v) => set({ widthMin: v.min ?? cfg.widthMin, widthMax: v.max ?? cfg.widthMax, widthStep: v.step ?? cfg.widthStep })} />
      <p className="text-[11px] text-slate-400 -mt-1.5 leading-relaxed">
        Only spreads whose strikes are exactly this far apart are returned — a chain with no
        strike at that distance is skipped rather than widened.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Min credit</label>
          <NumberField value={cfg.minCredit} onChange={(v) => set({ minCredit: v })} step={STEP.credit} min={0} ariaLabel="Minimum credit" />
        </div>
        <div>
          <label className={label}>Max risk / unit ($, optional)</label>
          <NumberField value={cfg.maxRisk} onChange={(v) => set({ maxRisk: v })} step={STEP.risk} min={0} placeholder="any" ariaLabel="Maximum risk per unit" />
        </div>
        {isCondor && (
          <>
            <div>
              <label className={label}>Put ratio</label>
              <NumberField value={cfg.putRatio} onChange={(v) => set({ putRatio: v })} step={STEP.ratio} min={1} ariaLabel="Put ratio" />
            </div>
            <div>
              <label className={label}>Call ratio</label>
              <NumberField value={cfg.callRatio} onChange={(v) => set({ callRatio: v })} step={STEP.ratio} min={1} ariaLabel="Call ratio" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
