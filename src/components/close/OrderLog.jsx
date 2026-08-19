import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function OrderLog({ log, phase }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        {phase === "working" && <><Loader2 className="w-4 h-4 animate-spin text-emerald-600" /><span className="text-emerald-700">Working order…</span></>}
        {phase === "filled" && <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Order filled</span></>}
        {phase === "failed" && <><XCircle className="w-4 h-4 text-rose-600" /><span className="text-rose-700">Not filled</span></>}
      </div>
      <div className="space-y-1 font-mono text-xs text-slate-600">
        {log.map((l, i) => (
          <div key={i}><span className="text-slate-400">{l.t}</span> {l.msg}</div>
        ))}
      </div>
    </div>
  );
}