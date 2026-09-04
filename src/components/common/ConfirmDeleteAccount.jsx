import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Disconnecting an account, with what that actually costs said out loud.
//
// This used to be a two-step inline button: a trash icon that turned into
// "Confirm delete" in the same spot, so a second click landing where the first
// one did completed it. That is a mis-tap away from an irreversible action, and
// it never said what would be lost.
//
// What it costs is more than the connection. `trading_accounts` is the parent of
// trade_records, stock lots, history snapshots, alerts, order_attempts and the
// broker feed dumps, all `on delete cascade` -- so removing an account takes its
// entire reconstructed history with it, and reconnecting the same brokerage
// account later does not bring any of it back.
//
// What it does NOT do is equally worth stating: nothing is sold, cancelled or
// moved at the broker. Positions carry on exactly as they are; DeltaMint simply
// stops looking at them.
export default function ConfirmDeleteAccount({ account, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(account);
    } catch (e) {
      setError(e?.message || "Could not remove the account.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remove {account.name}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="space-y-1.5 text-xs leading-relaxed text-rose-900">
              <p className="font-semibold">This cannot be undone.</p>
              <p>
                Removing this account also deletes everything DeltaMint has built from it:
                its trade history, closed-trade records, share lots, analysis snapshots and
                alerts. Reconnecting the same brokerage account later will not bring them back.
              </p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-600">
            Nothing happens at your broker. No position is sold, no order is cancelled, and
            no money moves — DeltaMint just stops reading this account.
          </p>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {busy ? "Removing…" : "Remove account"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
