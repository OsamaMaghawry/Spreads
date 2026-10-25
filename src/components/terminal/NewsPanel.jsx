import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { visibleAt, mergeNews, ago, newsSymbol } from "@/lib/news";

// The news tab: the active chart's symbol, from the account's own Alpaca news
// (functions/terminal "news"). Live, the last three days, read again every
// minute. In a replay, only what had come out before the replay's moment,
// so a gap's news is there when the replay reaches the open and nothing from
// later gives the day away (25 Oct: "news tab per stock I am on or seeing
// whether Demo or Replay ... in the gap, I need to see if there was any piece
// of news"). The rules are lib/news.js.

const DAY = 86400;
const LIVE_MS = 60000;

/**
 * The articles for `symbol`: live (`cursor` null), or around a replay's
 * moment: the week before it and the two days after (`end`: the replay's
 * end), read again when the clock leaves that window.
 */
export function useNews({ accountId, symbol, cursor = null, end = null }) {
  const [state, setState] = useState({ symbol: null, items: [], loading: false, error: null });
  const win = useRef(null);
  const busy = useRef(null);
  const want = useRef(symbol);
  want.current = symbol;
  const live = cursor === null;

  // Live.
  useEffect(() => {
    if (!accountId || !symbol || !live) return undefined;
    let alive = true;
    win.current = null;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      setState((s) => ({ ...s, symbol, loading: s.symbol !== symbol, items: s.symbol === symbol ? s.items : [] }));
      invokeFunction("terminal", { action: "news", accountId, symbol, start: new Date(Date.now() - 3 * DAY * 1000).toISOString(), sort: "desc", max: 100 })
        .then((r) => {
          if (!alive) return;
          if (r?.data?.error) setState({ symbol, items: [], loading: false, error: r.data.error });
          else setState({ symbol, items: r?.data?.news || [], loading: false, error: null });
        }).catch((e) => alive && setState({ symbol, items: [], loading: false, error: String(e?.message || e) }));
    };
    load();
    const t = setInterval(load, LIVE_MS);
    return () => { alive = false; clearInterval(t); };
  }, [accountId, symbol, live]);

  // A replay.
  useEffect(() => {
    if (!accountId || !symbol || live) return;
    const w = win.current;
    if (w && w.symbol === symbol && cursor >= w.from && (cursor < w.to || w.to >= w.limit)) return;
    const key = `${symbol}|${cursor}`;
    if (busy.current && busy.current.startsWith(`${symbol}|`)) return;
    busy.current = key;
    const limit = Math.min(end || Infinity, Math.floor(Date.now() / 1000));
    const aheadTo = Math.min(cursor + 2 * DAY, limit);
    const ask = (start, stop, sort) => invokeFunction("terminal", { action: "news", accountId, symbol, start: new Date(start * 1000).toISOString(), end: new Date(stop * 1000).toISOString(), sort, max: 100 })
      .then((r) => (r?.data?.error ? Promise.reject(new Error(r.data.error)) : r?.data || { news: [] }));
    if (!w || w.symbol !== symbol) setState({ symbol, items: [], loading: true, error: null });
    Promise.all([ask(cursor - 7 * DAY, cursor, "desc"), aheadTo > cursor ? ask(cursor, aheadTo, "asc") : Promise.resolve({ news: [] })])
      .then(([past, ahead]) => {
        if (want.current !== symbol) return;
        const at = (a) => Math.floor(Date.parse(a.at) / 1000);
        // Fewer than asked for means the whole stretch is in; else as far as it reached.
        const from = past.truncated && past.news.length ? at(past.news.at(-1)) : cursor - 7 * DAY;
        const to = ahead.truncated && ahead.news.length ? at(ahead.news.at(-1)) : aheadTo;
        const items = mergeNews(w && w.symbol === symbol ? w.items : [], past.news, ahead.news);
        win.current = { symbol, from, to, limit, items };
        setState({ symbol, items, loading: false, error: null });
      })
      .catch((e) => { if (want.current === symbol) setState({ symbol, items: [], loading: false, error: String(e?.message || e) }); })
      .finally(() => { if (busy.current === key) busy.current = null; });
  }, [accountId, symbol, cursor, end, live]);

  const items = state.symbol === symbol ? visibleAt(state.items, cursor) : [];
  const now = cursor ?? Date.now() / 1000;
  const recent = items.filter((a) => now - Date.parse(a.at) / 1000 < DAY).length;
  return { items, recent, loading: state.loading || state.symbol !== symbol, error: state.error };
}

const stamp = (at, crypto) => new Date(at).toLocaleString("en-US", { timeZone: crypto ? "UTC" : "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default function NewsPanel({ news, symbol, crypto, cursor = null, clock = "", onPick }) {
  const now = cursor ?? Date.now() / 1000;
  const self = newsSymbol(symbol);
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className={`flex flex-wrap items-center gap-x-2 border-b px-2 py-1 ${cursor !== null ? "border-amber-200 bg-amber-50 text-amber-950" : "border-slate-100 text-slate-600"}`}>
        <span className="font-semibold">News · {symbol}</span>
        {cursor !== null
          ? <span>up to the replay&apos;s moment, {clock}; nothing published after it is shown</span>
          : <span>the last three days, newest first</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {news.loading && !news.items.length && <p className="px-3 py-4 text-slate-500">Reading the news…</p>}
        {news.error && <p className="px-3 py-2 text-rose-700">News: {news.error}</p>}
        {!news.loading && !news.error && !news.items.length && (
          <p className="px-3 py-4 text-slate-500">{cursor !== null ? `No news on ${symbol} in the week before this moment.` : `No news on ${symbol} in the last three days.`}</p>
        )}
        {news.items.map((a) => {
          const fresh = now - Date.parse(a.at) / 1000 < 3600;
          // Other shares it names, to chart (coins' pairs are left out: they are named without the slash).
          const others = a.symbols.filter((s) => s !== self && /^[A-Z]{1,5}(\.[A-Z])?$/.test(s)).slice(0, 6);
          return (
            <article key={a.id} className="border-b border-slate-100 px-2 py-1.5 hover:bg-slate-50">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 tabular-nums">
                {fresh && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="In the last hour" />}
                <span>{stamp(a.at, crypto)}</span>
                <span>· {ago(a.at, now)} {cursor !== null ? "before" : "ago"}</span>
                {a.source && <span className="uppercase tracking-wide">· {a.source}</span>}
              </div>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="group mt-0.5 flex items-start gap-1 font-medium leading-snug text-slate-900 hover:text-emerald-800">
                <span>{a.headline}</span>
                {a.url && <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 group-hover:text-emerald-700" />}
              </a>
              {a.summary && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600">{a.summary}</p>}
              {others.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {others.map((s) => (
                    <button key={s} type="button" onClick={() => onPick?.(s)} title={`Chart ${s}`} className="rounded bg-slate-100 px-1 text-[10px] text-slate-600 hover:bg-emerald-100 hover:text-emerald-800">{s}</button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="border-t border-slate-100 px-2 py-0.5 text-[10px] text-slate-400">News from your own Alpaca account (Benzinga). Headlines open at the source. Not investment advice.</p>
    </div>
  );
}
