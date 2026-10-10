import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { invokeFunction } from "@/lib/functions";
import useSubscription from "@/lib/useSubscription";
import { SAFE_ACCOUNT_COLUMNS } from "@/lib/accountColumns";
import { Plus, Pencil, Trash2, KeyRound, Link2 } from "lucide-react";
import ConfirmDeleteAccount from "@/components/common/ConfirmDeleteAccount";
import AccountForm from "@/components/accounts/AccountForm";
import AlpacaConnectConsent from "@/components/accounts/AlpacaConnectConsent";
import { startAlpacaOAuth, describeOAuthConfig } from "@/lib/alpacaOAuth";
import useAdminSettings from "@/lib/useAdminSettings";
import usePublicConfig from "@/lib/usePublicConfig";
import { LAB } from "@/lib/lab";

export default function Accounts() {
  const [accounts, setAccounts] = useState(null);
  const { plan } = useSubscription();
  const [editing, setEditing] = useState(null); // null | "new" | account
  const [deleting, setDeleting] = useState(null);
  // startAlpacaOAuth throws when this build cannot possibly complete the round
  // trip — no client id, or a redirect URI that does not belong to this origin.
  // Left unhandled it navigated nowhere and said nothing.
  const [connectError, setConnectError] = useState(null);
  const [showDiag, setShowDiag] = useState(false);
  const [diag, setDiag] = useState(null);
  const oauthConfig = describeOAuthConfig();

  // Pasting an Alpaca key and secret into this app is an operator tool, not a
  // feature: connecting through Alpaca is the only path a customer is offered.
  // It survives behind an admin-only switch that is off by default, for
  // testing against an account the OAuth app cannot reach. Both halves matter —
  // an administrator with the switch off sees no more than a customer does.
  const { isAdmin, settings } = useAdminSettings();
  const manualKeys = isAdmin && settings.manualApiKeys === true;
  // Demo is a customer-visible mode, so it comes from publicConfig rather than
  // the admin-only settings read -- this page renders for everyone.
  const { demoMode } = usePublicConfig();

  // Connect opens Alpaca's authorization disclosure HERE, in DeltaMint, and
  // only Allow on it leaves for Alpaca. Alpaca's compliance team required it:
  // "Confirm authorization disclosure is shown in DeltaMint UI before Alpaca
  // redirect." See AlpacaConnectConsent for why it was once removed.
  const [consenting, setConsenting] = useState(false);
  const connect = () => {
    setConnectError(null);
    setConsenting(true);
  };
  const allow = () => {
    setConsenting(false);
    try {
      startAlpacaOAuth({ acknowledged: true });
    } catch (e) {
      setConnectError(e.message);
    }
  };

  // ANY OTHER BROKER, READ-ONLY (lab). SnapTrade's portal connects the
  // broker; its Done button returns here with ?linked=1, and the accounts it
  // connected are added as DeltaMint accounts that are read and never traded.
  // See supabase/functions/brokerLink.
  const [linking, setLinking] = useState(false);
  const [linkNote, setLinkNote] = useState(null);
  const connectOther = async () => {
    setLinking(true);
    setLinkNote(null);
    const res = await invokeFunction("brokerLink", { action: "connect" });
    if (res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    setLinking(false);
    setLinkNote(res.data?.error || res.error?.message || "The broker list could not be opened.");
  };
  // `quiet` is the check on every visit: it says nothing unless there is
  // something to say, because the portal does not always send the user back
  // here, and a connection made there should still arrive.
  const importLinked = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLinking(true);
    const res = await invokeFunction("brokerLink", { action: "import" });
    setLinking(false);
    if (res.data?.error || res.error) {
      if (!quiet) setLinkNote(res.data?.error || res.error?.message);
      return false;
    }
    const n = res.data?.imported || 0;
    const list = (names) => [...new Set(names)].join(", ");
    const notes = [];
    if (n) notes.push(`Added ${n} account${n === 1 ? "" : "s"}, read-only.`);
    if (res.data?.waiting?.length) {
      notes.push(`${list(res.data.waiting)}: connected, but no accounts have arrived from the broker yet. A new connection can take a few minutes.`);
    }
    if (res.data?.broken?.length) notes.push(`${list(res.data.broken)}: the connection was cut off. Connect it again with "Another broker".`);
    if (notes.length) setLinkNote(notes.join(" "));
    else if (!quiet) setLinkNote("No new accounts to add.");
    return true;
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trading_accounts")
      .select(SAFE_ACCOUNT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    setAccounts(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Add whatever has been connected at the broker since the last visit. Back
  // from the portal (?linked=1) it reports even when there is nothing new;
  // otherwise it speaks only when something changed.
  useEffect(() => {
    if (!LAB) return;
    const params = new URLSearchParams(window.location.search);
    const back = params.get("linked") === "1";
    if (back) window.history.replaceState(null, "", window.location.pathname);
    importLinked({ quiet: !back }).then(() => load());
  }, [importLinked, load]);

  // Credentials are encrypted server-side, so writes go through the saveAccount
  // function rather than straight to the table.
  const save = async (form) => {
    const res = await invokeFunction("saveAccount", {
      id: editing === "new" ? null : editing.id,
      name: form.name,
      apiKey: form.api_key,
      apiSecret: form.api_secret,
      isPaper: form.is_paper
    });
    if (res.data?.error) throw new Error(res.data.error);
    setEditing(null);
    load();
  };

  const remove = async (account) => {
    const { error } = await supabase.from("trading_accounts").delete().eq("id", account.id);
    if (error) throw new Error(error.message);
    setDeleting(null);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-[-0.02em] text-dm-text">Accounts</h1>
          {/* Alpaca's rule, stated where it matters: a token is bound to one
              live and one paper account by account id, so several paper
              accounts means several trips through the consent screen. Ticking
              three at once does not connect three. */}
          <p className="text-xs text-slate-500 mt-0.5">
            The Alpaca accounts shown on the dashboard. Each authorization connects one live and one
            paper account — to add another paper account, connect again and tick just that one.
          </p>
          {demoMode && (
            <p className="mt-1.5 text-xs text-dm-accent">
              While DeltaMint is in demo, connect a <strong>paper</strong> account on Alpaca&rsquo;s
              consent screen. A live account will connect and sync, but no new order is sent to it.
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={connect}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors"
          >
            <Link2 className="w-4 h-4" /> Connect Alpaca
          </button>
          {LAB && (
            <button
              onClick={connectOther}
              disabled={linking}
              title="Schwab, Fidelity, Interactive Brokers, Robinhood and more — read-only"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-100 transition-colors disabled:opacity-60"
            >
              <Link2 className="w-4 h-4" /> {linking ? "Opening…" : "Another broker"}
            </button>
          )}
          {manualKeys && (
            <button
              onClick={() => setEditing("new")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-slate-500 border border-slate-200 text-sm hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add manually
            </button>
          )}
        </div>
      </div>

      {LAB && linkNote && (
        <div className="flex items-center gap-3 rounded-lg border border-dm-line bg-white px-4 py-2.5 text-sm text-slate-700">
          <span>{linkNote}</span>
          <button onClick={() => importLinked().then(() => load())} className="ml-auto text-xs underline text-slate-500 hover:text-slate-800">
            Check again
          </button>
        </div>
      )}

      {/* Alpaca reports an unregistered redirect URI and an unrecognised client
          id as the same "unknown client" page, on their domain, naming neither.
          The only way to tell them apart is to read what we sent — and once the
          button is pressed the browser has already left. So it is readable
          here, beforehand. */}
      <div className="text-right">
        <button
          onClick={() => setShowDiag((v) => !v)}
          className="text-[11px] text-slate-400 transition-colors hover:text-slate-600"
        >
          {showDiag ? "Hide connection details" : "Trouble connecting?"}
        </button>
      </div>
      {showDiag && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p>
            Every value below must match the OAuth app at{" "}
            <a href="https://app.alpaca.markets/connect" target="_blank" rel="noreferrer" className="underline">
              app.alpaca.markets/connect
            </a>
            . The redirect URI has to be registered there exactly as written.
          </p>
          <dl className="space-y-1 break-all font-mono text-[11px]">
            <div><dt className="inline text-slate-400">client_id: </dt><dd className="inline">{oauthConfig.clientId || "(not set)"}</dd></div>
            <div><dt className="inline text-slate-400">redirect_uri: </dt><dd className="inline">{oauthConfig.redirectUri}</dd></div>
            <div><dt className="inline text-slate-400">origin: </dt><dd className="inline">{oauthConfig.origin}</dd></div>
          </dl>
          <p className="pt-1 text-slate-500">Full authorization URL:</p>
          <code className="block break-all rounded-lg border border-slate-200 bg-white p-2 font-mono text-[10px] leading-relaxed">
            {oauthConfig.authorizeUrl}
          </code>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              onClick={() => navigator.clipboard?.writeText(oauthConfig.authorizeUrl)}
              className="text-[11px] underline hover:text-slate-900"
            >
              Copy URL
            </button>
            {/* Alpaca's authorize page reports an unrecognised app and an
                unregistered redirect URI identically. The token endpoint can
                tell them apart, because it authenticates on the client id and
                secret alone. */}
            <button
              onClick={async () => {
                setDiag({ verdict: "running" });
                const res = await invokeFunction("oauthDiag", { redirectUri: oauthConfig.redirectUri });
                setDiag(res.data?.error ? { verdict: "error", detail: res.data.error } : res.data);
              }}
              className="text-[11px] underline hover:text-slate-900"
            >
              Test app credentials
            </button>
          </div>
          {diag && (
            <div
              className={`rounded-lg border p-3 text-[11px] leading-relaxed ${
                diag.verdict === "credentials_accepted"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : diag.verdict === "running"
                    ? "border-slate-200 bg-white text-slate-500"
                    : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              {diag.verdict === "running" ? (
                "Asking Alpaca…"
              ) : (
                <>
                  <p>{diag.detail}</p>
                  {diag.serverClientId && diag.serverClientId !== oauthConfig.clientId && (
                    <p className="mt-2 font-medium">
                      The server exchanges with client id {diag.serverClientId}, but this page sends{" "}
                      {oauthConfig.clientId}. They must be the same app.
                    </p>
                  )}
                  {diag.alpacaMessage && (
                    <p className="mt-2 font-mono">
                      Alpaca {diag.alpacaStatus}: {diag.alpacaMessage}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {accounts === null ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <KeyRound className="w-8 h-8 text-slate-400" />
          <p className="text-slate-500 text-sm">No accounts yet — connect your Alpaca account to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-slate-900">{a.name}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    a.is_paper ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}>
                    {a.is_paper ? "Paper" : "Live"}
                  </span>
                  {a.provider === "snaptrade" && (
                    <span
                      title="Read through SnapTrade: positions, history and Analysis. DeltaMint places no orders on it."
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Read-only
                    </span>
                  )}
                  {/* In demo, a live account is read-only for OPENING and
                      nothing else: it still syncs, still shows its positions,
                      and can still be closed out of. Saying that on the row
                      itself beats letting someone find out at a ticket. */}
                  {!a.is_paper && demoMode && a.provider !== "snaptrade" && (
                    <span
                      title="Demo mode: no new order is sent to a live account. Closing is never blocked."
                      className="rounded-full border border-dm-line bg-dm-accent/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-dm-accent"
                    >
                      Watch only
                    </span>
                  )}
                  {/* Whether a live plan is in force. Presentation only: the
                      order function decides, and it also knows whether billing
                      is being enforced yet. Hidden in demo, where no plan
                      changes anything. */}
                  {!a.is_paper && !demoMode && a.provider !== "snaptrade" && (
                    <Link
                      to="/billing"
                      title={plan === "live" ? "Live plan active" : "No Live plan — opening live positions needs one once billing is enforced"}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors ${
                        plan === "live"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {plan === "live" ? "Live plan" : "No plan"}
                    </Link>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1 truncate">
                  {a.provider === "snaptrade"
                    ? `Via SnapTrade${a.broker_account_number ? ` · ${a.broker_account_number}` : ""}`
                    : a.is_oauth
                    ? a.broker_account_number
                      ? `Alpaca OAuth · ${a.broker_account_number}`
                      : "Connected via Alpaca OAuth"
                    : `Key: ${a.api_key_hint || "••••••••"} · Secret: ••••••••`}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {/* OAuth accounts are editable too. There are no credentials to
                    change, but Alpaca's API does not expose the nickname shown
                    on its own consent screen, so renaming here is the only way
                    to tell two connected accounts apart by anything but their
                    number. */}
                <button onClick={() => setEditing(a)} className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                {/* One click opens a dialog that names the account and says
                    what is lost. The old two-step turned the trash icon into
                    "Confirm delete" in the same position, so a second click
                    landing where the first did completed an irreversible,
                    cascading delete. */}
                <button
                  onClick={() => setDeleting(a)}
                  aria-label={`Remove ${a.name}`}
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AccountForm
          account={editing === "new" ? null : editing}
          allowCredentials={manualKeys}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}


      {connectError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-medium">Can't start the Alpaca connection</p>
          <p className="mt-1 leading-relaxed">{connectError}</p>
          {/* The values actually being sent. Alpaca reports a bad client id and
              an unregistered redirect URI as the same generic page on their
              domain, so the only way to tell them apart is to compare these
              against the OAuth app's settings. */}
          <dl className="mt-3 space-y-1 font-mono text-[11px] text-rose-700">
            <div><dt className="inline text-rose-500">client_id: </dt><dd className="inline">{oauthConfig.clientId || "(not set)"}</dd></div>
            <div><dt className="inline text-rose-500">redirect_uri: </dt><dd className="inline">{oauthConfig.redirectUri}</dd></div>
            <div><dt className="inline text-rose-500">origin: </dt><dd className="inline">{oauthConfig.origin}</dd></div>
          </dl>
          <button onClick={() => setConnectError(null)} className="mt-3 text-xs underline">Dismiss</button>
        </div>
      )}

      {consenting && (
        <AlpacaConnectConsent onCancel={() => setConsenting(false)} onContinue={allow} />
      )}

      {deleting && (
        <ConfirmDeleteAccount
          account={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}