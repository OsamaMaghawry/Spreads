import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Pencil, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { parseOCC } from "@/lib/occ";
import { dayChange, dayChangeLabel } from "@/lib/dayChange";
import useLiveSetup from "@/components/open/useLiveSetup";
import NumberField from "@/components/common/NumberField";
import { fmtMoney } from "@/lib/format";

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
  // Changing the price of a working order retires it at the broker and opens a
  // new one in its place. Without this case the retired order fell through to
  // "Working" below, so one live order showed as two — and both offered Cancel
  // and Change price, on an id that no longer exists.
  if (s === "replaced") return { key: "replaced", label: "Replaced", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  // Terminal states that are neither a fill nor a refusal. Each one used to
  // read as "Working" on an order that had stopped working.
  if (s === "done_for_day") return { key: "done", label: "Done for day", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (s === "stopped" || s === "suspended") return { key: "halted", label: "Halted", cls: "bg-amber-50 text-amber-800 border-amber-200" };
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

// An order is equity when none of what it was sent as parses as an OCC
// contract. A share order has one plain ticker; every option order, single or
// multi-leg, has symbols that parse.
//
// This decides three things that were all wrong on a share order: the words
// used to describe it ("single leg", "LEG"), the quote endpoint the price
// editor asks — which is why "Market now" was a dash on a stock that trades
// every second — and the multiplier on the total.
function isEquityOrder(order) {
  const symbols = (order.legs || []).map((l) => l.symbol).filter(Boolean);
  const all = symbols.length ? symbols : [order.symbol].filter(Boolean);
  return all.length > 0 && all.every((s) => !parseOCC(s));
}

export default function OrderGroup({ accountId, order, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Changing a resting limit in place. The broker replaces the order under a
  // new id; the parent refetches and this row is replaced by the new one.
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const state = stateOf(order);
  const live = state.key === "working" || state.key === "partial";
  const canReprice = live && order.type === "limit";

  // A price is chosen against something. While the editor is open the order's
  // own legs are requoted every second and the underlying streams, so the
  // number being typed sits beside the market it has to beat -- a bare $ box
  // asked the trader to guess. Off unless the editor is open: one socket and
  // one quote loop per order row is not a cost to pay for a closed panel.
  const isEquity = isEquityOrder(order);
  const asSetup = useMemo(
    () => ({
      ticker: order.ticker,
      legs: (order.legs || []).map((l) => ({
        symbol: l.symbol,
        // Legs of a multi-leg order carry their own quantity; the ratio is
        // what each contributes to one unit of the order.
        ratio: order.qty > 0 && l.qty > 0 ? l.qty / order.qty : 1,
        side: String(l.side || "").startsWith("sell") ? "sell" : "buy",
        // Without this the plain ticker was quoted on the options endpoint,
        // which answers nothing for a stock — so the editor showed
        // "Market now —" on TSLA while it was trading normally.
        ...(isEquity ? { assetClass: "equity" } : {})
      }))
    }),
    [order.ticker, order.legs, order.qty, isEquity]
  );
  const market = useLiveSetup(accountId, asSetup, editing);
  // The underlying's move today, from the previous close syncAccounts carries.
  const change = dayChange(market.spot || order.spot, order.prevClose);
  // spreadQuote answers in debits. A closing order pays one; an opening credit
  // order shows negative, and is named as the credit it is.
  const netNow = market.debitQuote?.mid ?? null;
  const marketLabel =
    netNow === null
      ? null
      // A share has a price, not a net debit or credit. Selling stock quotes as
      // a negative debit, so the sign is dropped and the word with it.
      : isEquity
        ? fmtMoney(Math.abs(netNow))
        : `${fmtMoney(netNow)} ${netNow < 0 ? "credit" : "debit"}`;

  const call = async (payload, fallback) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await invokeFunction("manageOrder", { accountId, orderId: order.id, ...payload });
      if (data?.error) throw new Error(data.error);
      onChanged?.();
      return true;
    } catch (e) {
      setError(e.message || fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => call({ action: "cancel" }, "Could not cancel the order.");

  const startEdit = () => {
    setPrice(order.limitPrice != null ? Math.abs(Number(order.limitPrice)).toFixed(2) : "");
    setEditing(true);
  };
  const reprice = async () => {
    const p = Number(price);
    if (!(p > 0)) { setError("Enter a price above zero."); return; }
    if (await call({ action: "replace", limitPrice: p }, "Could not change the price.")) setEditing(false);
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
          {change && (
            <span
              title={`${order.ticker} today, against yesterday's close of ${fmtMoney(order.prevClose)}`}
              className={`text-xs font-semibold tabular-nums ${change.up ? "text-emerald-600" : "text-rose-600"}`}
            >
              {dayChangeLabel(change)} <span className="font-normal text-slate-400">today</span>
            </span>
          )}
          <span className="text-sm text-slate-500">
            {/* A share order has no legs. "single leg · limit" on 5 shares of
                TSLA is options vocabulary applied to stock. */}
            {isEquity
              ? `${order.qty ?? ""} ${Math.abs(Number(order.qty)) === 1 ? "share" : "shares"}`.trim()
              : order.legs.length > 1
                ? `${order.legs.length} legs`
                : "single leg"} · {order.type}
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
            <span>{isEquity ? "Shares" : "Leg"}</span>
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
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {canReprice && !editing && (
                <button
                  onClick={startEdit}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Change price
                </button>
              )}
              {canReprice && editing && (
                <div className="w-full space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                    <span className="text-slate-500">
                      {order.ticker}{" "}
                      <span className={`font-semibold ${market.streaming ? "text-slate-900" : "text-slate-600"}`}>
                        {fmtMoney(market.spot || order.spot || 0)}
                      </span>
                      {market.streaming && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle animate-pulse" />}
                    </span>
                    <span className="text-slate-500">
                      Market now{" "}
                      <span className="font-semibold text-slate-900">{marketLabel || "—"}</span>
                    </span>
                    <span className="text-slate-500">
                      Your limit <span className="font-semibold text-slate-900">{money(order.limitPrice)}</span>
                    </span>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400 text-xs">$</span>
                  {/* The same −/+ control every other price field uses. A bare
                      number input renders no spinner at all on iOS Safari, so
                      on a phone the only way to move the price was to retype
                      the whole thing. */}
                  <NumberField
                    value={price}
                    onChange={setPrice}
                    step={0.01}
                    min={0.01}
                    ariaLabel="New limit price"
                    className="w-32"
                  />
                  <button
                    onClick={reprice}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Update
                  </button>
                  {/* "Keep $396.01" read as a second price to choose, sitting
                      beside a box holding that same number — and as plain text
                      it did not look clickable at all. It is one thing: leave
                      the order alone. */}
                  <button
                    onClick={() => setEditing(false)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-transparent text-slate-600 text-xs hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
                  >
                    Don&rsquo;t change
                  </button>
                </div>
                </div>
              )}
              <button
                onClick={cancel}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                {busy && !editing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Cancel order
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
