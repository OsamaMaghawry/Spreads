import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { scaledRisk } from "@/lib/setupUnit";
import { tickerBook, curveRange, crossings } from "@/lib/tickerBook";
import {
  pendingRows, ticketMarks, withPending, maxProfitOf,
  curveAt, analysisDates, atClose, survivingRows
} from "@/lib/pendingPosition";
import PayoffChart from "@/components/dashboard/PayoffChart";

// What the order does, before it is sent — and what it does to everything else.
//
//   ANALYSIS           this order on its own.
//   ADVANCED ANALYSIS  the ticker's whole open book, before and after.
//
// EVERY POSITION GETS A CHART, INCLUDING ONE WITH TWO EXPIRY DATES. The first
// build printed a paragraph instead, and the owner was right to reject it:
// *"I don't think it's correct to just add the text of no Payoff just because
// they are in different dates. This is laziness from our side. You can add
// what you want to the graph with dates. For example, the period when both are
// there and after one expires. There must be some analysis to tell, not this
// text."*
//
// So a two-expiry position is drawn as TWO curves, which is more than a single
// payoff line can carry and more than the tools he compared us against show:
//
//   1. THE NEAR DATE. The whole position on the day its first leg expires —
//      that leg at intrinsic, the other still alive and priced by the model.
//      This is the curve a trader would actually see on the day.
//   2. WHAT IS LEFT. The surviving leg alone, at its own expiry. On the
//      owner's diagonal curve 1 looks calm and bounded, and curve 2 is a bare
//      short put with nothing underneath it. Neither line alone is the trade.
//
// They are not additive — what the expired leg returned depends on where the
// stock was on the near date — and the screen says that once, in a line.
//
// The text is otherwise kept short deliberately: *"too much text. I don't want
// the text on the ticket itself too long and repetitive with the analysis. You
// can just add a small warning then see the analysis."* The ticket carries a
// short warning; the reasoning lives here, where someone has chosen to look.

const lossCell = (v) =>
  v === null || v === undefined
    ? <span className="text-rose-600 font-semibold">No ceiling</span>
    : fmtMoney(v);

const profitCell = (v, unlimited) =>
  unlimited
    ? <span className="text-emerald-600 font-semibold">Unlimited</span>
    : v === null || v === undefined
      ? "—"
      : fmtMoney(v);

// "16 Oct 2026" rather than "2026-10-16" — a date in a sentence.
const day = (d) => {
  if (!d) return "";
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    : d;
};

function Section({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="min-w-0">
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

// Break-evens as the chart shows them: where the curve crosses zero. Read off
// the curve rather than off `breakEvenLow`/`breakEvenHigh`, so the numbers and
// the picture cannot disagree — and so a book of several positions has
// break-evens at all, which no single row's figure gives it.
const evens = (list) =>
  !list?.length ? "None in range" : list.map((c) => fmtMoney(c.price)).join(" · ");

export default function TicketAnalysis({ setup, qty = 1, net = null, positions = null }) {
  const [openOwn, setOpenOwn] = useState(false);
  const [openBookView, setOpenBookView] = useState(false);

  const rows = useMemo(() => pendingRows(setup, qty, net), [setup, qty, net]);
  const when = useMemo(() => analysisDates(setup), [setup]);

  // This order alone, on its near date — and, when a leg outlives that date,
  // what is left of it on its own.
  const own = useMemo(() => {
    if (!rows.length) return null;
    const book = withPending(null, rows);
    const range = curveRange(book);
    if (!range) return null;

    const nearAt = atClose(when.near);
    const curve = curveAt(rows, range, nearAt);
    if (!curve.length) return null;

    const left = when.multi ? survivingRows(rows, when.near) : [];
    const tail = left.length ? curveAt(left, range, atClose(when.far)) : [];

    return {
      curve,
      zeros: crossings(curve),
      tail,
      tailZeros: crossings(tail),
      spot: book.spot
    };
  }, [rows, when]);

  const openBook = useMemo(
    () => (setup?.ticker && positions?.length ? tickerBook(positions, setup.ticker) : null),
    [positions, setup?.ticker]
  );

  // The book as it stands against the book as it would stand, both on the
  // order's near date and on ONE price range — sampling them separately would
  // put the same price at two different x positions.
  const combined = useMemo(() => {
    if (!openBook || !rows.length) return null;
    const after = withPending(openBook, rows);
    const range = curveRange(after);
    if (!range) return null;
    const nearAt = atClose(when.near);
    const before = curveAt(openBook.rows, range, nearAt);
    const curve = curveAt(after.rows, range, nearAt);
    if (!curve.length) return null;
    return {
      before,
      curve,
      zerosBefore: crossings(before),
      zerosAfter: crossings(curve),
      spot: after.spot,
      committedNow: openBook.committed,
      // `tickerBook.committed` sums `s.collateral`, which single-leg rows set
      // and multi-leg rows do not. Four open verticals contribute nothing to
      // it, so the total is withheld unless every row carried a figure.
      committedComplete: openBook.rows.every(
        (r) => r?.collateral !== null && r?.collateral !== undefined
      ),
      unrealizedNow: openBook.unrealizedPL,
      unpriceable: openBook.unpriceable
    };
  }, [openBook, rows, when]);

  if (!own) return null;

  const maxLoss = scaledRisk(setup.maxRisk, qty);
  const profit = maxProfitOf(setup);
  const maxProfit = profit === null ? null : profit * (Number(qty) > 0 ? Number(qty) : 1);
  const marks = ticketMarks(setup);
  const collateral = scaledRisk(setup.collateral, qty);
  const unlimitedUpside = setup.strategy === "long_call";

  const nearLabel = `At ${day(when.near)}`;
  const tailLabel = `After it: the ${day(when.far)} leg alone`;

  // Never assert what was not looked at.
  const subtitle = positions === null
    ? "Open positions not available on this screen"
    : openBook
      ? `All of ${setup.ticker} in this account, before and after`
      : `Nothing open on ${setup.ticker} in this account`;

  return (
    <div className="space-y-2">
      <Section
        title="Analysis"
        subtitle={when.multi ? `Two dates: ${day(when.near)} and ${day(when.far)}` : `This order at ${day(when.near)}`}
        open={openOwn}
        onToggle={() => setOpenOwn((v) => !v)}
      >
        <PayoffChart
          curve={own.curve}
          baseline={own.tail.length ? own.tail : null}
          spot={own.spot}
          crossings={own.zeros}
          marks={marks}
          curveLabel={nearLabel}
          baselineLabel={tailLabel}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
          <Figure label="Max profit" value={profitCell(maxProfit, unlimitedUpside)} />
          <Figure label="Max loss" value={lossCell(maxLoss)} tone={maxLoss === null ? "" : "text-rose-600"} />
          <Figure label={when.multi ? `Break-even at ${day(when.near)}` : "Break-even"} value={evens(own.zeros)} />
          <Figure
            label={setup.strategy === "covered_call" ? "Shares at basis" : "Collateral"}
            value={fmtMoney(collateral)}
          />
        </div>

        {when.multi ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 space-y-1">
            <p>
              <strong>{nearLabel}</strong> prices the {day(when.far)} leg at what it would still be worth
              with time left — so the line is curved, and bounded.{" "}
              <strong>{tailLabel}</strong> is what you are holding from {day(when.near)} onward, on its own.
            </p>
            <p>
              The two are not additive: what the {day(when.near)} leg returns depends on where the stock is
              that day, and the second line starts from wherever that leaves you.
              {own.tailZeros?.length ? ` It turns over at ${evens(own.tailZeros)}.` : ""}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            At expiry, intrinsic value only. Drawn on{" "}
            {net === null
              ? "the midpoints above"
              : `${fmtMoney(Math.abs(net) * 100)} ${net < 0 ? "paid" : "received"} per contract`}.
          </p>
        )}
        {when.multi && (
          <p className="text-[10px] text-slate-400">
            Curved sections are a model — constant volatility, no dividends, European exercise on American
            contracts. Where a line reaches a leg&rsquo;s own expiry it is arithmetic, not an estimate.
          </p>
        )}
      </Section>

      <Section
        title="Advanced analysis"
        subtitle={subtitle}
        open={openBookView}
        onToggle={() => setOpenBookView((v) => !v)}
      >
        {!combined ? (
          <p className="text-xs text-slate-500">
            {positions === null
              ? `This screen doesn't carry open positions, so nothing was read about ${setup.ticker} here.`
              : `This account holds nothing on ${setup.ticker}.`}
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
                label="Unrealized now"
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
            <p className="text-[11px] text-slate-500">
              Both lines at {day(when.near)}. The unrealized figure is at the market now — a different
              question, not a second view of the same one.
            </p>
            {combined.unpriceable?.length > 0 && (
              <p className="text-[11px] text-amber-700">
                {combined.unpriceable.length} open{" "}
                {combined.unpriceable.length === 1 ? "position is" : "positions are"} left out of the lines
                (an adjusted contract does not deliver 100 shares).
              </p>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
