import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Play, RefreshCw, Plug } from "lucide-react";
import { invokeFunction } from "@/lib/functions";

// SnapTrade, evaluated rather than assumed.
//
// One connection layer in front of many brokers is either a large saving or a
// middleman on the money path. This panel is where that gets decided from
// evidence: it signs real requests with the project's keys and shows what came
// back — which brokers exist, which can actually place an order, and whether
// an option position arrives as an option.
//
// Everything here is read-only against our own data. Nothing SnapTrade returns
// reaches the dashboard, the Analysis page or the weekly email.

const STATE_STYLE = {
  yes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  no: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200"
};

const STATE_LABEL = { yes: "Yes", partial: "Partly", no: "No", unknown: "Not proven" };

function Flag({ value }) {
  if (value === true) return <span className="text-emerald-600">Yes</span>;
  if (value === false) return <span className="text-slate-400">No</span>;
  // Null is "they did not say", which is not the same as no and must not
  // render as one.
  return <span className="text-slate-300" title="Not stated by SnapTrade">—</span>;
}

export default function SnapTradePanel() {
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [tradableOnly, setTradableOnly] = useState(false);

  const call = useCallback(async (action, extra = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await invokeFunction("snaptrade", { action, ...extra });
      if (res.data?.error) {
        setError(res.data.error);
        return null;
      }
      return res.data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const data = await call("status");
    if (data) setStatus(data);
  }, [call]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = async () => {
    const data = await call("connect");
    // Their portal link expires in five minutes, so it is fetched per click
    // and opened immediately rather than stored anywhere.
    if (data?.url) window.open(data.url, "_blank", "noopener");
    else if (data) setError("SnapTrade returned no portal link.");
  };

  const matrix = report?.matrix || null;
  const rows = (matrix?.rows || []).filter((r) => {
    if (tradableOnly && !(r.trading || r.tradingViaApi)) return false;
    return !filter || r.name.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dm-line bg-white p-4">
        <h3 className="text-sm font-medium text-dm-text">SnapTrade evaluation</h3>
        <p className="mt-1 text-xs leading-relaxed text-dm-sub">
          One API in front of many brokers. This panel asks their API every question this product would
          have to ask in production and records the answers. Nothing here feeds a figure the app shows,
          and an order can only be sent to an account the broker itself calls paper.
        </p>

        {status && !status.configured ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {status.message}
          </div>
        ) : status ? (
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-dm-sub">Client id</dt>
              <dd className="font-mono text-xs text-dm-text">{status.clientId}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-dm-sub">Their API</dt>
              <dd className="text-sm">
                {status.api?.ok
                  ? <span className="text-emerald-600">Reachable, signature accepted · {status.api.ms} ms</span>
                  : <span className="text-rose-600">{status.api?.status || "—"} {status.api?.error}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-dm-sub">Our partner record</dt>
              <dd className="text-sm">
                {status.partner?.ok
                  ? <span className="text-emerald-600">Returned</span>
                  : <span className="text-rose-600">{status.partner?.status || "—"} {status.partner?.error}</span>}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-dm-sub">Checking…</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => call("probe").then((d) => d && setReport(d))}
            disabled={!!busy || (status && !status.configured)}
            className="inline-flex items-center gap-2 rounded-lg bg-dm-text px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === "probe" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run the probe
          </button>
          <button
            onClick={connect}
            disabled={!!busy || (status && !status.configured)}
            className="inline-flex items-center gap-2 rounded-lg border border-dm-line bg-white px-3.5 py-2 text-sm text-dm-text disabled:opacity-40"
          >
            <Plug className="h-4 w-4" /> Connect a broker
          </button>
          <button
            onClick={loadStatus}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg border border-dm-line bg-white px-3.5 py-2 text-sm text-dm-sub disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" /> Recheck
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        )}
      </div>

      {report && (
        <>
          {/* The answer, before the evidence. */}
          <div className="rounded-xl border border-dm-line bg-white p-4">
            <h3 className="text-sm font-medium text-dm-text">What this proves</h3>
            <div className="mt-3 space-y-2">
              {report.verdicts?.map((v) => (
                <div key={v.question} className="flex flex-wrap items-start gap-3 border-b border-slate-100 py-2 last:border-b-0">
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLE[v.state]}`}>
                    {STATE_LABEL[v.state]}
                  </span>
                  <div className="min-w-[240px] flex-1">
                    <div className="text-sm text-dm-text">{v.question}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-dm-sub">{v.answer}</div>
                  </div>
                </div>
              ))}
            </div>
            {report.notes?.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-800">
                {report.notes.map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            )}
          </div>

          {/* Reach: the question the owner asked first. */}
          {matrix && (
            <div className="rounded-xl border border-dm-line bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-dm-text">
                  Brokers · {matrix.total} listed, {matrix.tradable} can place an order
                </h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-dm-sub">
                    <input type="checkbox" checked={tradableOnly} onChange={(e) => setTradableOnly(e.target.checked)} />
                    Tradable only
                  </label>
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Find a broker"
                    className="rounded-lg border border-dm-line px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="mt-3 max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-widest text-dm-sub">
                    <tr className="border-b border-dm-line">
                      <th className="py-2 pr-3">Broker</th>
                      <th className="py-2 pr-3">Enabled</th>
                      <th className="py-2 pr-3">Trading</th>
                      <th className="py-2 pr-3">How it connects</th>
                      <th className="py-2 pr-3">Real time</th>
                      <th className="py-2 pr-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.slug || r.name} className="border-b border-slate-50">
                        <td className="py-1.5 pr-3 text-dm-text">
                          {r.name}
                          {r.maintenance === true && <span className="ml-2 text-amber-700">maintenance</span>}
                        </td>
                        <td className="py-1.5 pr-3"><Flag value={r.enabled} /></td>
                        <td className="py-1.5 pr-3"><Flag value={r.trading} /></td>
                        {/* Whether an order CAN be placed and whether the
                            broker sanctioned the way it is placed are two
                            different questions, and only the second one is a
                            risk to weigh on a money path. */}
                        <td className="py-1.5 pr-3">
                          {r.tradeAuth === "OAUTH" ? (
                            <span className="text-emerald-600">Broker&rsquo;s own OAuth</span>
                          ) : r.tradeAuth === "TOKEN" ? (
                            <span className="text-emerald-600" title="API keys the broker issues for this purpose.">
                              Broker&rsquo;s API keys
                            </span>
                          ) : r.tradeAuth ? (
                            <span className="text-amber-700" title="An interface the broker never published — it can change or be withdrawn without notice.">
                              Unofficial
                            </span>
                          ) : r.readAuth ? (
                            <span className="text-slate-400">Read only ({r.readAuth === "OAUTH" ? "OAuth" : "unofficial"})</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3"><Flag value={r.realTime} /></td>
                        <td className="py-1.5 pr-3 text-dm-sub">{r.type || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matrix.fieldsUnmapped?.length > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-dm-sub">
                  Fields SnapTrade returned that this panel does not read yet:{" "}
                  <span className="font-mono">{matrix.fieldsUnmapped.join(", ")}</span>. Listed rather than dropped —
                  one of them may be the multi-leg flag.
                </p>
              )}
            </div>
          )}

          {/* The evidence. */}
          <div className="rounded-xl border border-dm-line bg-white p-4">
            <h3 className="text-sm font-medium text-dm-text">Every call, and what came back</h3>
            <div className="mt-3 space-y-2">
              {report.probes?.map((p) => (
                <details key={p.name} className="rounded-lg border border-slate-100 p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${p.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {p.status || "—"}
                    </span>
                    <span className="font-medium text-dm-text">{p.name}</span>
                    <span className="font-mono text-[11px] text-dm-sub">{p.method} {p.path}</span>
                    {p.count !== null && <span className="text-dm-sub">{p.count} row{p.count === 1 ? "" : "s"}</span>}
                    <span className="text-dm-sub">{p.ms} ms</span>
                  </summary>
                  <p className="mt-1.5 text-[11px] text-dm-sub">{p.need}</p>
                  {p.error && <p className="mt-1 text-[11px] text-rose-700">{p.error}</p>}
                  <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-relaxed">
                    {JSON.stringify(p.sample, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </div>

          {report.accounts?.length > 0 && (
            <div className="rounded-xl border border-dm-line bg-white p-4">
              <h3 className="text-sm font-medium text-dm-text">Connected through SnapTrade</h3>
              <ul className="mt-2 space-y-1 text-xs text-dm-text">
                {report.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span>{a.institution} — {a.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${a.paper ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {a.paper ? "paper" : "live — orders refused"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-dm-sub">
            <ExternalLink className="mr-1 inline h-3 w-3" />
            Recorded as a run, so this evaluation can be read back later instead of remembered.
          </p>
        </>
      )}
    </div>
  );
}
