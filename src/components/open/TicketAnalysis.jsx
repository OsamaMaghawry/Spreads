import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { scaledRisk } from "@/lib/setupUnit";
import { tickerBook, curveRange, payoffCurve, crossings } from "@/lib/tickerBook";
import { pendingRows, ticketMarks, withPending, maxProfitOf, expiriesOf } from "@/lib/pendingPosition";
import PayoffChart from "@/components/dashboard/PayoffChart";

// What the order does, before it is sent — and what it does to everything else.
//
// The owner asked for two things, and they are deliberately two:
//
//   ANALYSIS          this order, on its own. The picture behind the three
//                     numbers the ticket already prints.
//   ADVANCED ANALYSIS the same ticker's whole open book, as it stands and as
//                     it would stand. "How it reflects to the entire position
//                     if any if executed."
//
// Both are drawn by `positionPLAt` — the function that prices the dashboard —
// through `pendingPosition`, so a pending order and an open one are priced by
// the same arithmetic. The second section exists because the first cannot
// answer the question that matters when something is already on: a second
// short put is fine on its own and may be far too much beside the first.

// A LOSS with no bound and a PROFIT with no bound are not the same news, and
// they had been sharing one helper — so a naked short call, whose profit is
// firmly capped at the credit and whose loss is not capped at all, printed
// "Max profit: No ceiling" in the colour this product uses for losses.
const lossCell = (v) =>
  v === null || v === undefined
    ? <span className="text-rose-600 font-semibold">No ceiling</span>
    : fmtMoney(v);

// Unknown is "—". Genuinely unlimited upside — a bought call — is said plainly
// and in the colour of a gain, never in red.
const profitCell = (v, unlimited) =>
  unlimited
    ? <span className="text-emerald-600 font-semibold">Unlimited</span>
    : v === null || v === undefined
      ? "—"
      : fmtMoney(v);

function Section({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span>
          <span className="block text-sm font-medium text-slate-900">{title}</span>
          <span className="block text-[11px] text-slate-500">{subtitle}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-3 space-y-3 bg-white">{children}</div>}
    </div>
  );
}

const Figure = ({ label, value, tone = "" }) => (
  <div className="min-w-0">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
  </div>
);

// Break-evens as the chart shows them: where the combined curve crosses zero.
// Read off the curve rather than off `breakEvenLow`/`breakEvenHigh` so the
// numbers and the picture cannot disagree, and so a book of several positions
// has break-evens at all — no single row's figure is the book's.
const evens = (list) =>
  list.length === 0 ? "None in range" : list.map((c) => fmtMoney(c.price)).join(" · ");

export default function TicketAnalysis({ setup, qty = 1, net = null, positions = null }) {
  const [openOwn, setOpenOwn] = useState(false);
  const [openBookView, setOpenBookView] = useState(false);

  // A position whose legs expire on DIFFERENT DAYS cannot be drawn here, and
  // this is the gate that stops it. `positionPLAt` takes a price and no date:
  // it settles every leg at once, which is exact for a vertical and describes
  // a moment that never arrives for a calendar or a diagonal. Drawing it
  // anyway put a comfortable floor under the owner's Feb-2027 / Dec-2027
  // structure — a bounded picture of an unbounded position, next to a cell
  // correctly reading "No ceiling".
  const dates = useMemo(() => expiriesOf(setup), [setup]);
  const oneExpiry = dates.length <= 1;

  const rows = useMemo(() => (oneExpiry ? pendingRows(setup, qty, net) : []), [setup, qty, net, oneExpiry]);

  // This order alone.
  const own = useMemo(() => {
    const book = withPending(null, rows);
    if (!book) return null;
    const range = curveRange(book);
    if (!range) return null;
    const curve = payoffCurve(book, range);
    return { curve, zeros: crossings(curve), spot: book.spot };
  }, [rows]);

  // The ticker's open book, and the same book with this order in it. Drawn on
  // ONE price range so the two lines can be read against each other; sampling
  // them separately would put the same price at two different x positions.
  const openBook = useMemo(
    () => (setup?.ticker && positions?.length ? tickerBook(positions, setup.ticker) : null),
    [positions, setup?.ticker]
  );

  const combined = useMemo(() => {
    if (!openBook || !rows.length) return null;
    const after = withPending(openBook, rows);
    const range = curveRange(after);
    if (!range) return null;
    const before = payoffCurve(openBook, range);
    const curve = payoffCurve(after, range);
    return {
      before,
      curve,
      zerosBefore: crossings(before),
      zerosAfter: crossings(curve),
      spot: after.spot,
      committedNow: openBook.committed,
      // `tickerBook.committed` sums `s.collateral`, which single-leg rows set
      // and multi-leg rows do not. Four open put verticals therefore
      // contribute nothing to it, and "collateral after" would read as though
      // the account had capital free that it does not. Withheld unless every
      // row carried a figure -- the rule `expirationPL` already follows one
      // file over.
      committedComplete: openBook.rows.every(
        (r) => r?.collateral !== null && r?.collateral !== undefined
      ),
      unrealizedNow: openBook.unrealizedPL,
      unpriceable: openBook.unpriceable
    };
  }, [openBook, rows]);

  // The panel still renders when there is nothing to draw: the refusal and its
  // reason ARE the analysis in that case, and returning null would leave the
  // ticket looking as though the feature simply was not there.
  if (!own && oneExpiry) return null;

  const maxLoss = scaledRisk(setup.maxRisk, qty);
  const profit = maxProfitOf(setup);
  const maxProfit = profit === null ? null : profit * (Number(qty) > 0 ? Number(qty) : 1);
  const marks = ticketMarks(setup);
  const collateral = scaledRisk(setup.collateral, qty);
  // The one structure whose profit genuinely has no ceiling: a bought call
  // gains with the stock, and the stock has no upper bound.
  const unlimitedUpside = setup.strategy === "long_call";

  // Never assert what was not looked at. `openBook` is null both when the
  // account holds nothing AND when no positions were passed at all, and the
  // header claiming "Nothing open" for the second case was the exact failure
  // this panel exists to prevent -- both sections start collapsed, so that
  // header was the only thing on screen.
  const subtitle = !oneExpiry
    ? "Not drawable across two expiry dates"
    : positions === null
      ? "Open positions not available on this screen"
      : openBook
        ? `All of ${setup.ticker} in this account, before and after`
        : `Nothing open on ${setup.ticker} in this account`;

  // What to print where the chart would be. One sentence, naming both dates
  // and what the position actually becomes after the near one — which is the
  // thing the chart could never have shown.
  const cannotDraw = !oneExpiry && (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
      <p className="font-semibold">
        No payoff chart: these legs expire on different days ({dates.join(" and ")}).
      </p>
      <p>
        A payoff at expiry is a picture of ONE moment, and this position has two. After {dates[0]} the
        near leg is gone and what is left is a different position entirely, with its own risk — so any
        single line drawn here would describe a trade that never exists.
        {setup.riskNote ? ` ${setup.riskNote}` : ""}
      </p>
    </div>
  );

  return (
    <div className="space-y-2">
      <Section
        title="Analysis"
        subtitle={oneExpiry ? "This order on its own, at expiry" : "Two expiry dates — see why"}
        open={openOwn}
        onToggle={() => setOpenOwn((v) => !v)}
      >
        {cannotDraw || (
          <>
            <PayoffChart curve={own.curve} spot={own.spot} crossings={own.zeros} marks={marks} />
            <p className="text-[11px] text-slate-500">
              At expiry, intrinsic value only — no time premium, which is why the line is straight
              between the strikes. Drawn on{" "}
              {net === null
                ? "the midpoints above"
                : `${fmtMoney(Math.abs(net) * 100)} ${net < 0 ? "paid" : "received"} per contract`}.
              {setup.riskNote ? ` ${setup.riskNote}` : ""}
            </p>
          </>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
          <Figure label="Max profit" value={profitCell(maxProfit, unlimitedUpside)} />
          <Figure label="Max loss" value={lossCell(maxLoss)} tone={maxLoss === null ? "" : "text-rose-600"} />
          <Figure label="Break-even" value={oneExpiry ? evens(own.zeros) : "—"} />
          <Figure
            label={setup.strategy === "covered_call" ? "Shares at basis" : "Collateral"}
            value={fmtMoney(collateral)}
          />
        </div>
      </Section>

      <Section
        title="Advanced analysis"
        subtitle={subtitle}
        open={openBookView}
        onToggle={() => setOpenBookView((v) => !v)}
      >
        {!oneExpiry ? (
          cannotDraw
        ) : !combined ? (
          <p className="text-xs text-slate-500">
            {positions === null
              ? `This ticket was opened from a screen that does not carry open positions, so nothing was read about ${setup.ticker} in this account. The order's own analysis above stands on its own.`
              : `This account holds nothing on ${setup.ticker}, so the order's own analysis above is the whole picture.`}
          </p>
        ) : (
          <>
            <PayoffChart
              curve={combined.curve}
              baseline={combined.before}
              spot={combined.spot}
              crossings={combined.zerosAfter}
              marks={marks}
              baselineLabel={`${setup.ticker} as it stands`}
              curveLabel="With this order"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
              <Figure label="Break-even now" value={evens(combined.zerosBefore)} />
              <Figure label="Break-even after" value={evens(combined.zerosAfter)} />
              <Figure
                label="Unrealized on this name (at the market now)"
                value={fmtMoney(combined.unrealizedNow)}
                tone={combined.unrealizedNow > 0 ? "text-emerald-600" : combined.unrealizedNow < 0 ? "text-rose-600" : ""}
              />
              <Figure
                label="Collateral after"
                value={
                  combined.committedComplete && collateral !== null
                    ? fmtMoney((combined.committedNow || 0) + collateral)
                    : "—"
                }
              />
            </div>
            {/* A curve drawn from some of the rows, presented as the book, is
                worse than no curve. `tickerBook` names the rows it could not
                price -- an adjusted contract delivers something other than 100
                shares, so nothing about it can be honestly plotted. */}
            {combined.unpriceable?.length > 0 && (
              <p className="text-[11px] text-amber-700">
                {combined.unpriceable.length} open {combined.unpriceable.length === 1 ? "position" : "positions"} on{" "}
                {setup.ticker} could not be priced (an adjusted contract does not deliver 100 shares), so the
                lines above leave {combined.unpriceable.length === 1 ? "it" : "them"} out — though the
                unrealized figure still counts {combined.unpriceable.length === 1 ? "it" : "them"}.
              </p>
            )}
            {(!combined.committedComplete || collateral === null) && (
              <p className="text-[11px] text-amber-700">
                Collateral after is withheld: {collateral === null
                  ? "this order has no collateral figure"
                  : "not every open position on this name records one"}, and a total missing part of
                itself reads as capital that is free when it is not.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              The lines are at expiry; the unrealized figure is at the market now. They answer different
              questions and are not two views of one number.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
