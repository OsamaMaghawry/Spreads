import { useEffect, useState } from "react";
import { Keyboard, Plus, Trash2, X } from "lucide-react";
import { ACTIONS, SIZE_MODES, PRICE_MODES, STOP_MODES, comboOf, keyWarning, cleanHotkeys, suggestedHotkeys, describe } from "@/lib/hotkeys";

// The hotkey editor (25 Oct 2026: "Can I set hotkeys ... I set them myself and
// they get to keep saved going forward"). Each row is a key, what it does and
// its size; the sentence under it is exactly what a press will send. Saved
// with the account by the page (lib/terminalPrefs.js). The rules are
// lib/hotkeys.js.

const field = "rounded border border-slate-300 bg-white px-1.5 py-1 text-xs tabular-nums focus:border-emerald-500 focus:outline-none";
let seq = 0;
const newId = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

function KeyButton({ value, onSet }) {
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { setListening(false); return; }
      const combo = comboOf(e);
      if (!combo) return; // a modifier on its own: wait for the key
      onSet(combo);
      setListening(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onSet]);
  return (
    <button type="button" onClick={() => setListening(true)} title="Click, then press the keys"
      className={`w-28 shrink-0 rounded border px-2 py-1 text-left font-mono text-xs ${listening ? "animate-pulse border-emerald-500 bg-emerald-50 text-emerald-800" : value ? "border-slate-300 bg-slate-50 text-slate-900" : "border-dashed border-slate-300 text-slate-400"}`}>
      {listening ? "Press keys…" : value || "Set key"}
    </button>
  );
}

export default function HotkeysDialog({ open, hotkeys, armed, onArm, onSave, onClose }) {
  const [draft, setDraft] = useState(hotkeys);
  useEffect(() => { if (open) setDraft(hotkeys.length ? hotkeys : []); }, [open, hotkeys]);
  if (!open) return null;

  const set = (id, patch) => setDraft((list) => list.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const add = () => setDraft((list) => [...list, { id: newId(), keys: "", action: "buy", size: "shares", amount: 100, price: "market", offset: 0 }]);
  const unkeyed = draft.filter((h) => !h.keys).length;
  const save = () => { onSave(cleanHotkeys(draft)); onClose(); };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Hotkeys">
      <div className="mt-10 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Keyboard className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-semibold">Hotkeys</h2>
          <label className={`ml-4 flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${armed ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            <input type="checkbox" className="sr-only" checked={armed} onChange={(e) => onArm(e.target.checked)} />
            <span className={`h-2 w-2 rounded-full ${armed ? "bg-white" : "bg-slate-400"}`} />{armed ? "On: keys send orders" : "Off"}
          </label>
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="px-4 pt-3 text-xs leading-relaxed text-slate-600">
          A hotkey sends its order at once, with no review, for the symbol on the chart. Keys work on the Trade page while you are not typing in a box, and only when hotkeys are on. Paper accounts only during this test. During a replay they trade the practice account instead.
        </p>
        <div className="space-y-2 px-4 py-3">
          {draft.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
              No hotkeys yet.
              <button type="button" onClick={() => setDraft(suggestedHotkeys())} className="ml-2 rounded border border-emerald-400 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Start from a suggested set</button>
            </div>
          )}
          {draft.map((h) => {
            const a = ACTIONS[h.action];
            const warn = h.keys ? keyWarning(h.keys, draft, h.id) : null;
            const clean = cleanHotkeys([{ ...h, keys: h.keys || "x" }])[0];
            return (
              <div key={h.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <KeyButton value={h.keys} onSet={(keys) => set(h.id, { keys })} />
                  <select className={field} value={h.action} onChange={(e) => set(h.id, { action: e.target.value })} aria-label="Action">
                    {Object.entries(ACTIONS).map(([id, x]) => <option key={id} value={id}>{x.label}</option>)}
                  </select>
                  {a?.sized && (<>
                    <input className={`${field} w-20`} inputMode="decimal" value={h.amount ?? ""} onChange={(e) => set(h.id, { amount: e.target.value })} aria-label="Size" />
                    <select className={field} value={h.size || "shares"} onChange={(e) => set(h.id, { size: e.target.value })} aria-label="Size in">
                      {SIZE_MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </>)}
                  {a?.priced && (<>
                    <select className={field} value={h.price || "market"} onChange={(e) => set(h.id, { price: e.target.value })} aria-label="Price">
                      {PRICE_MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    {h.price && h.price !== "market" && (
                      <label className="flex items-center gap-1 text-[11px] text-slate-500">offset $
                        <input className={`${field} w-16`} inputMode="decimal" value={h.offset ?? 0} onChange={(e) => set(h.id, { offset: e.target.value })} aria-label="Offset" />
                      </label>
                    )}
                  </>)}
                  {a?.percent && (
                    <label className="flex items-center gap-1 text-[11px] text-slate-500">
                      <input className={`${field} w-16`} inputMode="decimal" value={h.percent ?? 100} onChange={(e) => set(h.id, { percent: e.target.value })} aria-label="Percent of position" />% of the position
                    </label>
                  )}
                  {a?.stop && (<>
                    <input className={`${field} w-16`} inputMode="decimal" value={h.stopValue ?? 2} onChange={(e) => set(h.id, { stopValue: e.target.value })} aria-label="Stop distance" />
                    <select className={field} value={h.stopMode || "pct"} onChange={(e) => set(h.id, { stopMode: e.target.value })} aria-label="Stop distance in">
                      {STOP_MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    <select className={field} value={h.from || "last"} onChange={(e) => set(h.id, { from: e.target.value })} aria-label="Measured from">
                      <option value="last">from the last price</option><option value="entry">from the average entry</option>
                    </select>
                  </>)}
                  <button type="button" aria-label="Delete hotkey" onClick={() => setDraft((list) => list.filter((x) => x.id !== h.id))} className="ml-auto rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
                <p className="mt-1 text-xs text-slate-700">{clean ? describe(clean) : ""}</p>
                {warn && <p className="mt-0.5 text-[11px] text-amber-700">{warn}</p>}
              </div>
            );
          })}
          <button type="button" onClick={add} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add a hotkey</button>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          {unkeyed > 0 && <span className="text-[11px] text-amber-700">{unkeyed} without a key will not be kept.</span>}
          <button type="button" onClick={onClose} className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Cancel</button>
          <button type="button" onClick={save} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">Save</button>
        </div>
      </div>
    </div>
  );
}
