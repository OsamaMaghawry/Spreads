import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

export default function AccountForm({ account, allowCredentials = false, onSave, onCancel }) {
  // Stored credentials are encrypted and never sent to the browser, so the key
  // fields always start empty. On an existing account, leaving them empty keeps
  // whatever is already stored — only a filled-in pair replaces it.
  const [form, setForm] = useState({
    name: account?.name || "",
    api_key: "",
    api_secret: "",
    is_paper: account?.is_paper || false
  });
  const [saving, setSaving] = useState(false);

  // An OAuth account has no API key of ours to edit, and its live/paper nature
  // was established by which Alpaca trading endpoint answered the token — not
  // by a preference. So the only things worth showing are the name (Alpaca
  // doesn't expose the nickname you gave the account, so this is where "OS-LIVE"
  // gets typed) and the client-order-id prefixes.
  const isOAuth = !!account?.is_oauth;

  // Manual key entry is an admin-only switch that is off by default, so most of
  // the time there is no key field to render at all. An account keyed before
  // the switch existed is still renameable — saveAccount only gates the
  // credentials themselves.
  const showKeyFields = allowCredentials && !isOAuth;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const bothKeysOrNeither =
    !showKeyFields ||
    (form.api_key.trim() && form.api_secret.trim()) ||
    (account && !form.api_key.trim() && !form.api_secret.trim());
  const valid = form.name.trim() && bothKeysOrNeither;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      toast({ title: "Couldn't save account", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
            <input value={form.name} onChange={set("name")} placeholder="e.g. Main Live" className={inputCls} />
            {isOAuth && (
              <p className="text-xs text-slate-500 mt-1.5">
                Alpaca doesn't send the nickname you gave this account, so it arrives as its
                account number. Rename it to whatever you call it there.
              </p>
            )}
          </div>
          {showKeyFields && (
            <>
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
            </>
          )}
          {account && !isOAuth && !showKeyFields && (
            <p className="text-xs text-slate-500 -mt-1">
              This account's stored API key stays as it is — manual key entry is switched off.
            </p>
          )}
          {/* Nothing to decide for an OAuth account: live or paper was settled
              by which Alpaca endpoint answered the token, and the account list
              already carries the badge. A disabled switch would only invite the
              question of why it can't be moved. */}
          {!isOAuth && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <div>
                <div className="text-sm text-slate-900">Paper trading</div>
                <div className="text-xs text-slate-500">Use Alpaca's paper (demo) endpoint</div>
              </div>
              <Switch checked={form.is_paper} onCheckedChange={(v) => setForm({ ...form, is_paper: v })} />
            </div>
          )}
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