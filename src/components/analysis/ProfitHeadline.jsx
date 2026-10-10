import { fmtMoney } from "@/lib/format";

// The one number at the top of Analysis.
//
// The owner, 9 Oct, after a day of reconciling it by hand: "I have 2000
// something. I have 1500 something. I have 300 something. I have 88. What
// the hell? ... No one would buy this." Four totals answered four slightly
// different questions -- premium only, whole view, booked, marked -- and the
// page made the reader work out which was which.
//
// Now the page answers one: what have my closed trades made, shares sold
// included. That figure does not move with prices, and it is the one the
// chart below ends on and the cards below measure. What is still open is said
// once, on its own line, as what it is: today's paper result, not added in.
//
// `stillOpen`: a number when the open book is priced; null when part of it
// has no price right now; undefined when there is nothing to say (nothing
// open, or a view narrowed to one strategy, which the open book cannot be).
export default function ProfitHeadline({ figure, trades, spanDays, stillOpen }) {
  const positive = (figure ?? 0) >= 0;
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-dm-sub">Profit on closed trades</div>
        <div
          className={`mt-1 font-heading text-[40px] font-bold leading-none tabular-nums ${
            positive ? "text-dm-positive" : "text-dm-negative"
          }`}
        >
          {figure === null || figure === undefined ? "—" : `${positive ? "+" : ""}${fmtMoney(figure)}`}
        </div>
        {stillOpen !== undefined && (
          <div className="mt-2 text-[12.5px] text-dm-sub">
            Still open:{" "}
            {stillOpen === null ? (
              "part of it has no price right now"
            ) : (
              <>
                <span className={`font-medium tabular-nums ${stillOpen >= 0 ? "text-dm-positive" : "text-dm-negative"}`}>
                  {fmtMoney(stillOpen)}
                </span>{" "}
                at today&rsquo;s prices
              </>
            )}
          </div>
        )}
      </div>
      <div className="pb-1 text-[11.5px] leading-snug text-dm-sub">
        {trades} closed trade{trades === 1 ? "" : "s"}
        <br />
        over {spanDays} day{spanDays === 1 ? "" : "s"}
      </div>
    </div>
  );
}
