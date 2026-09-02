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
    {
      key: "traded",
      label: "Traded",
      // "Placed a trade" implied placing it here. These rows are reconstructed
      // from the broker's own activity feed, so they include trades made
      // directly in the brokerage, and only appear once a sync has run.
      hint: "At least one trade in their broker history. Includes trades placed outside DeltaMint, and only counts after a sync."
    },
    {
      key: "live",
      label: "Traded live (not paper)",
      hint: "At least one trade on a non-paper account."
    },
    {
      key: "paying",
      label: "Paying",
      hint: "An active Live subscription, past its first invoice. Trials and grandfathered users do not count. Reads 0 until billing is live."
    }
  ];
  const top = Math.max(1, funnel.signedUp);

  return (
    <div className="rounded-lg border border-dm-line bg-dm-panel p-4">
      <h3 className="text-sm font-medium text-dm-text">Activation</h3>
      <div className="mt-4 space-y-3">
        {stages.map((s, i) => {
          const value = funnel[s.key] ?? 0;
          const prev = i === 0 ? null : funnel[stages[i - 1].key] ?? 0;
          // A stage can never exceed the one above it; every stage here is a
          // subset of its predecessor. If that is ever violated the honest
          // thing is to show no ratio rather than a "150% of previous" that
          // cannot mean anything — which is what this panel used to print.
          const conversion = prev && value <= prev ? Math.round((value / prev) * 100) : null;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-dm-sub" title={s.hint || undefined}>
                  {s.label}
                  {s.key === "connected" && funnel.liveConnected > 0 && (
                    <span className="ml-1.5 text-[10px] text-dm-sub/70">
                      {funnel.liveConnected} live
                    </span>
                  )}
                </span>
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

// The quarter's line, from docs/growth/plan-100.md: 100 paying by 31 Dec 2026,
// counted from the day billing switches on. Until then the target reads as a
// distance, not a pace.
const TARGET = { paying: 100, by: "2026-12-31" };

export default function EngagementPanel({ engagement, metrics }) {
  const { funnel, active, totals, signupsByDay, bySource } = engagement;
  const search = metrics?.search?.last28;
  const ga = metrics?.analytics?.last28;
  const daysLeft = Math.max(0, Math.ceil((new Date(TARGET.by) - new Date()) / 86400000));
  const sources = Object.entries(bySource || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Search impressions, 28d"
          value={search ? search.impressions : "—"}
          sub={search ? `${search.clicks} clicks · CTR ${(search.ctr * 100).toFixed(1)}%` : metrics?.search?.unavailable || "Search Console not connected"}
        />
        <StatTile
          label="Visitors, 28d"
          value={ga ? ga.users : "—"}
          sub={ga ? `${ga.sessions} sessions` : metrics?.analytics?.unavailable || "GA4 not connected"}
        />
        <StatTile
          label="Paying"
          value={funnel.paying ?? 0}
          sub={`of ${TARGET.paying} by ${TARGET.by} · ${daysLeft} days left`}
        />
        <StatTile label="Signups this month" value={signupsByDay.reduce((a, d) => a + d.count, 0)} sub="last 30 days" />
      </div>

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

      {sources.length > 0 && (
        <div className="rounded-lg border border-dm-line bg-dm-panel p-4">
          <h3 className="text-sm font-medium text-dm-text">Where signups came from</h3>
          <p className="mt-0.5 text-[11px] text-dm-sub">Recorded once at registration from the link the visitor arrived on. "unknown" is everyone who signed up before this was recorded.</p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {sources.map(([src, n]) => (
              <li key={src} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-dm-sub">{src}</span>
                <span className="tabular-nums text-dm-text">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-dm-sub">
        Active means recorded use of the app within the period, falling back to sign-in for
        accounts that predate activity tracking. These figures come from account and trade
        records, not from page tracking, so they describe what people did in the product rather
        than how they arrived at it.
      </p>
    </div>
  );
}
