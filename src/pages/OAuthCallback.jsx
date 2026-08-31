import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { getOAuthRedirectUri } from "@/lib/alpacaOAuth";

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("connecting"); // connecting | success | error
  const [error, setError] = useState("");
  const [notGranted, setNotGranted] = useState([]);
  const [connected, setConnected] = useState([]);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const oauthError = searchParams.get("error");
      const savedState = sessionStorage.getItem("alpaca_oauth_state");
      sessionStorage.removeItem("alpaca_oauth_state");

      if (oauthError) {
        setStatus("error");
        setError(`Alpaca declined the connection: ${oauthError}`);
        return;
      }
      if (!code || !state || state !== savedState) {
        setStatus("error");
        setError("Invalid or expired connection request. Please try again.");
        return;
      }

      const res = await invokeFunction("alpacaOAuthCallback", {
        code,
        redirectUri: getOAuthRedirectUri()
      });
      if (res.data?.error) {
        setStatus("error");
        setError(res.data.error);
        return;
      }
      // Name what arrived, and stop redirecting on a timer.
      //
      // A token carries no field saying which accounts it covers: the only way
      // to find out is to present it to each trading API and read back the
      // account number. That answer is worth showing, because it is not always
      // the account that was ticked on Alpaca's screen — and a count plus a
      // 1.6-second redirect gave nobody a chance to notice.
      setConnected(res.data?.accounts || []);
      // An environment Alpaca would not grant. Saying so here is the whole
      // point: a user who ticked their live account and silently got only
      // paper had no way to tell, and neither did we.
      setNotGranted(res.data?.issues || []);
      setStatus("success");
    };

    run();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dm-bg font-body px-4">
      <div className="text-center">
        {status === "connecting" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-dm-accent mx-auto mb-4" />
            <p className="text-dm-text">Connecting your Alpaca account…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-dm-positive mx-auto mb-4" />
            <p className="text-dm-text font-medium">
              Connected {connected.length} account{connected.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-dm-sub">
              {connected.map((a) => (
                <li key={a.id} className="font-mono">
                  {a.is_paper ? "Paper" : "Live"} · {a.broker_account_number || a.name}
                </li>
              ))}
            </ul>
            {notGranted.length > 0 && (
              <div className="mx-auto mt-4 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left">
                <p className="text-xs font-medium text-amber-900">
                  Alpaca did not grant {notGranted.map((i) => i.environment).join(" or ")} access
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  That is normal if you only authorized the account shown above. If you meant to connect it, check
                  that you ticked it on Alpaca's consent screen and that the account is approved for API trading,
                  then connect again.
                </p>
              </div>
            )}
            <button
              onClick={() => navigate("/accounts", { replace: true })}
              className="mt-6 text-sm text-dm-accent hover:underline"
            >
              Go to accounts
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-8 h-8 text-dm-negative mx-auto mb-4" />
            <p className="text-dm-text mb-4">{error}</p>
            <button
              onClick={() => navigate("/accounts", { replace: true })}
              className="text-sm text-dm-accent hover:underline"
            >
              Back to accounts
            </button>
          </>
        )}
      </div>
    </div>
  );
}
