import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

// Alpaca requires this exact disclosure to be shown to the user at the moment
// they authorize the OAuth connection, before they're redirected to Alpaca.
export default function AlpacaConnectConsent({ onCancel, onContinue }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Authorize DeltaMint
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4">
            By allowing DeltaMint to access your Alpaca account, you are granting DeltaMint access to your account
            information and authorization to place transactions in your account at your direction. Alpaca does not
            warrant or guarantee that DeltaMint will work as advertised or expected. Before authorizing, learn more
            about DeltaMint at{" "}
            <a href="https://deltamint.app" target="_blank" rel="noreferrer" className="underline">
              deltamint.app
            </a>
            .
          </div>
          <p className="text-xs text-slate-500">
            You'll be redirected to Alpaca to sign in, choose which account (live or paper) to connect, and authorize
            DeltaMint. DeltaMint never sees your Alpaca password.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onContinue}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors"
            >
              Continue to Alpaca
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
