import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { WATCHLISTS_MAX } from "@/lib/terminal";

// The watchlists' own menu (1 Nov, the owner: "I need to have more than watch
// list, so I ... don't have so many stocks in one watch list"): a new list,
// the one on screen renamed or deleted. `value`: lib/terminal cleanWatchlists'
// shape; `onChange` gets the whole of it back.
export default function WatchlistMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(null);
  const [text, setText] = useState("");
  const [sure, setSure] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setNaming(null); setSure(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const current = value.lists.find((l) => l.id === value.active) || value.lists[0];
  const done = () => { setOpen(false); setNaming(null); setSure(false); setText(""); };
  const save = (e) => {
    e.preventDefault();
    const name = text.trim().slice(0, 30);
    if (!name) return;
    if (naming === "new") {
      const id = `w${Date.now().toString(36)}`;
      onChange({ lists: [...value.lists, { id, name, symbols: [] }], active: id });
    } else onChange({ ...value, lists: value.lists.map((l) => (l.id === current.id ? { ...l, name } : l)) });
    done();
  };
  const remove = () => {
    const lists = value.lists.filter((l) => l.id !== current.id);
    onChange({ lists, active: lists[0].id });
    done();
  };
  const full = value.lists.length >= WATCHLISTS_MAX;
  return (
    <div ref={box} className="no-drag relative">
      <button type="button" aria-label="Watchlist menu" title="New list, rename or delete this one" onClick={() => setOpen((v) => !v)}
        className="rounded p-0.5 text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg">
          {naming ? (
            <form onSubmit={save} className="flex gap-1 p-1">
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={30} placeholder={naming === "new" ? "Name of the new list" : "New name"}
                className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1" />
              <button type="submit" disabled={!text.trim()} className="rounded bg-slate-900 px-2 text-white disabled:opacity-40">{naming === "new" ? "Add" : "Save"}</button>
            </form>
          ) : (
            <>
              <button type="button" disabled={full} onClick={() => { setNaming("new"); setText(""); }} title={full ? `At most ${WATCHLISTS_MAX} lists` : undefined}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40">New list</button>
              <button type="button" onClick={() => { setNaming("rename"); setText(current.name); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50">Rename “{current.name}”</button>
              {value.lists.length > 1 && (sure ? (
                <button type="button" onClick={remove} className="block w-full rounded bg-rose-600 px-2 py-1.5 text-left font-semibold text-white">Delete “{current.name}” and its {current.symbols.length} symbols</button>
              ) : (
                <button type="button" onClick={() => setSure(true)} className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50">Delete “{current.name}”…</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
