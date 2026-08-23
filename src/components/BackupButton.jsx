import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Download } from "lucide-react";
import { SAFE_ACCOUNT_COLUMNS } from "@/lib/accountColumns";

// Downloads the signed-in user's own rows as JSON. Row-level security scopes
// every read to them, so this exports their data and nobody else's.
async function fetchAll(table, columns = "*") {
  const all = [];
  let skip = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("created_at", { ascending: false })
      .range(skip, skip + 499);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 500) return all;
    skip += 500;
  }
}

export default function BackupButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const [accounts, trades] = await Promise.all([
        // Credential columns are revoked from the browser (migration 0004), so
        // this asks for the readable ones by name — "*" is rejected outright.
        // Encrypted keys could not be restored from a backup anyway.
        fetchAll("trading_accounts", SAFE_ACCOUNT_COLUMNS),
        fetchAll("trade_records")
      ]);
      const backup = {
        exported_at: new Date().toISOString(),
        app: "DeltaMint",
        note: "Brokerage credentials are excluded — reconnect each account after a restore.",
        trading_accounts: accounts,
        trade_records: trades
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deltamint-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={download}
        disabled={busy}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        <Download className="w-4 h-4" /> {busy ? "Preparing…" : "Backup data"}
      </button>
      {error && <div className="text-xs text-rose-600 mt-1.5 max-w-xs">{error}</div>}
    </div>
  );
}
