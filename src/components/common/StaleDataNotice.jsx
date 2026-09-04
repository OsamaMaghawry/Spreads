import { CloudOff } from "lucide-react";

// "We could not reach the broker just now" — said out loud, over data that is
// still on screen.
//
// A refresh that fails is not the same thing as an account that is gone, and
// the two used to be indistinguishable: a transient failure returned nothing,
// nothing was written straight into state, and the page rendered its empty
// state — "No trading accounts yet" on the dashboard, "Account not found" on
// the account page — over an account that was connected the whole time. It
// lasted until the next poll succeeded, which is why it read as a flicker.
//
// The rule now is that a failed refresh never destroys a good view. The last
// good data stays, and this says why it is not moving.
export default function StaleDataNotice({ message, since }) {
  if (!message) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      role="status"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        Can&rsquo;t reach the broker right now — showing the last figures we have
        {since ? ` from ${new Date(since).toLocaleTimeString()}` : ""}. Retrying automatically.
      </span>
    </div>
  );
}
