import NumberField from "@/components/common/NumberField";

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

// Step per unit, not one step for every field. Days are whole days; deltas are
// hundredths; strike widths move in half-dollars because listed strikes commonly
// sit $0.50, $1, $2.50 or $5 apart. A field whose arrows move it by the wrong
// unit (days by 0.01) is arrows that don't work.
const STEP = { dte: 1, delta: 0.01, width: 0.5, credit: 0.05, risk: 50, ror: 1, ratio: 1 };

function Range({ title, note, min, max, step, onChange, hasStep = true, fieldStep, minFloor = 0 }) {
  return (
    <div>
      <label className={label}>{title} <span className="text-slate-400">{note}</span></label>
      <div className={`grid ${hasStep ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        <NumberField value={min} onChange={(v) => onChange({ min: v })} step={fieldStep} min={minFloor} placeholder="min" ariaLabel={`${title} minimum`} />
        <NumberField value={max} onChange={(v) => onChange({ max: v })} step={fieldStep} min={minFloor} placeholder="max" ariaLabel={`${title} maximum`} />
        {hasStep && (
          <NumberField value={step} onChange={(v) => onChange({ step: v })} step={fieldStep} min={fieldStep} placeholder="step" ariaLabel={`${title} step`} />
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
        Only spreads whose strikes are exactly this far apart are returned. A ticker whose
        chain has no strike at that distance is listed as skipped rather than widened.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Min credit ($)</label>
          <NumberField value={cfg.minCredit} onChange={(v) => set({ minCredit: v })} step={STEP.credit} min={0} ariaLabel="Minimum credit" />
        </div>
        <div>
          <label className={label}>Max risk / unit ($)</label>
          <NumberField value={cfg.maxRisk} onChange={(v) => set({ maxRisk: v })} step={STEP.risk} min={0} placeholder="any" ariaLabel="Maximum risk per unit" />
        </div>
        <div>
          <label className={label}>Min return on risk (%)</label>
          <NumberField value={cfg.minRoR} onChange={(v) => set({ minRoR: v })} step={STEP.ror} min={0} ariaLabel="Minimum return on risk" />
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
