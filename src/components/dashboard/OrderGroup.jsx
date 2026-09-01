import { useState } from "react";
import { ChevronRight, Loader2, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { parseOCC } from "@/lib/occ";

// One broker order, with the legs it was sent as.
//
// A multi-leg order arrives from Alpaca as one object with a legs array, and
// that is how it is shown: one row for the order, the legs underneath. Listing
// legs flat would ask the reader to re-pair them by eye -- the same guessing
// that produced invented spreads in the history reconstruction.

const money = (n) =>
  n === null || n === undefined ? "—" : `$${Math.abs(Number(n)).toFixed(2)}`;

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");

// Working, done, and refused each need a different colour and a different set
// of actions, so the state is resolved once here rather than at each use.
function stateOf(order) {
  const s = String(order.status || "").toLowerCase();
  if (s === "filled") return { key: "filled", label: "Filled", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "rejected") return { key: "rejected", label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (s === "canceled" || s === "cancelled") return { key: "canceled", label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (s === "expired") return { key: "expired", label: "Expired", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (order.progress > 0 && order.progress < 1) {
    return { key: "partial", label: `Partial ${order.filledQty} of ${order.qty}`, cls: "bg-amber-50 text-amber-800 border-amber-200" };
  }
  return { key: "working", label: "Working", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

// "Buy to close" reads better than "buy", and the intent is what tells a reader
// whether this order was opening risk or removing it.
function sideLabel(leg) {
  const side = String(leg.side || "").replace("_", " ");
  if (!leg.intent) return side;
  return leg.intent.replace(/_/g, " ");
}

function legDescription(symbol) {
  const occ = parseOCC(symbol);
  if (!occ) return symbol;
  return `${occ.ticker} ${occ.expiry} ${occ.strike}${occ.type}`;
}

export default function OrderGroup({ accountId, order, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const state = stateOf(order);
  const live = state.key === "working" || state.key === "partial";

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeFunction("manageOrder", { accountId, orderId: order.id, action: "cancel" });
      if (res?.error) throw new Error(res.error);
      onChanged?.();
    } catch (e) {
      setError(e.message || "Could not cancel the order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`border rounded-xl bg-white overflow-hidden ${live ? "border-emerald-200" : "border-slate-200"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <span className="font-semibold text-slate-900">{order.ticker || "—"}</span>
          <span className="text-sm text-slate-500">
            {order.legs.length > 1 ? `${order.legs.length} legs` : "single leg"} · {order.type}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${state.cls}`}>
            {state.label}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-5 shrink-0">
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">
              {order.type === "limit" ? "Limit" : "Price"}
            </span>
            <span className="text-sm tabular-nums text-slate-700">
              {order.type === "limit" ? money(order.limitPrice) : money(order.filledAvgPrice)}
            </span>
          </div>
          <div className="text-right hidden sm:block">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">Sent</span>
            <span className="text-sm tabular-nums text-slate-700">{time(order.submittedAt)}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 pb-3">
          <div className="grid grid-cols-[minmax(0,1fr)_56px_72px_80px] gap-3 py-2 text-[10px] uppercase tracking-wide text-slate-400">
            <span>Leg</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Filled</span>
            <span className="text-right">Avg</span>
          </div>
          {order.legs.map((leg) => (
            <div
              key={leg.id || leg.symbol}
              className="grid grid-cols-[minmax(0,1fr)_56px_72px_80px] gap-3 py-2 border-t border-slate-100 text-xs tabular-nums items-center"
            >
              <span className="min-w-0">
                <span
                  className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded mr-2 ${
                    String(leg.side).startsWith("sell")
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-indigo-50 text-indigo-700"
                  }`}
                >
                  {sideLabel(leg)}
                </span>
                <span className="text-slate-700">{legDescription(leg.symbol)}</span>
              </span>
              <span className="text-right text-slate-600">{leg.qty ?? "—"}</span>
              <span className={`text-right ${leg.filledQty ? "text-slate-900" : "text-slate-400"}`}>
                {leg.filledQty ?? 0}
              </span>
              <span className="text-right text-slate-600">{money(leg.filledAvgPrice)}</span>
            </div>
          ))}

          {order.progress > 0 && order.progress < 1 && (
            <div className="mt-2.5 h-1 rounded bg-slate-200 overflow-hidden" role="presentation">
              <div className="h-full bg-amber-500 rounded" style={{ width: `${Math.round(order.progress * 100)}%` }} />
            </div>
          )}

          {order.rejectReason && (
            <p className="mt-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              Broker refused this order: {order.rejectReason}
            </p>
          )}

          {error && (
            <p className="mt-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {live && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={cancel}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Cancel order
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
