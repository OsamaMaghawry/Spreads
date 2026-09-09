import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { invokeFunction } from "@/lib/functions";
import { AlertTriangle, ArrowRight, Check, Loader2 } from "lucide-react";
import { closePlan, orderLegs, coverLeftBehind } from "@/lib/closePlan";
import useMultiClose from "./useMultiClose";
import ConfirmSubmit from "@/components/common/ConfirmSubmit";
import OrderLog from "./OrderLog";

// Closing several broker lines in one act, at a limit that walks.
//
// The broker's own multi-position close is a MARKET liquidation. On a wide
// options market that is how a close gives back more than the position was
// worth, so this walks a limit instead -- the same walk the single-position
// ticket uses.
//
// What this screen owes the user above all is the SEQUENCE. Alpaca takes at
// most four option legs per order and never mixes shares with contracts, so a
// selection of any size becomes several orders, and between the first fill and
// the last the account holds something that was on no screen. The plan is shown
// before anything is sent, in the order it will be sent, with buy-backs first
// so cover is never removed before the position it covers is closed.

const label = (l) =>
  l.assetClass === "equity"
    ? `${Math.abs(l.qty)} ${l.ticker || l.symbol} shares`
    : `${Math.abs(l.qty)}× ${l.ticker || ""} ${fmtMoney(l.strike)}${l.optionType || ""} ${l.expiry || ""}`.replace(/\s+/g, " ").trim();

export default function MultiCloseDialog({ account, selected, brokerRows = [], onClose, onDone }) {
  const { phase, log, step, done, run, stop, reset } = useMultiClose();
  const [quotes, setQuotes] = useState({});
  const plan = useMemo(() => closePlan(selected), [selected]);
  // Repeated at the point of commitment, not only on the tab behind it. The
  // selection bar states it while picking; this is the last screen before real
  // orders go out, and a consequence stated once two clicks ago is a
  // consequence the user has already scrolled past.
  const stranded = useMemo(() => coverLeftBehind(selected, brokerRows), [selected, brokerRows]);

  // A live net price per order, so the user sees what each step would pay or
  // receive before authorising the sequence. Same endpoint the single ticket
  // uses; a one-sided market comes back refused rather than as a fake mid.
  useEffect(() => {
    if (!plan.orders.length || phase !== "idle") return;
    let active = true;
    const load = async () => {
      const next = {};
      for (let i = 0; i < plan.orders.length; i++) {
        const { data } = await invokeFunction("spreadQuote", {
          accountId: account.id,
          legs: orderLegs(plan.orders[i])
        });
        if (!active) return;
        // A failed request leaves no entry at all under the old code, so netOf
        // returned null and the row spun forever rather than saying it could
        // not be priced. Absent and unpriceable must not look the same.
        next[i] = data?.error ? { error: data.error } : data || { error: "could not price" };
      }
      if (active) setQuotes(next);
    };
    load();
    return () => { active = false; };
  }, [plan, account.id, phase]);

  useEffect(() => { reset(); setQuotes({}); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = phase === "working";
  const finished = phase === "done";

  // A sequence in flight owns real orders at the broker. Dismissing it would
  // leave them working with nothing watching, so the X stops instead.
  const dismiss = () => {
    if (running) { stop(); return; }
    if (finished || done.length) onDone?.();
    onClose();
  };

  const netOf = (i) => {
    const q = quotes[i];
    if (!q) return null;
    if (q.error || typeof q.midDebit !== "number") return { error: q.error || "no market" };
    return { mid: q.midDebit };
  };

  // Declared AFTER netOf: these call it during render, and as a const arrow it
  // is in the temporal dead zone until this point. Placed above, it threw.
  //
  // Any order that cannot be priced now will refuse at its own step, so the
  // sequence must not be authorised on the promise that it will run.
  const anyUnpriceable = plan.orders.some((_, i) => quotes[i] && netOf(i)?.error);
  const stillPricing = plan.orders.some((_, i) => quotes[i] === undefined);

  return (
    <Dialog open onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Close {selected.length} selected position{selected.length > 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        {phase === "idle" ? (
          <div className="space-y-4">
            {plan.warnings.map((w, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
            {stranded.map((w) => (
              <div key={w.selling} className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w.text}</span>
              </div>
            ))}
            {plan.atomic && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                One order — every leg fills together or not at all.
              </div>
            )}

            <div className="space-y-2">
              {plan.orders.map((o, i) => {
                const net = netOf(i);
                return (
                  <div key={i} className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 border-b border-slate-200">
                      <span className="tabular-nums">{i + 1}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>
                        {o.kind === "equity" ? "Shares" : `${o.legs.length} option leg${o.legs.length > 1 ? "s" : ""}`}
                        {o.qty > 1 && o.kind !== "equity" ? ` · ${o.qty} units` : ""}
                      </span>
                      <span className="ml-auto tabular-nums">
                        {net === null ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : net.error ? (
                          <span className="text-amber-600">no market</span>
                        ) : (
                          <span className={net.mid < 0 ? "text-emerald-600" : "text-slate-700"}>
                            {net.mid < 0 ? "receive " : "pay "}
                            {fmtMoney(Math.abs(net.mid))} / unit
                          </span>
                        )}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {o.legs.map((l) => (
                        <li key={l.symbol} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            l.action === "buy_to_close"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}>
                            {l.action === "buy_to_close" ? "buy back" : "sell"}
                          </span>
                          <span className="text-slate-700">{label(l)}</span>
                          {l.ratio > 1 && <span className="text-xs text-slate-400">×{l.ratio} per unit</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {anyUnpriceable && (
              <p className="text-xs text-amber-600 leading-relaxed">
                At least one of these has no two-sided market right now, so the walk has nothing to start
                from and would refuse at that step. Wait for the market, or close that line on its own.
              </p>
            )}

            <p className="text-xs text-slate-500 leading-relaxed">
              Each order starts at the mid and steps toward the ask every 30 seconds until it fills, never
              past the ask plus $0.05. Ten minutes is the limit <strong>per order</strong>, so a
              {" "}{plan.orders.length}-order plan can hold live orders for up to{" "}
              {plan.orders.length * 10} minutes. This is a limit walk, not a market liquidation.
            </p>

            <ConfirmSubmit
              tone="rose"
              label={`Close ${selected.length} position${selected.length > 1 ? "s" : ""} in ${plan.orders.length} order${plan.orders.length > 1 ? "s" : ""}`}
              summary={
                plan.atomic
                  ? "One order, all legs together."
                  : `${plan.orders.length} orders, one at a time. If any does not fill, the rest are not sent.`
              }
              onConfirm={() => run({ accountId: account.id, selected })}
              disabled={!plan.orders.length || anyUnpriceable || stillPricing}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {plan.orders.map((o, i) => (
                <span
                  key={i}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border ${
                    done.includes(i)
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : running && i === step
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  {done.includes(i) ? <Check className="h-3 w-3" /> : running && i === step ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Order {i + 1}
                </span>
              ))}
            </div>
            <OrderLog log={log} phase={phase === "done" ? "filled" : phase === "working" ? "working" : "failed"} />
            {!running && (
              <button
                onClick={dismiss}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            )}
            {running && (
              <button
                onClick={stop}
                className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                Stop — cancels the order that is working now
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
