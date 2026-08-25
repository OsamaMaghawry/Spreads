import { useEffect, useState } from "react";
import { Bookmark, Check, Trash2, X, RotateCcw } from "lucide-react";
import { listPresets, savePreset, deletePreset, loadLastUsed } from "@/lib/scanPresets";
import { toast } from "@/components/ui/use-toast";

// Preset bar for both scanners: pick a saved parameter set, save the current
// one under a name, or restore whatever was last scanned.
//
// The last-used set is offered rather than applied automatically. Silently
// restoring old parameters would mean a scan could run against filters the
// trader didn't choose in this session and may not have noticed — on a screen
// whose whole job is deciding what to risk money on, that has to be a
// deliberate click.
export default function ScanPresets({ scope, strategy, config, onApply }) {
  const [presets, setPresets] = useState([]);
  const [lastUsed, setLastUsed] = useState(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Two-step delete, matching pages/Accounts.jsx: the trash icon arms the
  // confirm rather than deleting, so a mistap on a phone can't silently destroy
  // a preset that took real tuning to arrive at. Inline rather than a modal
  // because this renders inside the open-position Dialog, and nesting Radix
  // modals fights over the focus trap.
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, l] = await Promise.all([listPresets(scope), loadLastUsed(scope)]);
        if (cancelled) return;
        setPresets(p);
        setLastUsed(l);
      } catch {
        // A preset bar that can't load is a degraded convenience, not a broken
        // scanner — leave it empty and let the scan proceed on defaults.
      }
    })();
    return () => { cancelled = true; };
  }, [scope]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const saved = await savePreset(scope, trimmed, strategy, config);
      setPresets((list) => [...list.filter((p) => p.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setNaming(false);
      setName("");
      toast({ title: `Saved "${saved.name}"` });
    } catch (e) {
      toast({ title: "Couldn't save preset", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (preset) => {
    try {
      await deletePreset(preset.id);
      setPresets((list) => list.filter((p) => p.id !== preset.id));
      toast({ title: `Deleted "${preset.name}"` });
    } catch (e) {
      toast({ title: "Couldn't delete preset", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(null);
    }
  };

  const chip = "text-xs px-2.5 py-1 rounded-full border transition-colors";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5" /> Presets
        </span>

        {lastUsed && (
          <button
            onClick={() => onApply(lastUsed.strategy, lastUsed.config)}
            className={`${chip} border-slate-200 bg-white text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1`}
            title="Restore the parameters from your last scan"
          >
            <RotateCcw className="w-3 h-3" /> Last scan
          </button>
        )}

        {presets.map((p) =>
          confirming === p.id ? (
            <span key={p.id} className={`${chip} border-rose-200 bg-rose-50 text-rose-700 inline-flex items-center gap-2`}>
              Delete &ldquo;{p.name}&rdquo;?
              <button onClick={() => remove(p)} className="font-semibold hover:underline">Delete</button>
              <button onClick={() => setConfirming(null)} className="text-rose-400 hover:text-rose-700">Cancel</button>
            </span>
          ) : (
            <span key={p.id} className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5`}>
              <button onClick={() => onApply(p.strategy, p.config)} className="hover:underline">
                {p.name}
              </button>
              <button onClick={() => setConfirming(p.id)} aria-label={`Delete ${p.name}`} className="text-emerald-400 hover:text-rose-600 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          )
        )}

        {!naming && (
          <button
            onClick={() => setNaming(true)}
            className={`${chip} border-dashed border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-400`}
          >
            + Save current
          </button>
        )}
      </div>

      {naming && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setNaming(false); setName(""); }
            }}
            placeholder="Name this setup — e.g. 0DTE tight"
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
          />
          <button onClick={save} disabled={!name.trim() || busy} aria-label="Save preset"
            className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { setNaming(false); setName(""); }} aria-label="Cancel"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
