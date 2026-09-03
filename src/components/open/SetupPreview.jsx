import { fmtMoney } from "@/lib/format";
import { unitFor, isSingle } from "@/lib/setupUnit";

const ROLE_LABEL = {
  short_put: "Short put",
  long_put: "Long put",
  short_call: "Short call",
  long_call: "Long call"
};

const clock = (t) => (t ? new Date(t).toLocaleTimeString() : "");

// live: what useLiveSetup returns -- the market now, beside the scan's figures.
// Without it the preview is the scan as it was, which is what a scan result
// list wants and what a ticket must not settle for.
export default function SetupPreview({ setup, qty, live = null }) {
  const unit = unitFor(setup.strategy);
  const single = isSingle(setup.strategy);
  const cc = setup.strategy === "covered_call";
  const streaming = !!live?.streaming;
  const spot = streaming ? live.spot : setup.spot;
  const spotSource = setup.spotSource === "trade" ? "last trade" : setup.spotSource === "quote" ? "quote mid" : setup.spotSource;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3 text-xs text-slate-500">
        <span className="pt-1">{setup.ticker} · Expiry {setup.expiry}</span>
        {/* Where the spot came from and when. This number picks the strikes,
            and a scan built on a bad one sold a short put that was already in
            the money while the dialog showed it $8.50 clear of the stock. On a
            ticket it streams; the size is so the eye lands on it first. */}
        <span className="text-right">
          <span className={`block text-lg font-semibold tabular-nums leading-tight ${streaming ? "text-slate-900" : "text-slate-600"}`}>
            {fmtMoney(spot)}
          </span>
          <span className="block text-[11px] text-slate-400 tabular-nums">
            {streaming ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1 align-middle" />
                live {clock(live.spotAt)}
              </>
            ) : (
              <>
                {spotSource || "spot"}{setup.spotAsOf ? ` ${clock(setup.spotAsOf)}` : ""}
                {live ? " · not streaming" : ""}
              </>
            )}
          </span>
        </span>
      </div>

      <div className="space-y-1">
        {setup.legs.map((l) => {
          const q = live?.legQuotes?.[l.symbol];
          const isLive = typeof q?.bid === "number" && typeof q?.ask === "number";
          return (
            <div key={l.symbol} className="flex items-center justify-between tabular-nums">
              <span className="text-slate-500">
                {l.side === "sell" ? "Sell" : "Buy"} {l.ratio}× {ROLE_LABEL[l.role]} {fmtMoney(l.strike)}
              </span>
              <span className={isLive ? "text-slate-900" : "text-slate-700"}>
                {fmtMoney(isLive ? q.bid : l.bid)} / {fmtMoney(isLive ? q.ask : l.ask)}
                {/* Unsigned, matching the rows this ticket was opened from --
                    the line already says Sell / Short put, so the minus sign
                    added nothing but a second number for the same trade. */}
                <span className="text-slate-400 ml-2">Δ {Math.abs(l.delta).toFixed(2)}</span>
              </span>
            </div>
          );
        })}
        {live?.quote && (
          <div className="flex items-center justify-between tabular-nums text-xs pt-1">
            <span className="text-slate-500">Net credit now (bid / ask){live.quoteAt ? ` · ${clock(live.quoteAt)}` : ""}</span>
            <span className="text-slate-900 font-medium">{fmtMoney(live.quote.bid)} / {fmtMoney(live.quote.ask)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 tabular-nums border-t border-slate-200 pt-2">
        {/* Credit and width are quoted per share; risk and totals are per
            contract. Scaling the credit here keeps every dollar figure in this
            block on the same footing — a $0.93 credit beside a $157.00 risk
            reads as a mistake even when the arithmetic behind it is right. */}
        <span className="text-slate-500">Credit / {unit}{live ? " (scan)" : ""}</span>
        <span className="text-right text-emerald-600 font-medium">{fmtMoney(setup.credit * 100)}</span>
        {single ? (
          <>
            <span className="text-slate-500">{cc ? "Shares at basis" : "Collateral"} / {unit}</span>
            <span className="text-right">{fmtMoney(setup.collateral)}</span>
            {cc && (
              <>
                <span className="text-slate-500">Basis / share ({setup.basisSource === "adjusted" ? "adjusted for premiums" : "broker"})</span>
                <span className="text-right">{fmtMoney(setup.basis)}</span>
                <span className="text-slate-500">If called away</span>
                <span className={`text-right ${setup.ifCalled >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(setup.ifCalled)}</span>
              </>
            )}
            <span className="text-slate-500">Max loss / {unit} (stock to 0)</span>
            <span className="text-right">{fmtMoney(setup.maxRisk)}</span>
          </>
        ) : (
          <>
            <span className="text-slate-500">Widest side width</span>
            <span className="text-right">{fmtMoney(setup.width * 100)}</span>
            <span className="text-slate-500">Max risk / {unit}</span>
            <span className="text-right">{fmtMoney(setup.maxRisk)}</span>
          </>
        )}
        <span className="text-slate-500">Total credit ({qty} {unit}{qty > 1 ? "s" : ""})</span>
        <span className="text-right text-emerald-600 font-semibold">{fmtMoney(setup.credit * qty * 100)}</span>
        <span className="text-slate-500">{single ? "Total max loss (stock to 0)" : "Total max risk"}</span>
        <span className="text-right font-semibold">{fmtMoney(setup.maxRisk * qty)}</span>
        <span className="text-slate-500">Break-even</span>
        <span className="text-right">
          {setup.breakEvenLow != null ? fmtMoney(setup.breakEvenLow) : "—"}
          {setup.breakEvenHigh != null && <span className="text-slate-400"> – {fmtMoney(setup.breakEvenHigh)}</span>}
        </span>
      </div>
    </div>
  );
}