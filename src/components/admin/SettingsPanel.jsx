import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import useAdminSettings from "@/lib/useAdminSettings";

// Operator switches. Each one changes what the product allows rather than how
// it looks, so each says plainly who it affects — a switch whose blast radius
// is unclear is one nobody dares touch.
const SWITCHES = [
  {
    key: "manual_api_keys",
    field: "manualApiKeys",
    label: "Manual API key entry",
    note:
      "Adds an \"Add manually\" button to Accounts, for pasting an Alpaca key and secret directly. " +
      "Administrators only — customers never see it, whether this is on or off — and saveAccount " +
      "refuses stored credentials while it is off. Keep it off unless you are testing against an " +
      "account the OAuth app can't reach."
  }
];

export default function SettingsPanel() {
  const { settings, loading, setSetting } = useAdminSettings();
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  const toggle = async (key, value) => {
    setSaving(key);
    setError("");
    try {
      await setSetting(key, value);
    } catch (err) {
      setError(err.message || "Couldn't save that setting.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-dm-sub">Loading…</div>;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}
      {SWITCHES.map((s) => (
        <div key={s.key} className="flex items-start gap-4 rounded-xl border border-dm-line bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-dm-text">{s.label}</div>
            <p className="mt-1 text-xs leading-relaxed text-dm-sub">{s.note}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 pt-0.5">
            {saving === s.key && <Loader2 className="h-4 w-4 animate-spin text-dm-sub" />}
            <Switch
              checked={settings[s.field] === true}
              disabled={saving === s.key}
              onCheckedChange={(v) => toggle(s.key, v)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
