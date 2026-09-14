import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Send, Trash2 } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { parseOCC } from "@/lib/occ";
import useLiveSetup from "@/components/open/useLiveSetup";
import ConfirmAction from "@/components/common/ConfirmAction";
import { fmtMoney } from "@/lib/format";
import { deleteSavedOrder } from "@/lib/savedOrders";

// A ticket the trader wrote and chose not to send.
//
// THE ONE THING THIS CARD MUST NEVER DO is look like a working order. A saved
// order has no broker id, no queue position, no time priority, and cannot
// fill; a trader who believes otherwise is waiting on a fill that will never
// come, possibly while the position they wanted runs away from them. So it is
// visually the quietest thing in the list — no emerald border, no "Working" —
// it says SAVED in plain language, and the one sentence under the legs says it
// again in words rather than a badge.
//
// It is also listed BELOW the broker's own orders, never mixed in by time.

const money = (n) => (n === null || n === undefined ? "—" : `$${Math.abs(Number(n)).toFixed(2)}`);

const when = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function legDescription(symbol) {
  const occ = parseOCC(symbol);
  if (!occ) return symbol;
  return `${occ.ticker} ${occ.expiry} ${occ.strike}${occ.type}`;
}

export default function SavedOrderGroup({ accountId, saved, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const legs = saved.legs || [];
  const isEquity = Boolean(saved.is_equity);

  // The market, for the same reason the working card shows it: a saved limit
  // is a decision made at some point in the past, and the only way to judge it
  // is against what the market is doing now. A price from last Tuesday shown
  // on its own reads as a live judgement.
  const asSetup = useMemo(
    () => ({
      ticker: saved.ticker,
      legs: legs.map((l) => ({
        symbol: l.symbol,
        ratio: l.ratio ?? 1,
        side: String(l.side || "").startsWith("sell") ? "sell" : "buy",
        ...(isEquity ? { assetClass: "equity" } : {})
      }))
    }),
    [saved.ticker, legs, isEquity]
  );
  const market = useLiveSetup(accountId, asSetup, open);
  const netNow = market.debitQuote?.mid ?? null;
  const marketLabel =
    netNow === null
      ? null
      : isEquity
        ? fmtMoney(Math.abs(netNow))
        : `${fmtMoney(netNow)} ${netNow < 0 ? "credit" : "debit"}`;

  // Sending is the ordinary open path with the stored legs handed over
  // unchanged — no rebuild, so a leg cannot be dropped or a ratio inverted on
  // the way out. `openPosition` re-runs its own preflight, which is the point:
  // a ticket saved last week has not been checked against today's market, and
  // the checks that refuse a bad order are the same ones a fresh ticket faces.
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await invokeFunction("openPosition", {
        accountId,
        legs: legs.map((l) => ({ symbol: l.symbol, side: l.side, ratio: l.ratio ?? 1 })),
        qty: Number(saved.qty),
        orderType: saved.order_type === "market" ? "market" : "limit",
        ...(saved.order_type === "limit" && saved.limit_price !== null
          ? { limitPrice: Number(saved.limit_price) }
          : {})
      });
      if (data?.error) throw new Error(data.error);
      // Sent: the ticket has become a real order, so it stops being a saved
      // one. Leaving it would show the same trade twice, once as working and
      // once as saved, and invite sending it a second time.
      await deleteSavedOrder(saved.id);
      onChanged?.();
    } catch (e) {
      setError(`${e.message || "Could not send it."} It is still saved here — nothing was lost.`);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSavedOrder(saved.id);
      onChanged?.();
    } catch (e) {
      setError(e.message || "Could not delete it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-dashed border-slate-300 rounded-xl bg-slate-50/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-100/70 transition-colors"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <span className="font-semibold text-slate-900">{saved.ticker || "—"}</span>
          <span className="text-sm text-slate-500">
            {isEquity
              ? `${saved.qty} ${Math.abs(Number(saved.qty)) === 1 ? "share" : "shares"}`
              : legs.length > 1
                ? `${legs.length} legs`
                : "single leg"}{" "}
            · {saved.order_type}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300">
            Saved
          </span>
          {!isEquity && saved.limit_price !== null && (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                saved.net_is_credit
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              {saved.net_is_credit ? "Credit" : "Debit"}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-5 shrink-0">
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">
              {saved.order_type === "limit" ? "Limit" : "Price"}
            </span>
            <span className="text-sm tabular-nums text-slate-700">
              {saved.order_type === "limit" ? money(saved.limit_price) : "Market"}
            </span>
          </div>
          <div className="text-right hidden sm:block">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">Saved</span>
            <span className="text-sm tabular-nums text-slate-700">{when(saved.created_at)}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-3.5 pb-3">
          <div className="grid grid-cols-[minmax(0,1fr)_56px] gap-3 py-2 text-[10px] uppercase tracking-wide text-slate-400">
            <span>{isEquity ? "Shares" : "Leg"}</span>
            <span className="text-right">Ratio</span>
          </div>
          {legs.map((leg, i) => (
            <div
              key={leg.symbol || i}
              className="grid grid-cols-[minmax(0,1fr)_56px] gap-3 py-2 border-t border-slate-200 text-xs tabular-nums items-center"
            >
              <span className="min-w-0">
                <span
                  className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded mr-2 ${
                    String(leg.side).startsWith("sell")
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-indigo-50 text-indigo-700"
                  }`}
                >
                  {leg.side}
                </span>
                <span className="text-slate-700">{legDescription(leg.symbol)}</span>
              </span>
              <span className="text-right text-slate-600">{leg.ratio ?? 1}</span>
            </div>
          ))}

          {/* Said in words, not only as a badge. This is the sentence that
              stops a trader waiting for a fill that cannot happen. */}
          <p className="mt-2.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
            Your broker does not know about this order. It is not working, it holds no place in the
            queue, and it cannot fill until you send it.
            {saved.from_broker_order_id ? " It was working until you saved it." : ""}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs tabular-nums">
            <span className="text-slate-500">
              {saved.ticker}{" "}
              <span className={`font-semibold ${market.streaming ? "text-slate-900" : "text-slate-600"}`}>
                {fmtMoney(market.spot || 0)}
              </span>
              {market.streaming && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle animate-pulse" />
              )}
            </span>
            <span className="text-slate-500">
              Market now <span className="font-semibold text-slate-900">{marketLabel || "—"}</span>
            </span>
            {saved.order_type === "limit" && (
              <span className="text-slate-500">
                Your saved limit <span className="font-semibold text-slate-900">{money(saved.limit_price)}</span>
              </span>
            )}
          </div>

          {error && (
            <p className="mt-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <ConfirmAction
              label="Send to market"
              tone="go"
              icon={<Send className="w-3.5 h-3.5" />}
              question={`This sends the order to your broker now, at ${
                saved.order_type === "limit" ? `a limit of ${money(saved.limit_price)}` : "the market price"
              }. It can fill immediately. The checks that refuse a bad order run again before it goes.`}
              confirmLabel="Send it"
              onConfirm={send}
              busy={busy}
            />
            <ConfirmAction
              label="Delete"
              tone="danger"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              question="This throws the saved ticket away. Nothing is sent and nothing is cancelled — there is no order at the broker to affect."
              confirmLabel="Delete it"
              onConfirm={discard}
              busy={busy}
            />
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
        </div>
      )}
    </div>
  );
}
