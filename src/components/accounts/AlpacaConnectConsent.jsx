import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

// The authorization disclosure required by Alpaca's OAuth Due Diligence
// Questionnaire (v3, page 3). Two requirements come from it, and both are
// load-bearing for approval:
//
//   "Please ensure that the following Authorization disclosure is captured in
//    the video. *Acknowledgement of the disclosure must be done prior to a
//    client connecting their Alpaca account."
//
// So it is shown here, before the redirect, with Deny and Allow — not left to
// Alpaca's own consent page, which the user only reaches after connecting has
// already begun.
//
// The wording below is the DDQ's template with [Name] filled in, and should be
// changed only to track a new DDQ version. It previously read "place
// transactions in your account at your direction"; the template says "place
// transactions at your direction", and a disclosure that Alpaca will compare
// against their own template should match it.
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
            <p>
              By allowing DeltaMint to access your Alpaca account, you are granting DeltaMint access to your account
              information and authorization to place transactions at your direction.
            </p>
            <p className="mt-3">
              Alpaca does not warrant or guarantee that DeltaMint will work as advertised or expected. Before
              authorizing, learn more about{" "}
              <a href="https://deltamint.app" target="_blank" rel="noreferrer" className="underline">
                DeltaMint
              </a>
              .
            </p>
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
              Deny
            </button>
            <button
              onClick={onContinue}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
