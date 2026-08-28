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
  const [connected, setConnected] = useState(0);
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
      // A single authorization can cover both a live and a paper account, so
      // say how many arrived — otherwise there is no way to tell that the paper
      // account you ticked actually came through.
      setConnected(res.data?.accounts?.length || 1);
      setStatus("success");
      setTimeout(() => navigate("/accounts", { replace: true }), 1600);
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
            <p className="text-dm-text">
              Connected {connected} account{connected === 1 ? "" : "s"}. Redirecting…
            </p>
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
