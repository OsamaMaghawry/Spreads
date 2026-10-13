import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import OrderLog from "@/components/close/OrderLog";

// The one screen after an order reaches the broker and rests there.
//
// The owner: "Why is setting the limit price, or after the submission, so
// confusing? Update price, stop watching, the order is working, then when
// clicking any of them it opens a new one saying the same things. Why isn't
// it just one thing saying submitted as a success?"
//
// So: it says the order was sent and where it is, and Done closes the ticket
// in one click, leaving the order working. Changing the price and the raw log
// are still here for whoever wants them, folded away.
export default function OrderSent({ price, priced = "credit", size, accountName, timeInForce, log, phase, onDone, changePrice }) {
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Order sent
        </div>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-emerald-900">
          <li>
            Working at your broker: {size}
            {typeof price === "number" ? ` at $${Math.abs(price).toFixed(2)} ${priced}` : ""}
            {accountName ? ` on ${accountName}` : ""}.
          </li>
          <li>It fills when the market reaches your price.</li>
          <li>
            {timeInForce === "gtc"
              ? "It stays open until it fills or you cancel it."
              : "If it has not filled by today's close, it expires."}
          </li>
          <li>To cancel it later: the account&rsquo;s Orders tab.</li>
        </ul>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Done
        </button>
        {changePrice && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Change price
          </button>
        )}
      </div>

      {editing && changePrice}

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
