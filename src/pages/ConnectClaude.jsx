import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Plug, Unplug, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// "Use with Claude": how to connect DeltaMint to Claude, and the switch to
// disconnect it again.
//
// docs/product/connector.md.
//
// The list of connected apps comes from Supabase Auth's OAuth server
// (listGrants), and Disconnect revokes the grant there (revokeGrant), which
// ends the app's sessions and refresh tokens at once. So the user can cut
// Claude off from DeltaMint's side, not only from Claude's.
//
// What Claude can and cannot do repeats the approval page (OAuthConsent.jsx);
// the server keeps those promises on its own (connectorToken.ts, migration
// 0058). Change them together or not at all.

// Our address, not the Supabase function's: the marketing site passes /mcp
// through to it (landing/src/connector.js).
const MCP_URL = `${String(import.meta.env.VITE_SITE_URL || "https://deltamint.app").replace(/\/+$/, "")}/mcp`;

const CAN = [
  "List your connected accounts, balances and buying power",
  "Read your open positions as the Dashboard groups them",
  "Run the Strategy Scanner on the filters you give it",
  "Read option chains for the symbols you ask about",
  "Read your closed trades, totals and win rate"
];
const CANNOT = [
  "Place, change or cancel any order",
  "Change your accounts, settings or billing",
  "See your password or your broker login"
];
const TRY = [
  "Find put spreads on SPY and QQQ, 7–14 days, delta under 0.20",
  "Covered calls on the shares I hold",
  "What's open in my account and what's at risk this week?",
  "How have my TSLA covered calls done since August, and what's my win rate?"
];

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-dm-line bg-white px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm text-dm-text">{value}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dm-line px-2.5 py-1.5 text-xs font-medium text-dm-text hover:bg-dm-bg"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ConnectedApps() {
  const [grants, setGrants] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const { data, error: err } = await supabase.auth.oauth.listGrants();
    if (err) { setError(err.message || "Could not read connected apps."); setGrants([]); return; }
    setGrants(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async (clientId) => {
    setBusy(clientId);
    const { error: err } = await supabase.auth.oauth.revokeGrant({ clientId });
    setBusy(null);
    if (err) { setError(err.message || "Could not disconnect. Try again."); return; }
    load();
  };

  if (grants === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-dm-sub">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking connected apps…
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {grants.length === 0 && !error && <p className="text-sm text-dm-sub">No app is connected to your DeltaMint account.</p>}
      {grants.map((g) => (
        <div key={g.client?.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-dm-line bg-white px-3 py-2.5">
          <Plug className="h-4 w-4 text-dm-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-dm-text">{g.client?.name || "Connected app"}</p>
            {g.granted_at && (
              <p className="text-xs text-dm-sub">Connected {new Date(g.granted_at).toLocaleDateString()}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => disconnect(g.client?.id)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-dm-line px-2.5 py-1.5 text-xs font-medium text-dm-negative hover:bg-dm-bg disabled:opacity-60"
          >
            {busy === g.client?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Unplug className="h-3.5 w-3.5" aria-hidden="true" />}
            Disconnect
          </button>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-dm-negative">{error}</p>}
    </div>
  );
}

export default function ConnectClaude() {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-[-0.02em] text-dm-text">Use with Claude</h1>
        <p className="mt-1 text-sm text-dm-sub">
          Connect once, then ask Claude in plain English. It runs the Strategy Scanner on your filters and reads
          your positions, option chains and closed trades — the same numbers you see here. It is read-only: nothing
          it does can place a trade.
        </p>
      </div>

      <section className="rounded-xl border border-dm-line bg-dm-panel p-5">
        <h2 className="text-sm font-semibold text-dm-text">1. Copy the connector address</h2>
        <CopyField value={MCP_URL} />
        <h2 className="mt-5 text-sm font-semibold text-dm-text">2. Add it in Claude</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-dm-text">
          <li>In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>.</li>
          <li>Choose <strong>Add custom connector</strong>, name it DeltaMint, and paste the address.</li>
          <li>Click <strong>Add</strong>, then <strong>Connect</strong>. Sign in to DeltaMint when asked and choose <strong>Allow</strong>.</li>
        </ol>
        <h2 className="mt-5 text-sm font-semibold text-dm-text">3. Ask</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-dm-sub">
          {TRY.map((t) => <li key={t}>“{t}”</li>)}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-dm-line bg-dm-panel p-5">
          <h2 className="mb-2 text-sm font-semibold text-dm-text">Claude can</h2>
          <ul className="space-y-1.5">
            {CAN.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-dm-text">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-dm-positive" aria-hidden="true" />{t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-dm-line bg-dm-panel p-5">
          <h2 className="mb-2 text-sm font-semibold text-dm-text">Claude can't</h2>
          <ul className="space-y-1.5">
            {CANNOT.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-dm-text">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-dm-negative" aria-hidden="true" />{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-dm-line bg-dm-panel p-5">
        <h2 className="mb-3 text-sm font-semibold text-dm-text">Connected apps</h2>
        <ConnectedApps />
      </section>

      <p className="text-xs leading-relaxed text-dm-sub">
        Trades Claude finds are matches to the filters you set, ranked by return on risk — the Scanner's own
        ranking. They are not recommendations. To place one, you send it from DeltaMint, which checks the price again
        first.
      </p>
    </div>
  );
}
