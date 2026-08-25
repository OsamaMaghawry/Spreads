import { Minus, Plus } from "lucide-react";

// Numeric input with its own visible −/+ buttons.
//
// `<input type="number">` renders spinner arrows on desktop browsers but not on
// iOS Safari or Chrome on Android, which leaves a phone user with no way to
// nudge a value at all. These buttons are real buttons, so they work the same
// on touch and pointer, and the field keeps `inputMode="decimal"` so phones
// still open a numeric keypad for direct typing.
//
// `step` is per-field rather than global: days move by 1, deltas by 0.01,
// strike widths by 0.5. A step that doesn't match the unit (days by 0.5) makes
// the arrows useless even where they do render.

// Steps are decimals, so repeated addition drifts (0.1 + 0.2 = 0.30000000000004).
// Rounding to the step's own precision keeps the displayed value clean.
function roundToStep(value, step) {
  const decimals = (String(step).split(".")[1] || "").length;
  return Number(value.toFixed(decimals));
}

export default function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  placeholder,
  ariaLabel,
  className = ""
}) {
  const nudge = (direction) => {
    // An empty optional field (e.g. "max risk: any") starts from its floor
    // rather than NaN, so the first tap produces a usable number.
    const current = value === "" || value == null ? (min ?? 0) : Number(value);
    if (Number.isNaN(current)) return;
    let next = roundToStep(current + direction * Number(step), step);
    if (min != null && next < min) next = min;
    if (max != null && next > max) next = max;
    onChange(String(next));
  };

  const atMin = min != null && value !== "" && value != null && Number(value) <= min;
  const atMax = max != null && value !== "" && value != null && Number(value) >= max;

  const btn =
    "shrink-0 w-8 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 " +
    "active:bg-slate-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent " +
    "disabled:hover:text-slate-500 touch-manipulation";

  return (
    <div
      className={`flex items-stretch h-[38px] bg-white border border-slate-300 rounded-lg overflow-hidden focus-within:border-emerald-500 ${className}`}
    >
      <button type="button" onClick={() => nudge(-1)} disabled={atMin} className={`${btn} border-r border-slate-200`} aria-label="Decrease" tabIndex={-1}>
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          // Permissive while typing — a bare "-", "." or "" is a valid
          // in-progress value; rejecting it would fight the user mid-keystroke.
          const v = e.target.value;
          if (v === "" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="flex-1 min-w-0 px-2 text-sm text-slate-900 text-center tabular-nums focus:outline-none"
      />
      <button type="button" onClick={() => nudge(1)} disabled={atMax} className={`${btn} border-l border-slate-200`} aria-label="Increase" tabIndex={-1}>
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
