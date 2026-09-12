import { ChevronDown } from "lucide-react";
import { fmtMoney } from "@/lib/format";

// Whole view / Premium only.
//
// The owner's names, kept over the ones the bench proposed, because they say
// what each view is FOR rather than what it technically contains:
//
//   Whole view    "How is the strategy doing?"        -> judging performance
//   Premium only  "What did the option legs come to?"  -> credits AND debits
//
// Premium only is NOT "what selling options banked", and the screen said it
// was. `premiumOnly` sums premium_pl + early_close_pl, and premium_pl is
// SIGNED -- negative on a net debit. This account holds three long-only rows
// (TSLA260909P00365000, TSLA260918P00365000, TSLA260918C00352500) that are
// BOUGHT options: $2,674 of debits paid, contributing +$805 between them. The
// 352.50 call alone is +$1,182, paid at 13.57 and sold at 25.39 -- a long
// directional trade that closed for a gain, and nothing about it was banked
// from selling anything.
//
// PREMIUM ONLY IS NOT A TAX VIEW, and the screen said it was. The first version
// told the user this was "the view to use against a 1099-B". It is not, in
// three independent ways: it excludes share sales, which are the largest lines
// on a wheel trader's 1099-B; on an assigned put the premium is not option
// income at all, it reduces the stock basis; and no wash sale, straddle or
// §1256 treatment is applied anywhere in this product. The tax paragraph
// further down AccountAnalysis already says all of that. A user who followed
// the deleted clause would have filed short by their share proceeds.
//
// WHOLE VIEW IS THE DEFAULT, and the reason is not prudence. A wheel trader who
// is assigned has not lost: he has been paid a premium and bought stock at a
// discount he chose in advance. Half his return lives in the shares by design.
// Reporting only the premium describes a different strategy from the one being
// run -- on the account this was built for, +$1,737 against roughly +$11,000.
//
// The symmetry is what makes the default honest rather than promotional: in a
// week those shares are down, Whole view shows the loss just as loudly.
//
// WHY THIS IS A DROPDOWN AND NOT TWO CHIPS. The first build put two small
// buttons under the header, each showing its own figure. The owner: *"don't do
// like a bond or something, because the filtering is so shadow, so shadow. Make
// it like a dropdown menu or something stronger. I don't want to see something
// like, you give me some numbers when I say whole view."* Two chips side by
// side read as a comparison of two numbers rather than a control over the page,
// and showing both figures at once was the whole problem — it invited the eye
// to read the other one. So: one control, one figure, the selected view named
// in full, and a line saying in words that everything below obeys it.

const OPTIONS = [
  {
    key: "whole",
    label: "Whole view",
    sub: "Closed trades, shares held, and open option legs",
    // WHAT THIS SENTENCE MAY NOT SAY. The first version claimed every figure
    // below "includes the gain or loss on shares still held at today's price".
    // The mark reaches exactly three outputs -- totalPL, roe, returnOnRisk --
    // and reaches NONE of them under a strategy tab or a date range, because
    // scopedUnrealized is null there. The sentence rendered unconditionally.
    //
    // So there are now two of it, and the caller says which is true. This was
    // recorded as a defect in this comment and left unfixed; it is the same
    // defect as the blanked headline below -- one text describing two states --
    // and it is fixed the same way, by saying which state this is.
    long: "Every figure below counts the whole position: the option legs and the shares they delivered. Everything still open — shares held, and option legs not yet closed — is marked into the total, return on equity and return on risk. The win and loss figures are outcomes of closed positions and cannot count an open one.",
    // SCOPED TO THE THREE OUTPUTS THE MARK ACTUALLY REACHES, and no wider. The
    // first draft of this variant said "nothing still open is inside them" of
    // every figure below, which the equity line contradicts: on the daily
    // series that line is realized + shares open + option legs open at each
    // day's close, so the open book IS inside it. Reproducing the original
    // defect in the mirror direction is not a fix. The chart explains itself
    // where it is drawn -- see EquityCurveChart's reconciliation caption.
    //
    // It also may not say "while this page is narrowed". `marked` goes false
    // for a second reason -- an unfiltered page holding a position the broker
    // will not price -- and naming a filter there invents one the reader never
    // set, which is the mistake headline.js explicitly refuses to make.
    unmarked: "Every figure below counts the whole position: the option legs and the shares they delivered. Here the total, return on equity and return on risk are realized money alone — what is still open is listed below on its own rather than added into them. The win and loss figures are outcomes of closed positions and cannot count an open one."
  },
  {
    key: "premium",
    label: "Premium only",
    sub: "Closed option legs only, net of what closing them cost",
    // "Shares are not in any number on this page" was contradicted three
    // inches away by the open-book panel's share counts and by the
    // "Shares already sold took off $442.00" line directly underneath.
    long: "Every figure below counts the option legs that have CLOSED — credits taken and debits paid. No share result is inside any of them, and neither is any option leg still open; both are still listed below, unpriced."
  }
];

// `figureLabel` rather than a label derived from the view, because the same
// view has two honest headings. Under a filter the mark on everything still
// open cannot be added, so the figure is booked money and the heading has to
// say so -- see src/lib/headline.js for the owner's "Should be a number here"
// and why blanking it was the wrong answer to a real problem.
export default function ViewSwitch({ value, onChange, figure, figureLabel, note, marked = true }) {
  const active = OPTIONS.find((o) => o.key === value) || OPTIONS[0];
  const showFigure = figure !== null && figure !== undefined && !isNaN(figure);
  // Whole view has two truths and `marked` picks the one this page is showing.
  // Premium only has one, and carries no `unmarked` text to fall back to.
  const describes = (!marked && active.unmarked) || active.long;

  return (
    <div className="bg-white border-2 border-slate-900 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-stretch">
        <div className="flex-1 min-w-[260px] p-4">
          <label
            htmlFor="analysis-view"
            className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1.5"
          >
            This page is showing
          </label>
          {/* A native select, deliberately. It is one tap on a phone, it is
              keyboard- and screen-reader-correct without a line of our own
              code, and the chevron below is decorative only. A hand-rolled
              listbox would be a second thing to keep working. */}
          <div className="relative">
            <select
              id="analysis-view"
              value={active.key}
              onChange={(e) => onChange(e.target.value)}
              className="w-full appearance-none bg-slate-900 text-white text-base font-semibold rounded-lg pl-3.5 pr-10 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} — {o.sub}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 text-white absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{describes}</p>
        </div>

        {/* One figure, the selected view's. Never both: showing the other
            view's number beside it is what made the control read as a
            comparison instead of a filter. */}
        <div className="min-w-[190px] border-t sm:border-t-0 sm:border-l border-slate-200 bg-slate-50 p-4 flex flex-col justify-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
            {figureLabel || `${active.label} total`}
          </div>
          <div
            className={`text-2xl font-semibold tabular-nums mt-1 ${
              !showFigure ? "text-slate-400" : figure >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {showFigure ? `${figure >= 0 ? "+" : ""}${fmtMoney(figure)}` : "—"}
          </div>
          {/* The note is NOT only for a dash. Its more common job now is to say
              what a real number leaves out — the mark on everything still open,
              which no filtered figure can contain. A dash still always says
              why: brand.md, a figure that cannot be trusted renders as "—",
              never as a substitute number, and never without its reason, or it
              reads as broken rather than withheld. */}
          {note && <div className="text-[10px] text-amber-700 mt-1 leading-snug">{note}</div>}
        </div>
      </div>
    </div>
  );
}
