import { fmtMoney } from "@/lib/format";
import { unitFor, isSingle, scaledRisk, riskState } from "@/lib/setupUnit";

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
// the rest of the product uses for a loss; the one-line warning below points
// at Analysis, which is where the reason is spelled out.
//
// `state` separates three things the old two-way test ran together: bounded
// with a number, bounded nowhere, and never computed. The third prints the
// neutral em dash every other unknown figure in this product prints -- never
// the red claim, which would assert something we did not work out.
const RiskCell = ({ value, state }) => {
  if (state === "unknown") return <span className="text-right text-slate-400">—</span>;
  if (value === null || value === undefined) {
    return <span className="text-right text-rose-600 font-semibold">No ceiling</span>;
  }
  return <span className="text-right font-semibold">{fmtMoney(value)}</span>;
};

// live: what useLiveSetup returns -- the market now, beside the scan's figures.
// Without it the preview is the scan as it was, which is what a scan result
// list wants and what a ticket must not settle for.
export default function SetupPreview({ setup, qty, live = null }) {
  const unit = unitFor(setup.strategy);
  const single = isSingle(setup.strategy);
  const cc = setup.strategy === "covered_call";
  // A call written against a LONG CALL is a spread, not a covered call on
  // shares. Every share figure below -- basis, "if called away", "stock to 0" --
  // is false for it, so it gets its own rows rather than blanks in theirs.
  const overLong = cc && setup.coveredBy === "long_call";
  const onShares = cc && !overLong;
  // "Stock to 0" is the ceiling on a short put and on shares. It is not a
  // ceiling on anything else, so the phrase only appears where it is true.
  const risk = riskState(setup);
  // "(stock to 0)" and the not-bounded warning are both claims about the
  // structure, so both are reserved for a setup we actually judged.
  const bounded = risk === "bounded";
  const unknownRisk = risk === "unknown";
  const debit = typeof setup.credit === "number" && setup.credit < 0;
  const streaming = !!live?.streaming;
  const spot = streaming ? live.spot : setup.spot;
  const spotSource = setup.spotSource === "trade" ? "last trade" : setup.spotSource === "quote" ? "quote mid" : setup.spotSource;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3 text-xs text-slate-500">
        {/* The word "Expiry" with no date after it is what a reopened saved
            ticket showed. Each leg carries its own below; the header says it
            only when there is one to say. */}
        <span className="pt-1">{setup.ticker}{setup.expiry ? ` · Expiry ${setup.expiry}` : ""}</span>
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
                    {/* A leg reopened from a saved ticket has no strike and no
                        role -- only what the wire needs. The OCC symbol is
                        still the whole truth about the contract, so it stands
                        in rather than a dash: a trader reads TSLA271217P00320000
                        and knows the expiry, the right, and the strike. */}
                    <span className="text-base font-semibold text-slate-900 tabular-nums">
                      {l.ratio > 1 ? `${l.ratio}× ` : ""}
                      {l.strike == null
                        ? l.symbol
                        : `${fmtMoney(l.strike)} ${ROLE_LABEL[l.role]?.split(" ")[1] || ""}`}
                    </span>
                  </span>
                  {/* Each leg's own expiry, because a calendar or a diagonal
                      has two and the header can only name one of them. */}
                  {/* Δ NaN is what `Math.abs(undefined).toFixed(2)` prints, and
                      it appeared on both legs of every reopened saved ticket.
                      A delta we do not have is omitted, not rendered as
                      nonsense beside one we do. */}
                  <span className="block text-[11px] text-slate-500 tabular-nums">
                    {l.expiry || setup.expiry || ""}
                    {Number.isFinite(Number(l.delta)) && (
                      <span className="text-slate-400"> · Δ {Math.abs(Number(l.delta)).toFixed(2)}</span>
                    )}
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

      {/* Cover already behind a call sold. Shown, not hidden -- the owner
          wants to weigh closing that one and writing this. Short on purpose;
          the order ticket names the rest before anything is sent. */}
      {setup.coverInUse && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          {setup.coverInUse} Close that call first, or this one is uncovered.
        </p>
      )}

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
            <span className="text-slate-500">
              {overLong ? "Long call cost" : onShares ? "Shares at basis" : "Collateral"} / {unit}
            </span>
            <span className="text-right">{fmtMoney(setup.collateral)}</span>
            {overLong && (
              <>
                <span className="text-slate-500">Covered by</span>
                <span className="text-right">
                  {setup.ticker} ${setup.cover?.strike} call · {setup.cover?.expiry}
                </span>
                {/* The FLOOR, named as one. Exercising the long to meet an
                    assignment forfeits its remaining time value; selling it
                    instead keeps that. So this is the worst way out, and a
                    negative figure here is common and real, not a bug. */}
                <span className="text-slate-500">If assigned — worst way out</span>
                <span className={`text-right ${setup.ifAssigned >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {fmtMoney(setup.ifAssigned)}
                </span>
              </>
            )}
            {onShares && (
              <>
                <span className="text-slate-500">Basis / share ({setup.basisSource === "adjusted" ? "adjusted for premiums" : "broker"})</span>
                <span className="text-right">{fmtMoney(setup.basis)}</span>
                <span className="text-slate-500">If called away</span>
                <span className={`text-right ${setup.ifCalled >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(setup.ifCalled)}</span>
              </>
            )}
            <span className="text-slate-500">
              Max loss / {unit}
              {overLong ? " (at this call's expiry)" : bounded ? " (stock to 0)" : ""}
            </span>
            <RiskCell value={setup.maxRisk} state={risk} />
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
            <RiskCell value={setup.maxRisk} state={risk} />
          </>
        )}
        <span className="text-slate-500">Total {debit ? "cost" : "credit"} ({qty} {unit}{qty > 1 ? "s" : ""})</span>
        <span className={`text-right font-semibold ${debit ? "text-slate-900" : "text-emerald-600"}`}>
          {fmtMoney(Math.abs(setup.credit) * qty * 100)}
        </span>
        <span className="text-slate-500">
          {single ? `Total max loss${overLong ? " (at this call's expiry)" : bounded ? " (stock to 0)" : ""}` : "Total max risk"}
        </span>
        <RiskCell value={scaledRisk(setup.maxRisk, qty)} state={risk} />
        <span className="text-slate-500">Break-even</span>
        <span className="text-right">
          {setup.breakEvenLow != null ? fmtMoney(setup.breakEvenLow) : "—"}
          {setup.breakEvenHigh != null && <span className="text-slate-400"> – {fmtMoney(setup.breakEvenHigh)}</span>}
        </span>
      </div>

      {/* A SHORT WARNING, not the explanation. The owner: "too much text. I
          don't want the text on the ticket itself too long and repetitive with
          the analysis. You can just add a small warning then see the
          analysis." The full reasoning — which leg outlives which, and what
          the position becomes — lives in the Analysis section below, once. */}
      {/* Why the figures above are blank. Without this the ticket is just
          silent dashes, and silence invites the trader to assume the position
          is fine -- the same mistake in the other direction. It says what we
          do NOT know, and points at the one thing on screen that is still
          exact: the contracts themselves and the live market beside them. */}
      {unknownRisk && (
        <p className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2">
          <span className="font-semibold">Not calculated for this ticket.</span>{" "}
          It was parked before these figures were worked out, so credit, risk
          and break-even are unknown — not zero, and not unbounded. The
          contracts and the live market above are exact. Check the risk in
          Analysis before sending.
        </p>
      )}

      {!bounded && !unknownRisk && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
          <span className="font-semibold">Loss not bounded.</span>{" "}
          {setup.strategy === "covered_call"
            ? `No shares of ${setup.ticker} behind this call.`
            : "See Analysis for what this position becomes."}
        </p>
      )}
    </div>
  );
}