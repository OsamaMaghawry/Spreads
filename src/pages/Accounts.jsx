import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invokeFunction } from "@/lib/functions";
import { SAFE_ACCOUNT_COLUMNS } from "@/lib/accountColumns";
import { Plus, Pencil, Trash2, KeyRound, Link2 } from "lucide-react";
import AccountForm from "@/components/accounts/AccountForm";
import { startAlpacaOAuth, describeOAuthConfig } from "@/lib/alpacaOAuth";
import useAdminSettings from "@/lib/useAdminSettings";
import AdminMaintenance from "@/components/accounts/AdminMaintenance";

export default function Accounts() {
  const [accounts, setAccounts] = useState(null);
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

  // Straight to Alpaca, with nothing in between.
  //
  // There used to be a modal here repeating Alpaca's authorization disclosure
  // before the redirect, on the reading that the DDQ's "[Name]" template was a
  // screen we had to build and that acknowledgement had to happen before
  // leaving our app. Watching an approved app connect settles it: Connect goes
  // directly to app.alpaca.markets, and Alpaca renders "Authorize <app>" with
  // that disclosure themselves, from the registered app name. The template
  // describes their page. The acknowledgement the DDQ asks for is the Allow
  // button on it, which comes before the token exchange that actually connects
  // the account. Our own copy of it was a second, redundant consent that looked
  // like Alpaca's but was not.
  const connect = () => {
    try {
      startAlpacaOAuth();
    } catch (e) {
      setConnectError(e.message);
    }
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trading_accounts")
      .select(SAFE_ACCOUNT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    setAccounts(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Credentials are encrypted server-side, so writes go through the saveAccount
  // function rather than straight to the table.
  const save = async (form) => {
    const res = await invokeFunction("saveAccount", {
      id: editing === "new" ? null : editing.id,
      name: form.name,
      apiKey: form.api_key,
      apiSecret: form.api_secret,
      isPaper: form.is_paper,
      spreadsClientPrefix: form.spreads_client_prefix,
      wheelClientPrefix: form.wheel_client_prefix
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
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Alpaca API credentials for the accounts shown on the monitor.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={connect}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors"
          >
            <Link2 className="w-4 h-4" /> Connect Alpaca
          </button>
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
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1 truncate">
                  {a.is_oauth
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
                {deleting === a.id ? (
                  <button onClick={() => remove(a)} className="px-3 py-1.5 rounded-lg text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                    Confirm delete
                  </button>
                ) : (
                  <button onClick={() => setDeleting(a.id)} className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminMaintenance />

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
    </div>
  );
}