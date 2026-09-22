import { useRef, useState, useEffect } from "react";
import { invokeFunction } from "@/lib/functions";
import { playAlert } from "@/lib/beep";

const BATCH = 4;
const legKey = (c) => c.legs.map((l) => l.symbol).join("|");

// Sweeps a large ticker universe in small batches so each backend call stays fast,
// streaming ranked results into state as they arrive.
export default function useMarketScan() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [candidates, setCandidates] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  // WHY nothing matched, not just how many did not.
  //
  // scanCandidates already explains itself: every ticker it rejects comes back
  // as { ticker, reason } naming the delta band, the credit floor, the risk cap
  // or the expiry window that excluded it. All of it was reduced to a counter
  // and dropped. The owner, on a scan that ran correctly and returned 200 with
  // a full body of reasons: *"I see nothing happening. It is not working
  // still."* It was working -- it just had no way to say so.
  const [skipped, setSkipped] = useState([]);
  const [error, setError] = useState(null);
  const stopped = useRef(false);

  useEffect(() => () => { stopped.current = true; }, []);

  const stop = () => { stopped.current = true; setRunning(false); };

  // One sweep is one or more jobs: { tickers, filters }. The wheel is two --
  // puts on the universe, then calls on the account's own shares (a single
  // call, the server picks the tickers) -- and their results share one list.
  const start = async (accountId, tickersOrJobs, filters) => {
    const jobs = Array.isArray(tickersOrJobs) && tickersOrJobs.length > 0 && typeof tickersOrJobs[0] === "object"
      ? tickersOrJobs
      : [{ tickers: tickersOrJobs, filters }];
    stopped.current = false;
    setRunning(true);
    setError(null);
    setCandidates([]);
    setSkippedCount(0);
    setSkipped([]);
    const total = jobs.reduce((n, j) => n + j.tickers.length, 0);
    setProgress({ done: 0, total });

    let all = [];
    const seen = new Set();
    let done = 0;
    for (const job of jobs) {
      const { tickers } = job;
      for (let i = 0; i < tickers.length; i += BATCH) {
        if (stopped.current) return;
        const batch = tickers.slice(i, i + BATCH);
        try {
          const res = await invokeFunction("scanEntries", { accountId, tickers: batch, ...job.filters });
          if (stopped.current) return;
          const data = res.data || {};
          if (data.error) throw new Error(data.error);
          if (data.reason && !(data.candidates || []).length) setError(data.reason);
          for (const c of data.candidates || []) {
            const k = legKey(c);
            if (!seen.has(k)) { seen.add(k); all.push(c); }
          }
          all.sort((a, b) => b.returnOnRisk - a.returnOnRisk);
          all = all.slice(0, 100);
          setCandidates([...all]);
          setSkippedCount((n) => n + (data.skipped?.length || 0));
          // Bounded: a whole-market sweep can skip thousands of names and the
          // screen only ever shows a handful. Keeping every one would grow
          // without limit for no gain.
          if (data.skipped?.length) setSkipped((prev) => (prev.length >= 12 ? prev : [...prev, ...data.skipped].slice(0, 12)));
        } catch (e) {
          if (stopped.current) return;
          setError(e.message); // a failed batch shouldn't kill the sweep
        }
        done += batch.length;
        setProgress({ done, total });
      }
    }
    setRunning(false);
    if (all.length > 0) playAlert();
  };

  return { running, progress, candidates, skippedCount, skipped, error, start, stop };
}