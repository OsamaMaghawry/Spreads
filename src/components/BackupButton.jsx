import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Download } from "lucide-react";

async function fetchAll(entity) {
  const all = [];
  let skip = 0;
  for (;;) {
    const page = await entity.list("-created_date", 500, skip);
    all.push(...page);
    if (page.length < 500) return all;
    skip += 500;
  }
}

export default function BackupButton() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const [accounts, trades] = await Promise.all([
        fetchAll(base44.entities.TradingAccount),
        fetchAll(base44.entities.TradeRecord)
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