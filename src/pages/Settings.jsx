import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

// Account settings. Today that is one thing: whether the weekly digest comes.
//
// WHY THIS PAGE EXISTS, AND WHY IT COULD NOT WAIT. The weekly email's footer
// has always carried "Stop receiving these weekly emails", pointing at
// `/settings?email=off`. There was no such route, and `profiles` carried only
// a select policy, so nothing in the browser could have written the column
// even if the page had existed. While the digest went to the owner alone that
// was a dead link in his own inbox. The moment delivery becomes "users" it is
// bulk email to real people with an opt-out that does nothing.
//
// `?email=off` UNSUBSCRIBES ON ARRIVAL rather than presenting a button to
// press. Someone who clicked "stop sending me this" has already told us what
// they want; making them hunt for a second control is a dark pattern, and the
// state is shown and reversible right here if they landed by accident.
export default function Settings() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [optOut, setOptOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [justChanged, setJustChanged] = useState(false);

  const write = useCallback(async (next) => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("set_weekly_digest_opt_out", { p_opt_out: next });
    if (rpcError) {
      setError("We could not save that. Please try again, or email support@deltamint.app and we will do it for you.");
    } else {
      setOptOut(next);
      setJustChanged(true);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("weekly_digest_opt_out")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const current = Boolean(data?.weekly_digest_opt_out);
      // The link from the email. Acted on once, then cleared from the URL so a
      // refresh or a back-button does not re-run it.
      if (params.get("email") === "off") {
        setParams({}, { replace: true });
        if (!current) {
          await write(true);
          return;
        }
      }
      setOptOut(current);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loading = optOut === null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your account and what we send you.</p>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium">Weekly digest</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One email each Saturday for every account you have connected: what it holds, what the
              week did to it, and the trades that closed.
            </p>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading your preference…
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => write(!optOut)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {optOut ? "Start sending it again" : "Stop sending this email"}
                </button>
                <span className="text-sm text-muted-foreground">
                  {optOut ? "You are not receiving it." : "You are receiving it."}
                </span>
              </div>
            )}

            {justChanged && !busy ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {optOut ? "Saved — we have stopped sending it." : "Saved — it will arrive on Saturday."}
              </p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

            <p className="mt-4 text-xs text-muted-foreground">
              This does not affect alerts about your own positions, or email about your account and
              sign-in.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
