import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/functions";

// Who uses the AI connector (supabase/functions/mcp), and how.
//
// The owner, 9 Oct: "How do I know how many users using the MCP for Claude?
// ... if someone is using it right now, if I can have some statistics."
// Connections come from Supabase Auth's own record of each approval; usage
// from connector_calls, one row per request, kept 90 days (migration 0059).
// Each assistant names itself when it registers, so ChatGPT or Grok appear
// here under their own name without a change.
//
// Loads its own data, like Blog and Integrity, and refreshes every minute
// while open, so "In use now" stays true to its label.

const REFRESH_MS = 60_000;

const TOOL_LABEL = {
  find_trades: "Scanner (find trades)",
  get_positions: "Positions",
  get_trade_history: "Trade history",
  list_accounts: "Accounts",
  get_option_chain: "Option chain"
};

const when = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-dm-line bg-dm-panel px-4 py-3">
      <p className="text-xs text-dm-sub">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-dm-text">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-dm-sub">{hint}</p>}
    </div>
  );
}

export default function ConnectorPanel() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await invokeFunction("adminData", { action: "connectorStats" });
    setBusy(false);
    if (res.data?.error || res.error) setError(res.data?.error || res.error?.message || "Could not load the connector numbers.");
    else { setError(null); setStats(res.data); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>;
  if (!stats) return <div className="py-16 text-center text-sm text-dm-sub">Loading…</div>;

  const peak = Math.max(1, ...(stats.days || []).map((d) => d.calls));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-dm-sub">
          People using DeltaMint from an AI assistant. Requests are kept 90 days; figures below cover the last 30.
        </p>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dm-line px-2.5 py-1.5 text-xs text-dm-text hover:bg-dm-bg disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="In use now" value={stats.inUseNow} hint="a request in the last 5 minutes" />
        <Tile label="Connected" value={stats.connected} hint={stats.disconnected ? `${stats.disconnected} disconnected` : "people with an app connected"} />
        <Tile label="Active, 7 days" value={stats.active7d} hint={`${stats.active1d} today · ${stats.active30d} in 30 days`} />
        <Tile label="Requests, 30 days" value={stats.calls30d} hint={stats.errors30d ? `${stats.errors30d} failed` : "none failed"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-dm-line bg-dm-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-dm-text">By app</h2>
          {stats.apps.length === 0 ? (
            <p className="text-sm text-dm-sub">No one has connected an AI app yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-dm-sub"><th className="py-1 font-medium">App</th><th className="py-1 text-right font-medium">Connected</th><th className="py-1 text-right font-medium">Left</th><th className="py-1 text-right font-medium">Requests</th></tr></thead>
              <tbody>
                {stats.apps.map((a) => (
                  <tr key={a.app} className="border-t border-dm-line">
                    <td className="py-1.5 text-dm-text">{a.app}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.connected}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.disconnected}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.calls30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border border-dm-line bg-dm-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-dm-text">What they ask for</h2>
          {stats.tools.length === 0 ? (
            <p className="text-sm text-dm-sub">No requests in the last 30 days.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {stats.tools.map((t) => (
                <li key={t.tool} className="flex justify-between gap-3">
                  <span className="text-dm-text">{TOOL_LABEL[t.tool] || t.tool}</span>
                  <span className="tabular-nums text-dm-sub">{t.calls}{t.errors ? ` · ${t.errors} failed` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-dm-line bg-dm-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-dm-text">Requests per day</h2>
        {stats.days.length === 0 ? (
          <p className="text-sm text-dm-sub">Nothing yet. Each request through the connector appears here.</p>
        ) : (
          <ul className="space-y-1">
            {stats.days.map((d) => (
              <li key={d.day} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                <span className="tabular-nums text-dm-sub">{d.day}</span>
                <span className="h-2 rounded-full bg-dm-accent" style={{ width: `${Math.max(2, (d.calls / peak) * 100)}%` }} />
                <span className="tabular-nums text-dm-text">{d.calls} · {d.people} {d.people === 1 ? "person" : "people"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-dm-line bg-dm-panel p-4">
        <h2 className="mb-2 text-sm font-semibold text-dm-text">People</h2>
        {stats.people.length === 0 ? (
          <p className="text-sm text-dm-sub">No one yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-dm-sub"><th className="py-1 font-medium">Email</th><th className="py-1 font-medium">App</th><th className="py-1 font-medium">Connected</th><th className="py-1 font-medium">Last used</th><th className="py-1 text-right font-medium">Requests, 30 days</th></tr></thead>
              <tbody>
                {stats.people.map((p) => (
                  <tr key={p.email} className="border-t border-dm-line">
                    <td className="py-1.5 text-dm-text">{p.email}</td>
                    <td className="py-1.5 text-dm-sub">{p.disconnected ? "Disconnected" : p.apps || "—"}</td>
                    <td className="py-1.5 text-dm-sub">{when(p.connectedAt)}</td>
                    <td className="py-1.5 text-dm-sub">{when(p.lastUsed)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.calls30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
