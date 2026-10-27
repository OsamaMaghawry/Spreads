import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { SIZE_MODES, sizeLabel } from "@/lib/accountGroup";

// The other accounts an order also goes to, picked beside the account on
// screen (27 Oct: "select more than one and the orders go for all of them
// proportionately"), each sized pro rata or by its own size ("I need to set
// the quantities by account"). Loud when on, so an order never goes to more
// accounts than the trader means: the count, and red when a live account is
// in it.
export default function GroupPicker({ choices, value, sizes = {}, onChange, onSizes }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!choices.length) return null;
  const picked = new Set(value);
  const live = choices.some((a) => picked.has(a.id) && a.type === "Live");
  const toggle = (id) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const setSize = (id, next) => onSizes({ ...sizes, [id]: { ...(sizes[id] || { mode: "prorata" }), ...next } });
  const tone = !value.length ? "border-slate-300 text-slate-600 hover:bg-slate-50"
    : live ? "border-rose-500 bg-rose-50 font-semibold text-rose-800" : "border-violet-500 bg-violet-50 font-semibold text-violet-800";
  const own = value.some((id) => sizes[id]?.mode && sizes[id].mode !== "prorata");
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        title="Send orders to more accounts at once, each pro rata or at its own size"
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${tone}`}>
        <Users className="h-3.5 w-3.5" />
        {value.length ? `+${value.length} account${value.length === 1 ? "" : "s"} · ${own ? "own sizes" : "pro rata"}${live ? " · LIVE" : ""}` : "Also send to…"}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[26rem] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg">
          <p className="mb-1.5 leading-snug text-slate-500">
            Orders, hotkeys, exits, stops and cancels on the account on screen go to these too. Buying, each takes its size: pro rata (in proportion to its portfolio value), a multiple of that, a percent of its own portfolio, shares or dollars. Selling what is held: each in proportion to what it holds.
          </p>
          {choices.map((a) => {
            const on = picked.has(a.id);
            const size = sizes[a.id] || { mode: "prorata" };
            return (
              <div key={a.id} className={`rounded px-1 py-1 ${on ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className={`rounded px-1 text-[10px] font-semibold uppercase ${a.type === "Live" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800"}`}>{a.type}</span>
                </label>
                {on && (
                  <div className="mt-1 flex items-center gap-1 pl-6">
                    <select aria-label={`Size for ${a.name}`} value={size.mode} onChange={(e) => setSize(a.id, { mode: e.target.value })}
                      className="rounded border border-slate-300 bg-white px-1 py-0.5">
                      {SIZE_MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    {size.mode !== "prorata" && (
                      <input aria-label={`${a.name}: ${sizeLabel(size.mode)}`} inputMode="decimal" value={size.value ?? ""}
                        onChange={(e) => setSize(a.id, { value: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder={size.mode === "times" ? "e.g. 3" : size.mode === "percent" ? "e.g. 5" : size.mode === "shares" ? "e.g. 20" : "e.g. 500"}
                        className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums" />
                    )}
                    <span className="text-slate-500">{sizeLabel(size.mode)}</span>
                  </div>
                )}
              </div>
            );
          })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded border border-slate-300 py-1 text-slate-600 hover:bg-slate-50">
              Only the account on screen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
