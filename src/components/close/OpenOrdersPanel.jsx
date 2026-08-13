import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function OpenOrdersPanel({ accountId, orders, onChange }) {
  const [cancelingId, setCancelingId] = useState(null);
  const [error, setError] = useState(null);

  const cancel = async (id) => {
    setCancelingId(id);
    setError(null);
    try {
      await base44.functions.invoke("manageOrder", { accountId, orderId: id, action: "cancel" });
      onChange(orders.filter((o) => o.id !== id));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
        <AlertTriangle className="w-4 h-4" /> Open order{orders.length > 1 ? "s" : ""} on this spread
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        A working order is already holding these contracts. Cancel it below before placing a new close order.
      </p>
      {orders.map((o) => (
        <div key={o.id} className="flex items-center gap-3 bg-[#0A0E16] border border-white/[0.06] rounded-lg px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="text-slate-200 capitalize tabular-nums">
              {o.type} · qty {o.qty}{o.limitPrice ? ` · $${o.limitPrice}` : ""}
            </div>
            <div className="text-slate-500">
              {o.status}{o.submittedAt ? ` · submitted ${new Date(o.submittedAt).toLocaleTimeString()}` : ""}
            </div>
          </div>
          <button
            onClick={() => cancel(o.id)}
            disabled={cancelingId === o.id}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
          >
            {cancelingId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel order"}
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}