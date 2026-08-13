import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import AccountForm from "@/components/accounts/AccountForm";

export default function Accounts() {
  const [accounts, setAccounts] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | account
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setAccounts(await base44.entities.TradingAccount.list("-created_date"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    if (editing === "new") await base44.entities.TradingAccount.create(form);
    else await base44.entities.TradingAccount.update(editing.id, form);
    setEditing(null);
    load();
  };

  const remove = async (account) => {
    await base44.entities.TradingAccount.delete(account.id);
    setDeleting(null);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Alpaca API credentials for the accounts shown on the monitor.</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm hover:bg-emerald-500/25 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add account
        </button>
      </div>

      {accounts === null ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-[#111725] border border-white/[0.06] rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <KeyRound className="w-8 h-8 text-slate-600" />
          <p className="text-slate-400 text-sm">No accounts yet — add your first Alpaca account.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="bg-[#111725] border border-white/[0.06] rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-white">{a.name}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    a.is_paper ? "bg-sky-500/10 text-sky-400 border-sky-500/25" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  }`}>
                    {a.is_paper ? "Paper" : "Live"}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1 truncate">
                  Key: {a.api_key.slice(0, 4)}••••{a.api_key.slice(-4)} · Secret: ••••••••
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => setEditing(a)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                {deleting === a.id ? (
                  <button onClick={() => remove(a)} className="px-3 py-1.5 rounded-lg text-xs bg-rose-500/15 text-rose-400 border border-rose-500/25 hover:bg-rose-500/25 transition-colors">
                    Confirm delete
                  </button>
                ) : (
                  <button onClick={() => setDeleting(a.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
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
    </div>
  );
}