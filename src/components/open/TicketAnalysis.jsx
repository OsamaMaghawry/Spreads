import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { scaledRisk } from "@/lib/setupUnit";
import { tickerBook, curveRange, payoffCurve, crossings } from "@/lib/tickerBook";
import { pendingRows, ticketMarks, withPending, maxProfitOf } from "@/lib/pendingPosition";
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

const money = (v) =>
  v === null || v === undefined ? <span className="text-rose-600 font-semibold">No ceiling</span> : fmtMoney(v);

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

  const rows = useMemo(() => pendingRows(setup, qty, net), [setup, qty, net]);

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
      unrealizedNow: openBook.unrealizedPL,
      unpriceable: openBook.unpriceable
    };
  }, [openBook, rows]);

  if (!own) return null;

  const maxLoss = scaledRisk(setup.maxRisk, qty);
  const profit = maxProfitOf(setup);
  const maxProfit = profit === null ? null : profit * (Number(qty) > 0 ? Number(qty) : 1);
  const marks = ticketMarks(setup);
  const collateral = scaledRisk(setup.collateral, qty);

  return (
    <div className="space-y-2">
      <Section
        title="Analysis"
        subtitle="This order on its own, at expiry"
        open={openOwn}
        onToggle={() => setOpenOwn((v) => !v)}
      >
        <PayoffChart curve={own.curve} spot={own.spot} crossings={own.zeros} marks={marks} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
          <Figure label="Max profit" value={money(maxProfit)} tone={maxProfit ? "text-emerald-600" : ""} />
          <Figure label="Max loss" value={money(maxLoss)} tone={maxLoss === null ? "" : "text-rose-600"} />
          <Figure label="Break-even" value={evens(own.zeros)} />
          <Figure label={setup.strategy === "covered_call" ? "Shares at basis" : "Collateral"} value={fmtMoney(collateral)} />
        </div>
        <p className="text-[11px] text-slate-500">
          At expiry, intrinsic value only — no time premium, which is why the line is straight between
          the strikes. Drawn on {net === null ? "the midpoints above" : `the ${fmtMoney(net * 100)} per ${qty > 1 ? "contract " : ""}net on the ticket`}.
          {setup.riskNote ? ` ${setup.riskNote}` : ""}
        </p>
      </Section>

      <Section
        title="Advanced analysis"
        subtitle={
          openBook
            ? `All of ${setup.ticker} in this account, before and after`
            : `Nothing open on ${setup.ticker} in this account`
        }
        open={openBookView}
        onToggle={() => setOpenBookView((v) => !v)}
      >
        {!combined ? (
          <p className="text-xs text-slate-500">
            {positions === null
              ? "The account's open positions haven't loaded, so the combined picture can't be drawn."
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
                label="Unrealized on this name"
                value={fmtMoney(combined.unrealizedNow)}
                tone={combined.unrealizedNow > 0 ? "text-emerald-600" : combined.unrealizedNow < 0 ? "text-rose-600" : ""}
              />
              <Figure
                label="Collateral after"
                value={fmtMoney((combined.committedNow || 0) + (collateral || 0))}
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
                lines above leave {combined.unpriceable.length === 1 ? "it" : "them"} out.
              </p>
            )}
            {collateral === null && (
              <p className="text-[11px] text-amber-700">
                This order has no collateral figure, so &ldquo;collateral after&rdquo; is the book&rsquo;s current
                figure only.
              </p>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
