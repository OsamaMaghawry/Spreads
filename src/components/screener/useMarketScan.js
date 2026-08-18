import { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
  const [error, setError] = useState(null);
  const stopped = useRef(false);

  useEffect(() => () => { stopped.current = true; }, []);

  const stop = () => { stopped.current = true; setRunning(false); };

  const start = async (accountId, tickers, filters) => {
    stopped.current = false;
    setRunning(true);
    setError(null);
    setCandidates([]);
    setSkippedCount(0);
    setProgress({ done: 0, total: tickers.length });

    let all = [];
    const seen = new Set();
    for (let i = 0; i < tickers.length; i += BATCH) {
      if (stopped.current) return;
      const batch = tickers.slice(i, i + BATCH);
      try {
        const res = await base44.functions.invoke("scanEntries", { accountId, tickers: batch, ...filters });
        if (stopped.current) return;
        const data = res.data || {};
        if (data.error) throw new Error(data.error);
        for (const c of data.candidates || []) {
          const k = legKey(c);
          if (!seen.has(k)) { seen.add(k); all.push(c); }
        }
        all.sort((a, b) => b.returnOnRisk - a.returnOnRisk);
        all = all.slice(0, 100);
        setCandidates([...all]);
        setSkippedCount((n) => n + (data.skipped?.length || 0));
      } catch (e) {
        if (stopped.current) return;
        setError(e.message); // a failed batch shouldn't kill the sweep
      }
      setProgress({ done: Math.min(i + BATCH, tickers.length), total: tickers.length });
    }
    setRunning(false);
    if (all.length > 0) playAlert();
  };

  return { running, progress, candidates, skippedCount, error, start, stop };
}