import { useState, useEffect } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { invokeFunction } from "@/lib/functions";

// Admin-only maintenance actions that operate across every user's accounts.
// Renders nothing for ordinary users; each edge function enforces the same
// check server-side, so hiding this is presentation, not the access control.
const ACTIONS = [
  {
    fn: "migrateCredentials",
    label: "Encrypt legacy credentials",
    note: "Encrypts any credentials still stored in plaintext, for all users. Safe to run repeatedly.",
    summarize: (r) =>
      `Scanned ${r.scanned} · encrypted ${r.encrypted} · rotated ${r.rotated ?? 0} · already current ${r.alreadyCurrent}` +
      (r.failed?.length > 0 ? ` · failed ${r.failed.length}` : "")
  },
  {
    fn: "refreshEarnings",
    label: "Refresh earnings calendar",
    note: "Repopulates the next 90 days of earnings dates from the provider. Run once after setting EARNINGS_API_KEY, then on a schedule.",
    summarize: (r) => `${r.from} to ${r.to} · ${r.upserted} dates upserted`
  }
];

function MaintenanceAction({ fn, label, note, summarize }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    const res = await invokeFunction(fn);
    setRunning(false);
    if (res.data?.error) setError(res.data.error);
    else setResult(res.data);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{note}</div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-100 transition-colors disabled:opacity-40"
        >
          {running && <Loader2 className="w-4 h-4 animate-spin" />}
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {result && (
        <div className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">{summarize(result)}</div>
      )}
      {error && (
        <div className="text-xs text-rose-600 mt-3 pt-3 border-t border-slate-100">{error}</div>
      )}
    </div>
  );
}

export default function AdminMaintenance() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (active) setIsAdmin(data?.role === "admin");
    })();
    return () => { active = false; };
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="space-y-3">
      {ACTIONS.map((action) => (
        <MaintenanceAction key={action.fn} {...action} />
      ))}
    </div>
  );
}
