import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import useSubscription from "@/lib/useSubscription";

// The billing screen. Two buttons that send the user to Stripe's hosted
// Checkout, and once they are back, the plan as the webhook recorded it and a
// button into Stripe's portal. No card is ever entered here.

const money = (n) => `$${n}`;
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const STATUS_LABEL = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed — card being retried",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Payment not completed",
  incomplete_expired: "Payment not completed",
  paused: "Paused"
};

export default function Billing() {
  const [params] = useSearchParams();
  const { subscription: sub, plan, loading, grandfathered } = useSubscription();
  const [interval, setInterval] = useState(params.get("plan") === "annual" ? "annual" : "monthly");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const checkout = params.get("checkout");

  const go = async (fn, payload) => {
    setBusy(fn);
    setError(null);
    try {
      const res = await invokeFunction(fn, payload);
      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data?.url) throw new Error("Stripe did not return a page to open.");
      window.location.href = res.data.url;
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setBusy(null);
    }
  };

  const hasStripe = !!sub?.stripe_customer_id;
  const live = plan === "live";

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Billing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your plan, and what it covers.</p>
      </div>

      {checkout === "success" && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> Payment set up. Your plan appears below as soon as Stripe confirms it — usually within a few seconds.
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="bg-slate-100 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-600">
          Checkout was cancelled. Nothing was charged.
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <span className="text-slate-500">Plan</span>
            <span className="text-slate-900">
              {loading ? "…" : live ? "Live" : "Paper"}{" "}
              <span className={`ml-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                live ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-sky-50 text-sky-700 border-sky-200"
              }`}>
                {loading ? "" : live ? (grandfathered && !["active", "trialing"].includes(sub?.status) ? "free until " + when(sub.grandfathered_until) : STATUS_LABEL[sub?.status] || sub?.status) : "free"}
              </span>
            </span>
            <span className="text-slate-500">Live orders</span>
            <span className="text-slate-900">{live ? "Included" : "Need a Live plan on a live account"}</span>
            <span className="text-slate-500">Paper orders</span>
            <span className="text-slate-900">Always included</span>
            {sub?.current_period_end && live && (
              <>
                <span className="text-slate-500">{sub.cancel_at_period_end ? "Ends" : sub.status === "trialing" ? "First charge" : "Renews"}</span>
                <span className="text-slate-900 tabular-nums">{when(sub.current_period_end)}</span>
              </>
            )}
          </div>

          {!live && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "monthly", name: "Monthly", price: money(29), per: "/ month", note: "First 30 days free" },
                  { id: "annual", name: "Yearly", price: money(290), per: "/ year", note: "Ten months for twelve" }
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setInterval(p.id)}
                    className={`text-left rounded-lg border p-3.5 transition-colors ${
                      interval === p.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="text-xs text-slate-500">{p.name}</div>
                    <div className="text-xl font-semibold text-slate-900 tabular-nums">
                      {p.price} <span className="text-xs font-normal text-slate-500">{p.per}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.note}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => go("createCheckoutSession", { interval })}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy === "createCheckoutSession" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Continue to payment
              </button>
              <p className="text-xs text-slate-500 leading-relaxed">
                You will enter your card on Stripe's secure page. <span className="text-slate-700">Nothing per contract, nothing per order.</span>{" "}
                Cancel any month. You can always close a position, on any plan.
              </p>
            </>
          )}

          {hasStripe && (
            <button
              onClick={() => go("billingPortal", {})}
              disabled={busy !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {busy === "billingPortal" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Manage billing
            </button>
          )}
        </section>

        <aside className="bg-white border border-slate-200 rounded-xl p-5 text-sm space-y-3">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">What Live adds</div>
          <ul className="space-y-1.5 text-slate-700">
            <li>Cash-secured puts, covered calls and assigned shares, held as what they are</li>
            <li>Cost basis adjusted for every premium collected on the name</li>
            <li>Risk sized at a 15% adverse move, with notional shown separately</li>
            <li>Streaming underlying prices while a position is open</li>
            <li>The Orders tab, grouped as sent, including partial fills</li>
          </ul>
          <div className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
            Paper stays free, forever and unmetered. Closing, cancelling, quoting, history, analysis and PDF export are never behind a plan.
          </div>
        </aside>
      </div>
    </div>
  );
}
