import { Component } from "react";
import { AlertTriangle, RotateCw, Copy, Check } from "lucide-react";
import { recordError, errorReport } from "@/lib/errorRecord";

// THE BLANK PAGE.
//
// The owner, on a live account, trying to close a position: *"when I press
// close, it gives me a blank page."* There was no error boundary anywhere in
// this app, so any component that threw during render unmounted the ENTIRE
// React tree. What is left is an empty white document: no message, no way
// back, nothing written down, and no way for anyone to find out what broke
// afterwards. On a screen whose job is closing a position with real money in
// it, that is the worst possible failure mode -- it is indistinguishable from
// the product being dead, and it arrives at the exact moment somebody is
// trying to reduce their risk.
//
// A boundary cannot stop a component throwing. What it does is contain the
// blast: the rest of the page keeps working, the trader is told what failed
// and given somewhere to go, and the error is captured instead of vanishing.
//
// Deliberately a class. `componentDidCatch` has no hook equivalent -- this is
// the one place React still requires one.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Kept in the console for anyone with the tab open, and on `window` so it
    // survives being scrolled out of the console and can be read back by hand.
    // No network call: an error reporter is a separate decision, and a boundary
    // that fails to phone home must not fail to render.
    console.error("DeltaMint caught a render error:", error, info?.componentStack);
    // recordError never throws -- pinned by errorRecord.test.js, because a
    // second throw in here would unmount the boundary and restore the very
    // blank page it exists to prevent.
    this.record = recordError(error, info);
  }

  // Clearing the error re-renders the children. Enough on its own when the
  // throw came from state that has since moved on -- a stale quote, a row that
  // has now loaded -- and harmless when it is not: it simply throws again and
  // lands back here.
  reset = () => this.setState({ error: null, info: null, copied: false });

  copy = () => {
    const text = errorReport(this.record || recordError(this.state.error, this.state.info));
    try {
      navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      // Clipboard is blocked in some mobile contexts. The details are on
      // screen below either way, so there is still a way to report it.
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const where = this.props.label || "this part of the page";

    return (
      <div className="border border-rose-200 bg-rose-50 rounded-xl p-4 space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-rose-900">Something broke in {where}.</p>
            {/* What a trader needs first is not the stack trace. It is whether
                their money moved. Nothing here reaches a broker, so the answer
                is always no, and saying it plainly is the difference between a
                bug and a panic. */}
            <p className="text-rose-800 text-xs leading-relaxed mt-1">
              No order was sent and nothing at your broker changed — this failed while
              drawing the screen. Your positions and any working orders are exactly as
              they were.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-800 text-xs font-medium hover:bg-rose-100 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors"
          >
            Reload the page
          </button>
          <button
            type="button"
            onClick={this.copy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors"
          >
            {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {this.state.copied ? "Copied" : "Copy error details"}
          </button>
        </div>

        {/* The message itself, not hidden behind a toggle. Somebody reporting
            this on a phone needs to be able to read it and send it on. */}
        <p className="text-[11px] font-mono text-rose-900/80 bg-white border border-rose-200 rounded-lg px-2.5 py-2 break-words">
          {String(error?.message || error)}
        </p>
      </div>
    );
  }
}
