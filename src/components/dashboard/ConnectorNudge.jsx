import { useState } from "react";
import { Link } from "react-router-dom";
import { Plug, X } from "lucide-react";

// One line on the Dashboard that says DeltaMint works from Claude, with the
// way in and a way to make it go away for good.
//
// The page it points to is src/pages/ConnectClaude.jsx.
//
// Dismissal is remembered in this browser only. Storage can be missing or
// throw (private mode, blocked site data); then the card simply shows again
// next time, which is the harmless failure.

const KEY = "dm.connectorNudge.dismissed";

const dismissed = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export default function ConnectorNudge() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* shows again next visit */ }
    setHidden(true);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dm-line bg-dm-panel px-4 py-3">
      <Plug className="h-5 w-5 shrink-0 text-dm-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-dm-text">
        <span className="font-medium">New: use DeltaMint from Claude.</span>{" "}
        <span className="text-dm-sub">Ask about your positions, trades and scans in plain English. Read-only.</span>
      </p>
      <Link
        to="/connect-claude"
        className="rounded-lg bg-dm-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-dm-accent-bright"
      >
        Set it up
      </Link>
      <button type="button" onClick={close} aria-label="Dismiss" className="rounded-md p-1 text-dm-sub hover:bg-dm-bg">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
