// Risk bands for a proposed order, as a share of account equity.
//
// The thresholds are deliberately blunt and fixed rather than configurable.
// A number like "$382 at risk" means nothing on its own; "8% of the account"
// is a judgement a trader can make in one glance, and the point of the bands is
// that the glance is enough.
//
// These describe exposure. They are not advice, and nothing here blocks an
// order — the trader decides.

export const RISK_BANDS = [
  { floor: 0.70, key: "severe",   label: "Severe",   note: "Over 70% of the account on one position." },
  { floor: 0.50, key: "high",     label: "High",     note: "Over half the account on one position." },
  { floor: 0.25, key: "elevated", label: "Elevated", note: "Over a quarter of the account on one position." },
  { floor: 0.10, key: "notable",  label: "Notable",  note: "Over a tenth of the account on one position." },
  { floor: 0,    key: "contained", label: "Contained", note: "Under a tenth of the account." }
];

/** The band a risk fraction falls into. `fraction` is risk ÷ equity. */
export function riskBand(fraction) {
  if (!Number.isFinite(fraction) || fraction < 0) return null;
  return RISK_BANDS.find((b) => fraction >= b.floor);
}

// Tailwind classes per band. Green is never used: a position that is small is
// not thereby a good one, and in a trading interface green reads as profit.
const STYLES = {
  contained: { text: "text-slate-700", bar: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 border-slate-200" },
  notable:   { text: "text-sky-700",   bar: "bg-sky-500",    chip: "bg-sky-50 text-sky-700 border-sky-200" },
  elevated:  { text: "text-amber-700", bar: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200" },
  high:      { text: "text-orange-700", bar: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  severe:    { text: "text-rose-700",  bar: "bg-rose-500",   chip: "bg-rose-50 text-rose-700 border-rose-200" }
};

export function riskStyle(key) {
  return STYLES[key] || STYLES.contained;
}

/** True once the exposure is large enough to deserve a second look. */
export function isElevated(fraction) {
  const band = riskBand(fraction);
  return band ? band.floor >= 0.25 : false;
}

/** "before the open on 2026-09-18" — plain wording for an earnings session. */
export function earningsWhen(earnings) {
  if (!earnings) return "";
  const when =
    earnings.session === "bmo" ? "before the open on" :
    earnings.session === "amc" ? "after the close on" :
    "on";
  return `${when} ${earnings.date}`;
}
