import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eye, Star } from "lucide-react";
import { SIZE_MODES, canSend, exitsOf } from "@/lib/accountGroup";
import { px, sizeText } from "@/lib/terminal";

// Every account in one list (3 Nov, the owner's approved design, after "I
// see different areas to set different numbers ... When I see Alton, I
// don't see Alton is it checked"): a tick for each account orders go to,
// each one's size (the key's own, or its own in dollars, shares or a percent
// of its portfolio), which one is on screen, and the default the terminal
// opens on ("a default account to open on"). The button shows where orders
// go at all times, red when a live account is ticked, with what each holds
// of the chart's symbol and whether a stop sits at Alpaca for it (30 Oct:
// "knowing which account is buying or selling now is so confusing").
const PLACEHOLDER = { dollars: "e.g. 500", shares: "e.g. 20", percent: "e.g. 1" };

export default function AccountsMenu({ accounts, liveOk, ticks, onTicks, shownId, onShow, defaultId, onDefault, sizes = {}, onSizes, rows = null, symbol }) {
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
  if (!accounts.length) return null;

  const on = new Set(ticks);
  const sending = accounts.filter((a) => on.has(a.id) && canSend(a, liveOk));
  const shown = accounts.find((a) => a.id === shownId) || null;
  const shownSends = sending.some((a) => a.id === shownId);
  const live = sending.some((a) => a.type === "Live");
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  const toggle = (id) => onTicks(on.has(id) ? ticks.filter((x) => x !== id) : [...ticks, id]);
  const setMode = (id, mode) => onSizes({ ...sizes, [id]: mode === "key" ? { mode: "key" } : { mode, value: "" } });
  const setValue = (id, value) => onSizes({ ...sizes, [id]: { ...(sizes[id] || {}), value: value.replace(/[^\d.]/g, "") } });
  const tone = live ? "border-rose-500 bg-rose-50" : sending.length ? "border-slate-400 bg-white" : "border-rose-500 bg-white";

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        className={`flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-md border-2 px-2 py-1 text-left text-xs ${tone}`}>
        <span className="text-[11px] text-slate-500">Accounts</span>
        {sending.map((a) => <Chip key={a.id} account={a} shown={a.id === shownId} row={rows ? byId.get(a.id) : null} reading={!!rows} symbol={symbol} />)}
        {shown && !shownSends && <Chip account={shown} shown off row={rows ? byId.get(shown.id) : null} reading={!!rows} symbol={symbol} />}
        {!sending.length && <span className="font-semibold text-rose-700">None ticked: nothing will be sent</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
      </button>

      {open && (
        <div role="dialog" aria-label="Accounts" className="absolute left-0 top-full z-40 mt-1 w-[min(44rem,calc(100vw-1rem))] rounded-lg border border-slate-300 bg-white p-2 text-xs shadow-xl">
          <div className="overflow-x-auto">
            <div className="min-w-[36rem]">
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_15rem_3rem_3.5rem] items-center gap-2 px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span /><span>Account</span><span /><span>Size</span><span className="text-center">Show</span><span className="text-center">Default</span>
              </div>
              {accounts.map((a) => {
                const can = canSend(a, liveOk);
                const ticked = can && on.has(a.id);
                const size = sizes[a.id]?.mode && sizes[a.id].mode !== "key" ? sizes[a.id] : { mode: "key" };
                const isDefault = a.id === defaultId;
                return (
                  <div key={a.id} className={`grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_15rem_3rem_3.5rem] items-center gap-2 rounded-md px-1.5 py-1.5 ${ticked ? "bg-slate-100" : ""}`}>
                    <input type="checkbox" checked={ticked} disabled={!can} onChange={() => toggle(a.id)} aria-label={`Send orders to ${a.name}`}
                      title={can ? undefined : "View only: orders cannot go to this live account from here"} className="h-4 w-4" />
                    <span className={`truncate font-semibold ${ticked ? "text-slate-900" : "text-slate-600"}`} title={a.name}>{a.name}</span>
                    <span className="flex flex-col items-start gap-0.5">
                      <span className={`rounded px-1.5 text-[10px] font-bold uppercase ${a.type === "Live" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800"}`}>{a.type}</span>
                      {!can && <span className="text-[10px] text-slate-500">view only</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <select value={size.mode} onChange={(e) => setMode(a.id, e.target.value)} aria-label={`Size for ${a.name}`}
                        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-1">
                        {SIZE_MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                      {size.mode !== "key" && (
                        <input value={size.value ?? ""} onChange={(e) => setValue(a.id, e.target.value)} inputMode="decimal"
                          placeholder={PLACEHOLDER[size.mode]} aria-label={`${a.name} size`}
                          className="w-16 rounded border border-slate-300 px-1 py-1 text-right tabular-nums" />
                      )}
                    </span>
                    <input type="radio" name="terminal-show-account" checked={a.id === shownId} onChange={() => onShow(a.id)}
                      aria-label={`Show ${a.name} on screen`} className="h-4 w-4 justify-self-center" />
                    <button type="button" onClick={() => onDefault(isDefault ? "" : a.id)} aria-pressed={isDefault}
                      aria-label={isDefault ? `${a.name} is the default account` : `Open on ${a.name} by default`}
                      title={isDefault ? "The terminal opens on this account" : "Open the terminal on this account"}
                      className="justify-self-center rounded p-1 hover:bg-slate-200">
                      <Star className={`h-4 w-4 ${isDefault ? "fill-amber-400 text-amber-500" : "text-slate-400"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end pt-1.5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// One account orders go to (or, `off`, the one on screen that they do not):
// its name, live or paper, and what it holds of the chart's symbol.
function Chip({ account, shown = false, off = false, row, reading, symbol }) {
  const live = account.type === "Live";
  const x = row && !row.error ? exitsOf(row.qty, row.waiting) : null;
  const tone = off ? "border-dashed border-slate-400 bg-white text-slate-500" : live ? "border-rose-400 bg-white text-rose-900" : "border-slate-300 bg-white text-slate-800";
  return (
    <span className={`flex flex-col rounded-full border px-2 py-0.5 leading-tight ${tone} ${reading ? "rounded-md" : ""}`}>
      <span className="flex items-center gap-1">
        {shown && <Eye className="h-3 w-3 shrink-0" aria-label="On screen" />}
        <span className="max-w-[11rem] truncate font-semibold">{account.name}</span>
        {!off && live && <span className="rounded bg-rose-600 px-1 text-[9px] font-bold uppercase text-white">Live</span>}
        {off && <span className="text-[10px]">not sent to</span>}
      </span>
      {reading && !off && (
        <span className="text-[10px]">
          {row?.error ? <span className="text-rose-700">could not be read</span>
            : !x ? <span className="text-slate-500">reading…</span>
              : !x.held ? <span className="text-slate-500">no {symbol}</span>
                : (
                  <>
                    <b className="tabular-nums">{sizeText(Math.abs(x.held))} {symbol}{x.held < 0 ? " short" : ""}</b>
                    {" · "}
                    {x.stop !== null ? <span>stop {px(x.stop)}</span> : <span className="font-bold text-rose-700">NO STOP</span>}
                    {x.target !== null && <span> · target {px(x.target)}</span>}
                  </>
                )}
          {x?.other > 0 && <span className="text-amber-800"> · {x.other} waiting</span>}
        </span>
      )}
    </span>
  );
}
