import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Download } from "lucide-react";

async function fetchAll(table) {
  const all = [];
  let skip = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
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

  const download = async () => {
    setBusy(true);
    try {
      const [accounts, trades] = await Promise.all([
        fetchAll("trading_accounts"),
        fetchAll("trade_records")
      ]);
      const backup = {
        exported_at: new Date().toISOString(),
        app: "OptiFlow Trading",
        trading_accounts: accounts,
        trade_records: trades
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `optiflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={busy}
      className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
    >
      <Download className="w-4 h-4" /> {busy ? "Preparing…" : "Backup data"}
    </button>
  );
}