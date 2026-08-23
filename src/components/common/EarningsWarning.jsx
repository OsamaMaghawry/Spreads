import { CalendarClock } from "lucide-react";
import { earningsWhen } from "@/lib/risk";

// Flags an earnings announcement the position would be held through.
//
// Stated as a fact about the calendar, not a recommendation: an earnings gap is
// the largest single-day move most underlyings make, and a defined-risk short
// premium position can travel its whole width on one. Whether that is
// acceptable is the trader's call.
export default function EarningsWarning({ earnings, ticker, compact = false }) {
  if (!earnings) return null;

  const when = earningsWhen(earnings);
  const days = earnings.daysAway;

  if (compact) {
    return (
      <span
        title={`${ticker} reports ${when} — before this position expires`}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700"
      >
        <CalendarClock className="w-3 h-3" />
        Earnings
      </span>
    );
  }

  return (
    <div className="flex gap-2 border border-amber-200 bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
      <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">
          {ticker} reports earnings {when}
          {days === 0 ? " — today" : days === 1 ? " — tomorrow" : ` — in ${days} days`}.
        </span>
        <div className="mt-1 text-amber-700">
          This position would be held through the announcement, which is typically
          the largest one-day move the underlying makes.
        </div>
      </div>
    </div>
  );
}
