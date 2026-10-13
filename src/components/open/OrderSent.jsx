import { useState, useEffect } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import OrderLog from "@/components/close/OrderLog";
import NumberField from "@/components/common/NumberField";

// The one screen after an order reaches the broker and rests there.
//
// The owner: "Why it's just one thing saying submitted as a success?" and,
// on the first version of this card: "Why too many buttons. Change price and
// Update price??!!!" So: the card says the order was sent, the price sits in
// it as a field, and there is one button -- Done -- until the price is
// changed, when a second appears to send the change. Done closes the ticket
// and leaves the order working. The raw log is folded away under Details.

const money = (v) => `$${Math.abs(v).toFixed(2)}`;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default function OrderSent({ price, priced = "credit", size, accountName, timeInForce, quote, onUpdate, onDone, log, phase }) {
  const [draft, setDraft] = useState(price === null || price === undefined ? "" : Number(price).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(false);

  // A replace that went through moves the resting price; the field follows.
  useEffect(() => {
    if (typeof price === "number") setDraft(price.toFixed(2));
  }, [price]);

  const next = Math.round(Number(draft) * 100) / 100;
  const changed = typeof price === "number" && Number.isFinite(next) && next > 0 && Math.abs(next - Math.abs(price)) >= 0.005;

  const update = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(next);
    } catch (e) {
      setError(e.message || "Could not change the price.");
    } finally {
      setBusy(false);
    }
  };

  const bid = num(quote?.bid);
  const ask = num(quote?.ask);
  const mid = num(quote?.mid) ?? (bid !== null && ask !== null ? (bid + ask) / 2 : null);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Order sent
        </div>
        <p className="text-xs text-emerald-900">
          Working at your broker: {size}{accountName ? ` on ${accountName}` : ""}.
        </p>

        {onUpdate && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium text-emerald-900">Limit {priced}</span>
            <NumberField value={draft} onChange={setDraft} step={0.01} min={0.01} ariaLabel={`Limit ${priced}`} className="w-40 bg-white" />
            {bid !== null && ask !== null && (
              <span className="text-[11px] tabular-nums text-emerald-800/80">
                bid {money(bid)} · mid {money(mid)} · ask {money(ask)}
              </span>
            )}
          </div>
        )}

        <ul className="list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-emerald-900">
          <li>It fills when the market reaches your price.</li>
          <li>
            {timeInForce === "gtc"
              ? "It stays open until it fills or you cancel it."
              : "If it has not filled by today's close, it expires."}
          </li>
          <li>To cancel it later: the account&rsquo;s Orders tab.</li>
        </ul>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <div className="flex gap-2">
        {changed && (
          <button
            type="button"
            onClick={update}
            disabled={busy}
            className="flex-1 rounded-lg border border-emerald-300 bg-white py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? "Updating…" : `Update to ${money(next)}`}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Done
        </button>
      </div>

      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${details ? "rotate-180" : ""}`} />
        {details ? "Hide details" : "Details"}
      </button>
      {details && <OrderLog log={log} phase={phase} />}
    </div>
  );
}
