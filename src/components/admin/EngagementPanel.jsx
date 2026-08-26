import StatTile from "./StatTile";
import SignupsChart from "./SignupsChart";
import { fmtMoney } from "@/lib/format";

// Every figure here is derived from tables the product already writes —
// profiles, trading_accounts, trade_records. Nothing on this screen depends on
// event tracking, which is why it could ship before any analytics work.

// The funnel is drawn as connected bars rather than four separate tiles
// because the drop-off between stages is the point. An account that signed up
// and never connected a broker is a different problem from one that connected
// and never traded, and only the shape shows which you have.
function Funnel({ funnel }) {
  const stages = [
    { key: "signedUp", label: "Signed up" },
    { key: "connected", label: "Connected a broker" },
    { key: "traded", label: "Placed a trade" },
    { key: "live", label: "Trading live (not paper)" }
  ];
  const top = Math.max(1, funnel.signedUp);

  return (
    <div className="rounded-lg border border-dm-line bg-dm-panel p-4">
      <h3 className="text-sm font-medium text-dm-text">Activation</h3>
      <div className="mt-4 space-y-3">
        {stages.map((s, i) => {
          const value = funnel[s.key] ?? 0;
          const prev = i === 0 ? null : funnel[stages[i - 1].key] ?? 0;
          const conversion = prev ? Math.round((value / prev) * 100) : null;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-dm-sub">{s.label}</span>
                <span className="tabular-nums text-dm-text">
                  {value}
                  {conversion !== null && (
                    <span className="ml-2 text-dm-sub">{conversion}% of previous</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-dm-bg">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(value / top) * 100}%`, background: "var(--dm-accent)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EngagementPanel({ engagement }) {
  const { funnel, active, totals, signupsByDay } = engagement;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active today" value={active.day} />
        <StatTile label="Active this week" value={active.week} />
        <StatTile label="Active this month" value={active.month} />
        <StatTile
          label="Trades recorded"
          value={totals.trades}
          sub={`${fmtMoney(totals.realizedPL)} realized across all users`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Funnel funnel={funnel} />
        <SignupsChart data={signupsByDay} />
      </div>

      <p className="text-[11px] leading-relaxed text-dm-sub">
        Active means signed in within the period. These figures come from account and trade
        records, not from page tracking, so they describe what people did in the product rather
        than how they arrived at it.
      </p>
    </div>
  );
}
