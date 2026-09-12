import { fmtMoney } from "@/lib/format";
import { unitFor, isSingle, scaledRisk } from "@/lib/setupUnit";

const ROLE_LABEL = {
  short_put: "Short put",
  long_put: "Long put",
  short_call: "Short call",
  long_call: "Long call"
};

const clock = (t) => (t ? new Date(t).toLocaleTimeString() : "");

// A risk figure, or the plain statement that there isn't one.
//
// Never `fmtMoney` on a null risk: it would print "$0.00" and read as a
// position that cannot lose. "No ceiling" is the honest cell, in the colour
// the rest of the product uses for a loss, and the note under the block says
// why.
const RiskCell = ({ value }) =>
  value === null || value === undefined ? (
    <span className="text-right text-rose-600 font-semibold">No ceiling</span>
  ) : (
    <span className="text-right font-semibold">{fmtMoney(value)}</span>
  );

// live: what useLiveSetup returns -- the market now, beside the scan's figures.
// Without it the preview is the scan as it was, which is what a scan result
// list wants and what a ticket must not settle for.
export default function SetupPreview({ setup, qty, live = null }) {
  const unit = unitFor(setup.strategy);
  const single = isSingle(setup.strategy);
  const cc = setup.strategy === "covered_call";
  // "Stock to 0" is the ceiling on a short put and on shares. It is not a
  // ceiling on anything else, so the phrase only appears where it is true.
  const bounded = setup.maxRisk !== null && setup.maxRisk !== undefined;
  const debit = typeof setup.credit === "number" && setup.credit < 0;
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

      {/* The contracts, made to stand out rather than announced.
          The owner arrowed this block: it needed to be OBVIOUS, not labelled —
          his words, "I don't want it called the main order. I am just telling
          it to you it should be more obvious." It was three grey lines the
          same weight as the statistics below, so the contracts about to be
          bought and sold read as one more row of reference data. Now it is a
          card of its own on white, each leg on a coloured rail — emerald buys,
          rose sells, the same two colours as the chain's B and S buttons —
          with the side spelled out and the strike in the size the eye lands on
          first. No heading: the block carries itself. */}
      <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100">
          {setup.legs.map((l) => {
            const q = live?.legQuotes?.[l.symbol];
            const isLive = typeof q?.bid === "number" && typeof q?.ask === "number";
            const sell = l.side === "sell";
            return (
              <div
                key={l.symbol}
                className={`flex items-center justify-between gap-3 px-3 py-2 border-l-4 ${
                  sell ? "border-l-rose-500" : "border-l-emerald-500"
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        sell ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {sell ? "Sell" : "Buy"}
                    </span>
                    <span className="text-base font-semibold text-slate-900 tabular-nums">
                      {l.ratio > 1 ? `${l.ratio}× ` : ""}{fmtMoney(l.strike)} {ROLE_LABEL[l.role]?.split(" ")[1] || ""}
                    </span>
                  </span>
                  {/* Each leg's own expiry, because a calendar or a diagonal
                      has two and the header can only name one of them. */}
                  <span className="block text-[11px] text-slate-500 tabular-nums">
                    {l.expiry || setup.expiry}
                    <span className="text-slate-400"> · Δ {Math.abs(l.delta).toFixed(2)}</span>
                  </span>
                </span>
                <span className={`text-right tabular-nums text-sm ${isLive ? "text-slate-900" : "text-slate-600"}`}>
                  {fmtMoney(isLive ? q.bid : l.bid)} / {fmtMoney(isLive ? q.ask : l.ask)}
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider">bid / ask</span>
                </span>
              </div>
            );
          })}
        </div>
        {live?.quote && (
          <div className="flex items-center justify-between tabular-nums text-xs px-3 py-2 bg-slate-50 border-t border-slate-200">
            <span className="text-slate-500">Net {debit ? "cost" : "credit"} now (bid / ask){live.quoteAt ? ` · ${clock(live.quoteAt)}` : ""}</span>
            <span className="text-slate-900 font-medium">{fmtMoney(live.quote.bid)} / {fmtMoney(live.quote.ask)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 tabular-nums border-t border-slate-200 pt-2">
        {/* Credit and width are quoted per share; risk and totals are per
            contract. Scaling the credit here keeps every dollar figure in this
            block on the same footing — a $0.93 credit beside a $157.00 risk
            reads as a mistake even when the arithmetic behind it is right. */}
        {/* A structure that COSTS money is not a credit, and calling it one
            put a green number on an order the user is paying for. */}
        <span className="text-slate-500">{debit ? "Debit" : "Credit"} / {unit}{live ? " (scan)" : ""}</span>
        <span className={`text-right font-medium ${debit ? "text-slate-900" : "text-emerald-600"}`}>
          {fmtMoney(Math.abs(setup.credit) * 100)}
        </span>
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
            <span className="text-slate-500">Max loss / {unit}{bounded ? " (stock to 0)" : ""}</span>
            <RiskCell value={setup.maxRisk} />
          </>
        ) : (
          <>
            {/* Only a vertical has a width. A calendar or a diagonal has two
                expiries and no width at all, and `null * 100` printed
                "Widest side width $0.00" next to legs 10 months apart. */}
            {setup.width != null && (
              <>
                <span className="text-slate-500">Widest side width</span>
                <span className="text-right">{fmtMoney(setup.width * 100)}</span>
              </>
            )}
            <span className="text-slate-500">Max risk / {unit}</span>
            <RiskCell value={setup.maxRisk} />
          </>
        )}
        <span className="text-slate-500">Total {debit ? "cost" : "credit"} ({qty} {unit}{qty > 1 ? "s" : ""})</span>
        <span className={`text-right font-semibold ${debit ? "text-slate-900" : "text-emerald-600"}`}>
          {fmtMoney(Math.abs(setup.credit) * qty * 100)}
        </span>
        <span className="text-slate-500">
          {single ? `Total max loss${bounded ? " (stock to 0)" : ""}` : "Total max risk"}
        </span>
        <RiskCell value={scaledRisk(setup.maxRisk, qty)} />
        <span className="text-slate-500">Break-even</span>
        <span className="text-right">
          {setup.breakEvenLow != null ? fmtMoney(setup.breakEvenLow) : "—"}
          {setup.breakEvenHigh != null && <span className="text-slate-400"> – {fmtMoney(setup.breakEvenHigh)}</span>}
        </span>
      </div>

      {/* WHY there is no ceiling, in a sentence, where the number would have
          been. `spreadSetup` and `contractSetup` both work out what the
          position actually is -- which leg outlives which, whether shares
          cover the call -- and this is the only place that reasoning reaches
          the person about to send the order. */}
      {!bounded && (
        <div className="border border-rose-200 bg-rose-50 rounded-lg p-2.5 text-xs text-rose-800 space-y-1">
          <p className="font-semibold">This position&rsquo;s loss is not bounded.</p>
          <p>
            {setup.riskNote ||
              (setup.strategy === "covered_call"
                ? `You do not hold 100 shares of ${setup.ticker} at a known cost, so this call is uncovered and the loss rises with the stock without limit.`
                : "Nothing in this structure caps what it can lose.")}
          </p>
        </div>
      )}
      {bounded && setup.riskNote && (
        <p className="text-xs text-slate-500 border-t border-slate-200 pt-2">{setup.riskNote}</p>
      )}
    </div>
  );
}