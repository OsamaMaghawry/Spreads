import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function AccountForm({ account, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: account?.name || "",
    api_key: account?.api_key || "",
    api_secret: account?.api_secret || "",
    is_paper: account?.is_paper || false
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const valid = form.name.trim() && form.api_key.trim() && form.api_secret.trim();

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
            <input value={form.api_key} onChange={set("api_key")} className={inputCls} autoComplete="off" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">API Secret Key</label>
            <input type="password" value={form.api_secret} onChange={set("api_secret")} className={inputCls} autoComplete="off" />
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