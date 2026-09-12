import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { scaledRisk } from "@/lib/setupUnit";
import RiskMeter from "./RiskMeter";
import EarningsWarning from "./EarningsWarning";

// What a trader is owed before sending an order: what it risks as a share of
// the account, and whether it is held through an earnings announcement.
//
// Shared rather than duplicated so the screener and the account's own
// open-position dialog cannot drift apart — the same order reached by either
// route has to show the same numbers, from the same equity fetch.
export default function PreTradeRisk({ setup, accountId, qty }) {
  const [equity, setEquity] = useState(null);

  // Equity is per account, so it is refetched when the target account changes.
  // A failure leaves it null and RiskMeter says so rather than guessing.
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    setEquity(null);
    invokeFunction("accountEquity", { accountId })
      .then((res) => { if (live && !res.data?.error) setEquity(res.data?.equity ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [accountId]);

  return (
    <>
      <EarningsWarning earnings={setup.earnings} ticker={setup.ticker} />
      {/* `scaledRisk`, never `maxRisk * qty` -- multiplying an unbounded
          position's null risk gave 0, and a 0% bar labelled "Contained".
          No `note`: the meter printed the same sentence the preview above it
          had just printed, which is the repetition the owner objected to. The
          explanation belongs once, in Analysis. */}
      <RiskMeter risk={scaledRisk(setup.maxRisk, qty)} equity={equity} />
    </>
  );
}
