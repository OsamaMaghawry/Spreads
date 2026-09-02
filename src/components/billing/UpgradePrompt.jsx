import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

// Shown in the open ticket when the server refused a live order for want of a
// plan. It is a stop, not a retry: the order was never sent, and the reader
// has money on the screen, so it says what still works before what to buy.
export default function UpgradePrompt({ message }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-sm text-amber-800 space-y-2">
      <div className="flex items-center gap-2 font-medium">
        <Lock className="w-4 h-4 shrink-0" /> Live orders need the Live plan
      </div>
      <p className="text-xs leading-relaxed text-amber-800/90">
        {message || "This order was not sent. You can still close, cancel, price and export everything in this account, and open positions on your paper account."}
      </p>
      <Link
        to="/billing?plan=monthly"
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
      >
        Choose a plan — $29 a month
      </Link>
    </div>
  );
}
