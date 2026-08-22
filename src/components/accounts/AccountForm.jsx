import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function AccountForm({ account, onSave, onCancel }) {
  // Stored credentials are encrypted and never sent to the browser, so the key
  // fields always start empty. On an existing account, leaving them empty keeps
  // whatever is already stored — only a filled-in pair replaces it.
  const [form, setForm] = useState({
    name: account?.name || "",
    api_key: "",
    api_secret: "",
    is_paper: account?.is_paper || false,
    spreads_client_prefix: account?.spreads_client_prefix || "",
    wheel_client_prefix: account?.wheel_client_prefix || ""
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const bothKeysOrNeither =
    (form.api_key.trim() && form.api_secret.trim()) ||
    (account && !form.api_key.trim() && !form.api_secret.trim());
  const valid = form.name.trim() && bothKeysOrNeither;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    await onSave(form);
  };

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-900">{account ? "Edit account" : "Add Alpaca account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Account name</label>
            <input value={form.name} onChange={set("name")} placeholder="e.g. Alton Live" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">API Key ID</label>
            <input
              value={form.api_key}
              onChange={set("api_key")}
              placeholder={account ? `${account.api_key_hint || "stored"} — leave blank to keep` : ""}
              className={inputCls}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">API Secret Key</label>
            <input
              type="password"
              value={form.api_secret}
              onChange={set("api_secret")}
              placeholder={account ? "Leave blank to keep the stored secret" : ""}
              className={inputCls}
              autoComplete="off"
            />
          </div>
          {account && (
            <p className="text-xs text-slate-500 -mt-1">
              Stored credentials are encrypted and can't be displayed. Fill in both fields to replace them.
            </p>
          )}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="text-xs font-medium text-slate-700">Strategy client order id prefixes</div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Spreads prefix</label>
              <input value={form.spreads_client_prefix} onChange={set("spreads_client_prefix")} placeholder="e.g. 0DTE_Alton_LIVE_Options" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Wheel prefix</label>
              <input value={form.wheel_client_prefix} onChange={set("wheel_client_prefix")} placeholder="e.g. Alton_Live_WHEEL_3DAY" className={inputCls} />
            </div>
          </div>
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <div>
              <div className="text-sm text-slate-900">Paper trading</div>
              <div className="text-xs text-slate-500">Use Alpaca's paper (demo) endpoint</div>
            </div>
            <Switch checked={form.is_paper} onCheckedChange={(v) => setForm({ ...form, is_paper: v })} />
          </div>
          <button
            onClick={submit}
            disabled={!valid || saving}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : account ? "Save changes" : "Add account"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}