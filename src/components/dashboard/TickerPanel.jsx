import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { dayChange, dayChangeLabel } from "@/lib/dayChange";
import { tickerBook, curveRange, payoffCurve, crossings } from "@/lib/tickerBook";
import PayoffChart from "./PayoffChart";
import SpreadStructure from "./SpreadStructure";
import { kindOf, isSingle } from "@/lib/positionKind";

// One name, all of it, as one position.
//
// The rest of the dashboard is organised by structure, which is what you want
// when acting on a single trade and the wrong shape entirely when deciding
// about a name: a repair is a share lot on one card and a call ratio on
// another, and the number that decides whether to act -- where the two
// together stop losing money -- appears on neither. This is that number, and
// the curve it comes from.
export default function TickerPanel({ ticker, spreads, open, onOpenChange }) {
  const book = useMemo(() => (ticker ? tickerBook(spreads, ticker) : null), [ticker, spreads]);

  const chart = useMemo(() => {
    if (!book) return null;
    const range = curveRange(book);
    if (!range) return null;
    const curve = payoffCurve(book, range);
    const marks = [];
    book.rows.forEach((s) => {
      if (s.type === "shares") {
        const basis = Number(s.shareBasis ?? s.longEntryPrice);
        if (basis > 0) marks.push({ label: "Basis", value: basis });
        return;
      }
      (s.legs || []).forEach((l) => {
        if (Number(l.strike) > 0) {
          marks.push({ label: `${l.side === "short" ? "S" : "L"} ${fmtMoney(l.strike)}`, value: Number(l.strike) });
        }
      });
    });
    // One mark per price: a repair writes two contracts at one strike and
    // would otherwise stack two labels on the same pixel.
    const seen = new Set();
    return {
      curve,
      crossings: crossings(curve),
      marks: marks.filter((m) => (seen.has(m.value) ? false : seen.add(m.value)))
    };
  }, [book]);

  if (!book) return null;

  const change = dayChange(book.spot, book.prevClose);
  const zeros = chart?.crossings || [];
  const rising = zeros.filter((z) => z.rising);
  const falling = zeros.filter((z) => !z.rising);

  const stats = [
    {
      label: "Unrealized P/L",
      value: fmtMoney(book.unrealizedPL),
      tone: book.unrealizedPL > 0 ? "text-emerald-600" : book.unrealizedPL < 0 ? "text-rose-600" : "",
      title: "Every position on this ticker at today's marks, added up."
    },
    {
      label: "If it expired now",
      value: book.expirationPL === null ? "—" : fmtMoney(book.expirationPL),
      tone:
        book.expirationPL > 0 ? "text-emerald-600" : book.expirationPL < 0 ? "text-rose-600" : "",
      title:
        book.expirationPL === null
          ? "One position here cannot be settled to intrinsic value, so this total is withheld rather than shown short."
          : "Intrinsic value only, at the price above — no time premium left."
    },
    {
      label: "Shares",
      value: book.shares ? book.shares.toLocaleString() : "—",
      title: "Net shares held on this ticker."
    },
    {
      label: "Contracts",
      value:
        book.longContracts || book.shortContracts
          ? `${book.longContracts} long · ${book.shortContracts} short`
          : "—",
      title: "Option contracts across every structure on this ticker."
    },
    {
      label: "Capital tied up",
      value: book.committed > 0 ? fmtMoney(book.committed) : "—",
      title: "Cash securing short puts plus the market value of shares held."
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-2.5">
            <span>{ticker}</span>
            {book.spot > 0 && (
              <span className="text-base font-medium tabular-nums text-slate-700">{fmtMoney(book.spot)}</span>
            )}
            {change && (
              <span className={`text-xs font-medium tabular-nums ${change.up ? "text-emerald-600" : "text-rose-600"}`}>
                {dayChangeLabel(change)} <span className="font-normal text-slate-400">today</span>
              </span>
            )}
            <span className="text-xs font-normal text-slate-400">
              {book.rows.length} position{book.rows.length === 1 ? "" : "s"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-7 gap-y-3">
          {stats.map((s) => (
            <div key={s.label} title={s.title}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-sm font-medium tabular-nums ${s.tone || "text-slate-800"}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {chart && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 pt-3 text-[11px] uppercase tracking-wider text-slate-500">
              Combined P/L at expiry
            </div>
            <PayoffChart
              curve={chart.curve}
              spot={book.spot}
              crossings={chart.crossings}
              marks={chart.marks}
            />
          </div>
        )}

        {/* The sentences the curve is worth reading for, said plainly. A chart
            nobody can summarise is decoration. */}
        <div className="text-sm text-slate-600 leading-relaxed">
          {zeros.length === 0 ? (
            <p>
              Nothing on this ticker crosses break-even inside the range drawn — the whole position is{" "}
              {chart?.curve?.[0]?.pl >= 0 ? "ahead" : "behind"} at every price shown.
            </p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {rising.map((z) => (
                <li key={`up-${z.price}`}>
                  Flat at <span className="font-medium tabular-nums text-slate-900">{fmtMoney(z.price)}</span> —
                  below that the whole position is losing, above it, making.
                </li>
              ))}
              {falling.map((z) => (
                <li key={`down-${z.price}`}>
                  Back to flat at{" "}
                  <span className="font-medium tabular-nums text-slate-900">{fmtMoney(z.price)}</span> — above
                  there the short side gives back more than the rest makes.
                </li>
              ))}
            </ul>
          )}
          {book.unpriceable.length > 0 && (
            <p className="mt-2 text-amber-700">
              {book.unpriceable.length} position{book.unpriceable.length === 1 ? " is" : "s are"} on adjusted
              contracts and {book.unpriceable.length === 1 ? "is" : "are"} not in this curve — their
              deliverable is no longer 100 shares, so there is no honest way to price them here.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {book.rows.map((s, i) => (
            <div key={`${s.shortSymbol}_${s.longSymbol}_${i}`} className="px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <SpreadStructure spread={s} />
              {isSingle(s) && kindOf(s) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-600">
                  {kindOf(s).badge}
                </span>
              )}
              {s.structureLabel && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-200 bg-teal-100 text-teal-700">
                  {s.structureLabel}
                </span>
              )}
              <span
                className={`ml-auto text-sm font-medium tabular-nums ${
                  s.unrealizedPL > 0 ? "text-emerald-600" : s.unrealizedPL < 0 ? "text-rose-600" : "text-slate-600"
                }`}
              >
                {fmtMoney(s.unrealizedPL || 0)}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
