import NumberField from "@/components/common/NumberField";

const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const label = "text-xs text-slate-500 block mb-1.5";

export const SCREENER_DEFAULTS = {
  universe: "top50",
  customTickers: "",
  // The whole-market sieve. Only read when universe === "market"; the cheap
  // pass that makes a chain scan of the whole market finishable at all.
  maxSpot: 100,
  minSpot: 5,
  minVolume: 1000000,
  maxSpreadPct: 1,
  maxCapitalPct: "",
  dteMin: 0,
  dteMax: 5,
  deltaMin: 0.12,
  deltaMax: 0.22,
  widthMin: 1,
  widthMax: 3,
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

// Min and max are labelled individually rather than relying on a shared
// "min / max" note above the row: with a stepper on each side of the box the
// placeholder is easy to miss, and it disappears entirely once a value is set.
function Bound({ caption, value, onChange, step, min, placeholder, ariaLabel }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">{caption}</span>
      <NumberField value={value} onChange={onChange} step={step} min={min} placeholder={placeholder} ariaLabel={ariaLabel} />
    </div>
  );
}

function Range({ title, min, max, onChange, fieldStep, minFloor = 0 }) {
  return (
    <div>
      <label className={label}>{title}</label>
      <div className="grid grid-cols-2 gap-2">
        <Bound caption="Min" value={min} onChange={(v) => onChange({ min: v })} step={fieldStep} min={minFloor} ariaLabel={`${title} minimum`} />
        <Bound caption="Max" value={max} onChange={(v) => onChange({ max: v })} step={fieldStep} min={minFloor} ariaLabel={`${title} maximum`} />
      </div>
    </div>
  );
}

export default function ScreenerConfig({ cfg, set, isCondor, single = false, strategy = "" }) {
  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Universe</label>
        <select value={cfg.universe} onChange={(e) => set({ universe: e.target.value })} className={input}>
          <option value="top50">Top 50 most liquid (fast)</option>
          <option value="sp500">Full S&amp;P 500 (slow)</option>
          <option value="market">Entire market — filtered below</option>
          <option value="custom">Custom ticker list</option>
        </select>
      </div>

      {/* The whole-market filters.
          These are not a convenience. Alpaca lists around eleven thousand
          equities and one option chain each is minutes of requests, so the
          sieve is what makes this universe finishable — it runs on one cheap
          snapshot per hundred names and only the survivors get a chain.

          The volume floor is here for the opposite reason to the price cap: the
          cheap end of the market is where the illiquid names are, and an option
          quoted forty cents by two-forty costs a third of its own premium to
          get into and may not be closable on the day it matters. A price filter
          without a liquidity floor makes a small account's risk worse, not
          better. */}
      {cfg.universe === "market" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            Every listed US equity is priced first, then only the names that pass these get an option
            chain. Narrower filters mean a faster, shorter scan.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Share price at most ($)</label><NumberField value={cfg.maxSpot} step={5} min={1}
              onChange={(v) => set({ maxSpot: v })} ariaLabel="Maximum share price" /></div>
            <div><label className={label}>Share price at least ($)</label><NumberField value={cfg.minSpot} step={1} min={0}
              onChange={(v) => set({ minSpot: v })} ariaLabel="Minimum share price" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Shares traded today, at least</label><NumberField value={cfg.minVolume} step={250000} min={0}
              onChange={(v) => set({ minVolume: v })} ariaLabel="Minimum daily volume" /></div>
            <div><label className={label}>Quote no wider than (%)</label><NumberField value={cfg.maxSpreadPct} step={0.25} min={0}
              onChange={(v) => set({ maxSpreadPct: v })} ariaLabel="Maximum quote width percent" /></div>
          </div>
          <div>
            <div><label className={label}>Capital per contract at most (% of this account)</label><NumberField value={cfg.maxCapitalPct}
              step={1} min={0} onChange={(v) => set({ maxCapitalPct: v })}
              ariaLabel="Maximum capital per contract as a percent of account equity" /></div>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              A cash-secured put commits the strike &times; 100 — $20,000 on a $200 stock, whatever the
              premium looks like. Leave blank to ignore.
            </p>
          </div>
        </div>
      )}

      {cfg.universe === "custom" && (
        <div>
          <label className={label}>Tickers <span className="text-slate-400">comma separated</span></label>
          <input value={cfg.customTickers} onChange={(e) => set({ customTickers: e.target.value.toUpperCase() })}
            className={input} placeholder="WMT, TGT, COST" />
        </div>
      )}

      <Range title="Days to expiry" fieldStep={STEP.dte}
        min={cfg.dteMin} max={cfg.dteMax}
        onChange={(v) => set({ dteMin: v.min ?? cfg.dteMin, dteMax: v.max ?? cfg.dteMax })} />

      <Range title="Short delta" fieldStep={STEP.delta}
        min={cfg.deltaMin} max={cfg.deltaMax}
        onChange={(v) => set({ deltaMin: v.min ?? cfg.deltaMin, deltaMax: v.max ?? cfg.deltaMax })} />

      {!single && (
        <>
          <Range title="Wing width ($)" fieldStep={STEP.width}
            min={cfg.widthMin} max={cfg.widthMax}
            onChange={(v) => set({ widthMin: v.min ?? cfg.widthMin, widthMax: v.max ?? cfg.widthMax })} />
          <p className="text-[11px] text-slate-400 -mt-1.5 leading-relaxed">
            Only spreads whose strikes are exactly this far apart are returned. A ticker whose
            chain has no strike at that distance is listed as skipped rather than widened.
          </p>
        </>
      )}
      {(strategy === "covered_call" || strategy === "wheel") && (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {strategy === "wheel"
            ? "Puts are scanned on the universe above; calls on the shares this account holds, 100 or more, at their cost basis."
            : "Scans the shares this account holds, 100 or more, at their cost basis — the universe above is ignored."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Min credit ($)</label>
          <NumberField value={cfg.minCredit} onChange={(v) => set({ minCredit: v })} step={STEP.credit} min={0} ariaLabel="Minimum credit" />
        </div>
        <div>
          <label className={label}>{single ? "Max collateral / contract ($)" : "Max risk / unit ($)"}</label>
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
