import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Pencil, Trash2, KeyRound, Link2 } from "lucide-react";
import AccountForm from "@/components/accounts/AccountForm";
import { startAlpacaOAuth } from "@/lib/alpacaOAuth";
import AlpacaConnectConsent from "@/components/accounts/AlpacaConnectConsent";

export default function Accounts() {
  const [accounts, setAccounts] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | account
  const [deleting, setDeleting] = useState(null);
  const [connectEnv, setConnectEnv] = useState(null); // null | "paper" | "live"

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("trading_accounts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    setAccounts(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    if (editing === "new") {
      const { error } = await supabase.from("trading_accounts").insert(form);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("trading_accounts").update(form).eq("id", editing.id);
      if (error) throw new Error(error.message);
    }
    setEditing(null);
    load();
  };

  const remove = async (account) => {
    const { error } = await supabase.from("trading_accounts").delete().eq("id", account.id);
    if (error) throw new Error(error.message);
    setDeleting(null);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Alpaca API credentials for the accounts shown on the monitor.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setConnectEnv("paper")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm hover:bg-sky-100 transition-colors"
          >
            <Link2 className="w-4 h-4" /> Connect Alpaca (Paper)
          </button>
          <button
            onClick={() => setConnectEnv("live")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors"
          >
            <Link2 className="w-4 h-4" /> Connect Alpaca (Live)
          </button>
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-slate-500 border border-slate-200 text-sm hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add manually
          </button>
        </div>
      </div>

      {accounts === null ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <KeyRound className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm">No accounts yet — add your first Alpaca account.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-slate-900">{a.name}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    a.is_paper ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}>
                    {a.is_paper ? "Paper" : "Live"}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1 truncate">
                  {a.oauth_access_token
                    ? "Connected via Alpaca OAuth"
                    : `Key: ${a.api_key.slice(0, 4)}••••${a.api_key.slice(-4)} · Secret: ••••••••`}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {!a.oauth_access_token && (
                  <button onClick={() => setEditing(a)} className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {deleting === a.id ? (
                  <button onClick={() => remove(a)} className="px-3 py-1.5 rounded-lg text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                    Confirm delete
                  </button>
                ) : (
                  <button onClick={() => setDeleting(a.id)} className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AccountForm
          account={editing === "new" ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {connectEnv && (
        <AlpacaConnectConsent
          isPaper={connectEnv === "paper"}
          onCancel={() => setConnectEnv(null)}
          onContinue={() => startAlpacaOAuth(connectEnv === "paper")}
        />
      )}
    </div>
  );
}