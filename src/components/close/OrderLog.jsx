import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function OrderLog({ log, phase }) {
  return (
    <div className="bg-[#0A0E16] border border-white/[0.06] rounded-lg p-3 max-h-56 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        {phase === "working" && <><Loader2 className="w-4 h-4 animate-spin text-emerald-400" /><span className="text-emerald-300">Working order…</span></>}
        {phase === "filled" && <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-emerald-300">Order filled</span></>}
        {phase === "failed" && <><XCircle className="w-4 h-4 text-rose-400" /><span className="text-rose-300">Not filled</span></>}
      </div>
      <div className="space-y-1 font-mono text-xs text-slate-400">
        {log.map((l, i) => (
          <div key={i}><span className="text-slate-600">{l.t}</span> {l.msg}</div>
        ))}
      </div>
    </div>
  );
}