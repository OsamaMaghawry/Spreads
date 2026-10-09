import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Loader2, Plug, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/AuthLayout";

// Where a person approves an AI app -- Claude -- reading their DeltaMint
// account through the connector (supabase/functions/mcp).
//
// Supabase Auth's OAuth server sends the browser here with an
// `authorization_id` when Claude asks to connect; this page is the "authorization
// path" set in the project's OAuth Server settings. It says plainly what the
// app will and will not be able to do, and the person chooses. Supabase issues
// the token only after Allow; Deny sends Claude an access_denied.
//
// LAB. Listed in LAB_MODULES (vite.config.js) and routed only when LAB is on,
// so the production build does not contain it. Production has no OAuth server
// switched on either, so nothing could send anyone here.
//
// The list of what the connector cannot do is a promise the server keeps on
// its own: the token is refused by every function that can act on an account
// (supabase/functions/_shared/connectorToken.ts) and by every table for writes
// (migration 0058). If that ever changes, this page has to change with it.

const CAN = [
  "See your connected accounts, balances and buying power",
  "See your open positions as DeltaMint shows them",
  "Run the Strategy Scanner on the filters you give it",
  "Read option chains for the symbols you ask about"
];
const CANNOT = [
  "Place, change or cancel any order",
  "Change your accounts, settings or billing",
  "See your password or your broker login"
];

export default function OAuthConsent() {
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authorizationId = new URLSearchParams(location.search).get("authorization_id");

  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // "allow" | "deny" | null

  // Signed out: sign in first, then come straight back here with the same id.
  useEffect(() => {
    if (isLoadingAuth || isAuthenticated) return;
    navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [isLoadingAuth, isAuthenticated, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!isAuthenticated || !authorizationId) return;
    let live = true;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: err }) => {
      if (!live) return;
      if (err) { setError(err.message || "This request could not be read. Start the connection again from Claude."); return; }
      // Approved before for the same access: Supabase hands back where to go.
      if (data && !("authorization_id" in data) && data.redirect_url) { window.location.href = data.redirect_url; return; }
      setDetails(data);
    });
    return () => { live = false; };
  }, [isAuthenticated, authorizationId]);

  const decide = async (allow) => {
    setBusy(allow ? "allow" : "deny");
    setError("");
    const fn = allow ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error: err } = await fn.call(supabase.auth.oauth, authorizationId, { skipBrowserRedirect: true });
    if (err || !data?.redirect_url) {
      setBusy(null);
      setError(err?.message || "That did not go through. Try again, or start the connection again from Claude.");
      return;
    }
    window.location.href = data.redirect_url;
  };

  const appName = details?.client?.name || "This app";
  let returnHost = null;
  try { returnHost = details?.redirect_uri ? new URL(details.redirect_uri).host : null; } catch { returnHost = null; }

  return (
    <AuthLayout
      icon={Plug}
      title={details ? `Connect ${appName} to DeltaMint?` : "Connect an app to DeltaMint"}
      subtitle={user?.email ? `Signed in as ${user.email}` : undefined}
    >
      {!authorizationId ? (
        <p className="text-sm text-dm-text">
          This page opens when an app such as Claude asks to connect to your DeltaMint account. Start the
          connection from that app.
        </p>
      ) : !details && !error ? (
        <div className="flex items-center justify-center py-6 text-dm-sub">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </div>
      ) : (
        <div className="space-y-5">
          {details && (
            <>
              <section>
                <h2 className="text-sm font-semibold text-dm-text mb-2">{appName} will be able to</h2>
                <ul className="space-y-1.5">
                  {CAN.map((t) => (
                    <li key={t} className="flex gap-2 text-sm text-dm-text">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-dm-positive" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="text-sm font-semibold text-dm-text mb-2">It will not be able to</h2>
                <ul className="space-y-1.5">
                  {CANNOT.map((t) => (
                    <li key={t} className="flex gap-2 text-sm text-dm-text">
                      <X className="w-4 h-4 mt-0.5 shrink-0 text-dm-negative" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
              <p className="text-xs leading-relaxed text-dm-sub">
                Trades it finds are matches to the filters you give it, not advice. To place one, you open
                DeltaMint and send it yourself. You can disconnect at any time in {appName}&rsquo;s connector
                settings.
                {returnHost && <> After you choose, you&rsquo;ll go back to <span className="font-medium text-dm-text">{returnHost}</span>.</>}
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-dm-negative">{error}</p>
          )}

          {details && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => decide(false)}>
                {busy === "deny" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : "Deny"}
              </Button>
              <Button className="flex-1" disabled={busy !== null} onClick={() => decide(true)}>
                {busy === "allow" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : "Allow"}
              </Button>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
