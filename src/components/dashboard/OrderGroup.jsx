import { useMemo, useState } from "react";
import { ChevronRight, Loader2, Pencil, X, BookmarkPlus } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { parseOCC } from "@/lib/occ";
import { dayChange, dayChangeLabel } from "@/lib/dayChange";
import useLiveSetup from "@/components/open/useLiveSetup";
import NumberField from "@/components/common/NumberField";
import ConfirmAction from "@/components/common/ConfirmAction";
import { fmtMoney } from "@/lib/format";
import { orderNetKind, saveRefusalFor } from "@/lib/orderNet";
import { saveOrder } from "@/lib/savedOrders";
import { toast } from "@/components/ui/use-toast";

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

export default function OrderGroup({ accountId, order, onChanged, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Not an error: something the user should know about how their instruction
  // was carried out.
  const [note, setNote] = useState(null);
  // Changing a resting limit in place. The broker replaces the order under a
  // new id; the parent refetches and this row is replaced by the new one.
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const state = stateOf(order);
  // Pulling a working order off the market and keeping the ticket.
  const [saving, setSaving] = useState(false);
  const live = state.key === "working" || state.key === "partial";
  const canReprice = live && order.type === "limit";

  // THE MARKET IS SHOWN WITHOUT ASKING FOR IT. The owner: *"I want to show the
  // current market outside, doesn't have to be when I click Change order."*
  //
  // He is right, and the reason is not convenience. A resting limit is only
  // meaningful next to what the market is doing -- $2.49 is a good price or a
  // stale one depending entirely on a number that was hidden behind a button.
  // A trader scanning working orders to decide which needs attention had to
  // open the price editor on every one of them to find out, and opening the
  // editor is one keystroke away from changing the order.
  //
  // So the quote loop follows the ROW being open rather than the editor. Still
  // not always-on: a collapsed row costs nothing, which is what keeps a page of
  // twenty orders from holding twenty sockets.
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
  const market = useLiveSetup(accountId, asSetup, open && live);
  // Which way the money goes on THIS order, by its own instruction rather than
  // by the live quote -- the badge describes the order, not the market.
  const netSide = orderNetKind(order, isEquity);

  // CAN THIS ORDER BE PARKED AT ALL, decided BEFORE the button is drawn.
  //
  // A CLOSING ORDER CAN, now. It could not for one release, and the owner was
  // right to push back: *"I need anything to be saved for later."* The refusal
  // was never about exits being unsafe to park — it was that every saved
  // ticket reopened through the OPEN dialog, where `openPosition` stamps each
  // leg `*_to_open`. That was a routing defect wearing a product rule's
  // clothes. A closing ticket now reopens in the CLOSE dialog against the
  // position it belongs to, and `intent` is stored per leg so the two can
  // never be confused.
  //
  // The owner, on a working closing order: *"I clicked save it for later first
  // time, and it didn't give me any status ... Then I clicked again, it gave me
  // the attached message. Somehow it's confusing."*
  //
  // He is describing an offer we had no intention of honouring. The button was
  // live on an order that can never be saved, the confirmation asked him to
  // commit to it, and only the SECOND click -- the one that means yes -- came
  // back with a red refusal. The check existed; it just ran after he had
  // agreed to something. A control that cannot work must not be presented as
  // one that can, and the reason belongs beside it rather than behind it.
  const saveRefusal = saveRefusalFor(order);
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
        // THE WORD CARRIES THE DIRECTION, so the sign must not. This printed
        // "-$1.20 credit" -- the minus and the word saying the same thing
        // twice, and contradicting each other to anyone who reads the minus as
        // "less than nothing". `orderNet.js` states the rule and returns an
        // unsigned amount for exactly this reason; the strip was formatting
        // the raw quote instead.
        : `${fmtMoney(Math.abs(netNow))} ${netNow < 0 ? "credit" : "debit"}`;

  const call = async (payload, fallback) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { data } = await invokeFunction("manageOrder", { accountId, orderId: order.id, ...payload });
      if (data?.error) throw new Error(data.error);
      // The broker would not change the price in place, so the server cancelled
      // and sent a new order instead. That is a different act from a replace --
      // there is a moment where no order exists, and if part of the original
      // filled first the new one is smaller. Both are said out loud rather than
      // presented as an ordinary reprice.
      if (data?.viaCancel) {
        setNote(
          data.filledBefore > 0
            ? `The broker would not change the price in place, so the order was cancelled and replaced. ${data.filledBefore} filled before that, and the new order covers only the rest.`
            : "The broker would not change the price in place, so the order was cancelled and a new one sent at your price."
        );
      }
      if (data?.note) setNote(data.note);
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

  // PRIVATE = OFF THE MARKET, KEPT AS A TICKET. The owner: *"I want to have an
  // option of making the order Private, it's there but not in the market,
  // something as (Save for Later)."*
  //
  // For an order ALREADY WORKING that is two acts, and the order matters. The
  // broker cancellation goes FIRST and the ticket is only stored if it
  // succeeds: save-then-cancel would, on a failed cancel, leave a saved copy
  // beside a live order the trader now believes is parked -- one ticket, two
  // places, one of them able to fill.
  //
  // A partial fill is a refusal, not a warning. There is no honest way to park
  // "the rest" of an order that has already bought some: the saved ticket would
  // carry the original quantity and re-open what was just filled.
  const savePrivate = async () => {
    // The button is not rendered when `saveRefusal` is set, so reaching here
    // with one means the order changed under the trader between render and
    // click. Kept as the last line rather than the first.
    if (saveRefusal) {
      setError(saveRefusal);
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const { data } = await invokeFunction("manageOrder", { accountId, orderId: order.id, action: "cancel" });
      if (data?.error) throw new Error(data.error);

      // THE CANCEL IS CONFIRMED BEFORE THE TICKET IS WRITTEN. Alpaca's DELETE
      // means ACCEPTED, not done -- `useOpenOrder.ensureCanceled` polls for
      // exactly this reason, and `manageOrder` does the same on its replace
      // path. Without it a cancel racing a fill produces the worst outcome
      // this card can produce: the order fills, the row is written anyway, and
      // the card tells the trader it "cannot fill" about a position they now
      // hold. The stale `filledQty` check above cannot catch that; it reads
      // the last sync, which is seconds old.
      let settled = null;
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 400));
        const { data: st } = await invokeFunction("manageOrder", { accountId, orderId: order.id, action: "get" });
        const status = String(st?.status || "").toLowerCase();
        if (["canceled", "cancelled", "expired", "filled", "rejected", "done_for_day"].includes(status)) {
          settled = { status, filledQty: Number(st?.filledQty) || 0 };
          break;
        }
      }
      if (!settled) {
        setError("The cancellation was accepted but your broker has not confirmed it yet, so nothing was saved. Check the Orders list in a moment — if it is gone, build the ticket again from Open Position.");
        return;
      }
      if (settled.status === "filled" || settled.filledQty > 0) {
        setError(
          settled.status === "filled"
            ? "This order filled before the cancellation reached your broker, so it was not saved. You hold the position — it is on the Positions tab."
            : `${settled.filledQty} of ${order.qty} filled before the cancellation reached your broker, so nothing was saved. You hold what filled.`
        );
        onChanged?.();
        return;
      }

      await saveOrder({
        accountId,
        ticker: order.ticker,
        legs: (order.legs || []).map((l) => ({
          symbol: l.symbol,
          side: String(l.side || "").startsWith("sell") ? "sell" : "buy",
          // Alpaca's `ratio_qty` is an integer. The division is exact for every
          // structure this product writes, but a float reaching an integer
          // field is a defect waiting for the first ratio that is not.
          ratio: Math.max(1, Math.round(order.qty > 0 && l.qty > 0 ? l.qty / order.qty : 1)),
          intent: l.intent || null
        })),
        qty: Number(order.qty),
        limitPrice: order.limitPrice,
        orderType: order.type === "market" ? "market" : "limit",
        netIsCredit: netSide ? netSide.kind === "credit" : false,
        fromBrokerOrderId: order.id
      });
      // A TOAST, NOT A NOTE ON THIS CARD, and that is the owner's other
      // complaint. On success the order is cancelled at the broker, so the
      // parent refetches and this row -- the one holding the note -- stops
      // being a working order and is replaced. The confirmation was written
      // into a component that was about to be unmounted, which is precisely
      // why he saw nothing and could not tell whether it had worked.
      toast({
        title: "Saved for later",
        description: `${order.ticker} is off the market and saved. Your broker no longer has it, and it cannot fill. Find it under "Saved for later" in this account's Orders tab.`
      });
      setNote("Taken off the market and saved. It is under “Saved for later” below.");
      onSaved?.();
      onChanged?.();
    } catch (e) {
      setError(
        `Could not save it for later: ${e.message}. Check the Orders list before trying again — the order may already be cancelled.`
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setPrice(order.limitPrice != null ? Math.abs(Number(order.limitPrice)).toFixed(2) : "");
    setEditing(true);
  };
  const reprice = async () => {
    const p = Number(price);
    if (!(p > 0)) { setError("Enter a price above zero."); return; }
    if (await call({ action: "replace", limitPrice: p }, "Could not change the price.")) setEditing(false);
  };

  // The market, as its own thing, above the buttons. It was previously nested
  // inside the price editor, which is why it only existed while repricing.
  const marketStrip = (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs tabular-nums">
      <span className="text-slate-500">
        {order.ticker}{" "}
        <span className={`font-semibold ${market.streaming ? "text-slate-900" : "text-slate-600"}`}>
          {fmtMoney(market.spot || order.spot || 0)}
        </span>
        {market.streaming && (
          <span
            title="Streaming"
            className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle animate-pulse"
          />
        )}
      </span>
      <span className="text-slate-500">
        Market now <span className="font-semibold text-slate-900">{marketLabel || "—"}</span>
      </span>
      {order.type === "limit" && (
        <span className="text-slate-500">
          Your limit{" "}
          <span className="font-semibold text-slate-900">
            {money(order.limitPrice)}
            {netSide ? <span className="font-normal text-slate-500"> {netSide.kind}</span> : null}
          </span>
        </span>
      )}
    </div>
  );

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
          {/* DEBIT OR CREDIT, options only, at the owner's word. Which way the
              money goes is the first thing a trader wants from an order row
              and it was nowhere on the card -- a bare "$2.49" says nothing
              about whether that is coming in or going out.

              `orderNetKind` is the only place that decides this, because the
              rule is not "read the sign": Alpaca signs a MULTI-LEG net and
              does not sign a single-leg one, so a lone short put carries a
              POSITIVE limit and is still a credit. Shares get no word at all —
              selling stock is a sale, not a credit. */}
          {netSide && (
            <span
              title={netSide.kind === "credit"
                ? "You receive this if the order fills."
                : "You pay this if the order fills."}
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                netSide.kind === "credit"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              {netSide.label}
            </span>
          )}
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

          {note && (
            <p className="mt-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">{note}</p>
          )}

          {live && saveRefusal && (
            <p className="mt-2.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
              <span className="font-medium text-slate-700">Cannot be saved for later.</span> {saveRefusal}
            </p>
          )}

          {live && marketStrip}

          {live && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {canReprice && !editing && (
                <ConfirmAction
                  label="Change price"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  question="Open the price editor? Nothing changes at your broker until you press Update."
                  confirmLabel="Open the editor"
                  onConfirm={startEdit}
                  busy={busy}
                />
              )}
              {canReprice && editing && (
                <div className="w-full space-y-2">
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
              {!editing && !saveRefusal && (
                <ConfirmAction
                  label="Save for later"
                  tone="neutral"
                  icon={<BookmarkPlus className="w-3.5 h-3.5" />}
                  question="This takes the order off the market at your broker and keeps it here as a saved ticket. It will not fill, and nothing happens to it until you open it again."
                  confirmLabel="Take it off the market"
                  onConfirm={savePrivate}
                  busy={saving}
                />
              )}
              <ConfirmAction
                label="Cancel order"
                tone="danger"
                icon={<X className="w-3.5 h-3.5" />}
                question={`This order stops working at your broker and nothing more fills.${
                  Number(order.filledQty) > 0
                    ? ` ${order.filledQty} of ${order.qty} has already filled and that stays — you keep what filled.`
                    : " Nothing has filled, so this leaves you with no position from it."
                } Cancelling does not save it; use Save for later to keep the ticket.`}
                confirmLabel="Cancel it at the broker"
                onConfirm={cancel}
                busy={busy && !editing}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
