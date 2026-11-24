import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { stepPrice, roundPrice } from "@/lib/phoneOrder";

// The phone terminal's building blocks (24 Nov, the owner's approved design):
// sheets that slide up from the bottom, a confirm step for everything that
// sends ("anything has to have a confirmation"), and price and size fields
// that take typing or arrows ("changing the order price and quantity all with
// arrows, no change by typing?": both).

export const TONE = {
  buy: "bg-emerald-700 text-white active:bg-emerald-800",
  sell: "bg-rose-700 text-white active:bg-rose-800",
  primary: "bg-dm-accent text-white active:bg-dm-accent-bright",
  plain: "border border-slate-300 bg-white text-slate-800 active:bg-slate-100",
  danger: "border border-rose-300 bg-white text-rose-700 active:bg-rose-50"
};

export function Btn({ tone = "plain", className = "", children, ...rest }) {
  return (
    <button type="button" {...rest}
      className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl px-3 text-[15px] font-semibold disabled:opacity-40 ${TONE[tone]} ${className}`}>
      {children}
    </button>
  );
}

export function Chip({ on = false, className = "", children, ...rest }) {
  return (
    <button type="button" aria-pressed={on} {...rest}
      className={`flex min-h-[40px] shrink-0 items-center rounded-full border px-3.5 text-sm font-medium ${on ? "border-dm-accent bg-dm-accent text-white" : "border-slate-300 bg-white text-slate-700"} ${className}`}>
      {children}
    </button>
  );
}

/** A bottom sheet over the phone screen; the backdrop closes it. */
export function Sheet({ open, onClose, children, z = "z-[60]", label = "" }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`fixed inset-0 ${z} flex flex-col justify-end`} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className="relative max-h-[92%] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" />
        {children}
      </div>
    </div>
  );
}

export function SheetHead({ title, sub = null, onClose }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold leading-tight text-slate-900">{title}</div>
        {sub && <div className="text-sm text-slate-500">{sub}</div>}
      </div>
      {onClose && <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200"><X className="h-5 w-5" /></button>}
    </div>
  );
}

/**
 * Confirm before anything is sent. `confirm`: { title, lines, to (account
 * names), label, tone, run (async; its result closes the sheet) }.
 */
export function ConfirmSheet({ confirm, onClose, mode }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); }, [confirm]);
  if (!confirm) return null;
  const go = async () => {
    setBusy(true);
    try { await confirm.run(); } finally { setBusy(false); onClose(); }
  };
  return (
    <Sheet open onClose={busy ? undefined : onClose} z="z-[70]" label={confirm.title}>
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1 text-lg font-semibold leading-tight text-slate-900">{confirm.title}</div>
        <ModeBadge mode={mode} small />
      </div>
      <div className="mb-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px] leading-snug text-slate-800">
        {confirm.lines.filter(Boolean).map((l, i) => <p key={i} className={typeof l === "object" && l?.warn ? "font-medium text-rose-700" : ""}>{typeof l === "object" ? l.text : l}</p>)}
      </div>
      {confirm.to?.length > 0 && <p className="mb-3 text-sm text-slate-600">On: <span className="font-medium text-slate-800">{confirm.to.join(", ")}</span></p>}
      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={onClose} disabled={busy}>Back</Btn>
        <Btn tone={confirm.tone || "primary"} onClick={go} disabled={busy}>{busy ? "Sending…" : confirm.label}</Btn>
      </div>
    </Sheet>
  );
}

export function ModeBadge({ mode, name = "", small = false, onClick = null }) {
  const style = mode === "live" ? "bg-rose-50 text-rose-700" : mode === "replay" ? "bg-amber-50 text-amber-800" : "bg-indigo-50 text-dm-accent";
  const word = mode === "live" ? "LIVE" : mode === "replay" ? "REPLAY" : "PAPER";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full ${small ? "min-h-[28px] px-2.5 text-[11px]" : "min-h-[40px] max-w-[52vw] px-3 text-xs"} font-bold tracking-wider ${style}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current" />{word}
      {name && <span className="truncate font-medium tracking-normal text-slate-500">{name}</span>}
    </Tag>
  );
}

const priceText = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(v) >= 1 ? Number(v).toFixed(2) : Number(v).toFixed(4));
const stepLabel = (s, p) => `${s < 0 ? "−" : "+"}${Number(p) >= 1 ? `${Math.abs(s)}¢` : `${Math.abs(s)}t`}`;

/**
 * A price you can type (16px, so the phone does not zoom) or move by arrows.
 * `value` is a number or null; `onChange(number)` on each arrow and on Done.
 */
export function PriceField({ label, value, onChange, tone = "", steps = [-5, -1, 1, 5], sub = null, onRemove = null }) {
  const [text, setText] = useState(priceText(value));
  useEffect(() => { setText(priceText(value)); }, [value]);
  const commit = () => {
    const v = roundPrice(String(text).replace(/,/g, ""));
    if (v > 0 && v !== value) onChange(v);
    else setText(priceText(value));
  };
  const half = steps.length / 2;
  const btn = (s) => (
    <button key={s} type="button" onClick={() => onChange(stepPrice(value || 0, s) ?? value)} disabled={!(value > 0)}
      className="h-11 w-11 shrink-0 rounded-lg bg-slate-100 font-mono text-[13px] font-semibold text-slate-700 active:bg-slate-200 disabled:opacity-40">
      {stepLabel(s, value)}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 p-1">
      <span className={`flex w-12 shrink-0 flex-col items-start pl-1.5 text-xs font-semibold ${tone}`}>{label}
        {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="-ml-1 mt-0.5 rounded px-1 text-[11px] font-medium text-slate-500 underline">remove</button>}</span>
      {steps.slice(0, half).map(btn)}
      <span className="flex min-w-0 flex-1 flex-col items-center">
        <input type="text" inputMode="decimal" enterKeyHint="done" aria-label={label} value={text}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent text-center font-mono text-base font-semibold tabular-nums text-slate-900 focus:border-dm-accent focus:bg-slate-50 focus:outline-none" />
        {sub && <span className="text-[11px] leading-tight text-slate-500">{sub}</span>}
      </span>
      {steps.slice(half).map(btn)}
    </div>
  );
}

/** A whole-number size you can type or move by arrows. */
export function QtyField({ label = "Qty", value, onChange, steps = [-100, -10, 10, 100], sub = null, big = false }) {
  const [text, setText] = useState(String(value ?? ""));
  useEffect(() => { setText(String(value ?? "")); }, [value]);
  const commit = () => {
    const v = Math.floor(Number(String(text).replace(/,/g, "")));
    if (v > 0 && v !== value) onChange(v);
    else setText(String(value ?? ""));
  };
  const half = steps.length / 2;
  const btn = (s) => (
    <button key={s} type="button" onClick={() => onChange(Math.max(1, (Number(value) || 0) + s))}
      className={`${big ? "h-14 w-14 text-base" : "h-11 w-11 text-[13px]"} shrink-0 rounded-lg bg-slate-100 font-mono font-semibold text-slate-700 active:bg-slate-200`}>
      {s > 0 ? "+" : "−"}{Math.abs(s)}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 p-1">
      {label && <span className="w-12 shrink-0 pl-1.5 text-xs font-semibold text-slate-600">{label}</span>}
      {steps.slice(0, half).map(btn)}
      <span className="flex min-w-0 flex-1 flex-col items-center">
        <input type="text" inputMode="numeric" enterKeyHint="done" aria-label={label || "Quantity"} value={text}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className={`${big ? "h-12 text-2xl" : "h-9 text-base"} w-full min-w-0 rounded-lg border border-transparent bg-transparent text-center font-mono font-semibold tabular-nums text-slate-900 focus:border-dm-accent focus:bg-slate-50 focus:outline-none`} />
        {sub && <span className="text-[11px] leading-tight text-slate-500">{sub}</span>}
      </span>
      {steps.slice(half).map(btn)}
    </div>
  );
}

/** A change made on screen and not sent yet: Undo, or Confirm change. */
export function PendingBar({ text, onUndo, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { if (busy) return; setBusy(true); try { await onConfirm(); } finally { setBusy(false); } };
  return (
    <div className="space-y-2 rounded-xl bg-indigo-50 p-2.5">
      <p className="text-sm leading-snug text-slate-800"><span className="font-semibold">Not sent yet:</span> {text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={onUndo} disabled={busy}>Undo</Btn>
        <Btn tone="primary" onClick={go} disabled={busy}>{busy ? "Sending…" : "Confirm change"}</Btn>
      </div>
    </div>
  );
}
