import { useRef, useState, useEffect } from "react";
import { invokeFunction } from "@/lib/functions";
import { playAlert } from "@/lib/beep";
import { marketIsOpen } from "@/lib/marketSession";

const RETRY_MS = 20000;
// Outside 09:30-16:00 ET there are no option quotes to refresh, so a 20-second
// retry asks the same dead chain the same question 180 times an hour and gets
// the same skip. The loop keeps running -- so a scan left open pre-market picks
// up on its own at the bell -- but it waits a minute between passes instead.
const CLOSED_RETRY_MS = 60000;

// Keeps scanning on an interval until at least one setup matches, or the user stops.
export default function useScanLoop() {
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [nextIn, setNextIn] = useState(0);
  const [candidates, setCandidates] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [error, setError] = useState(null);
  const stopped = useRef(false);
  const timer = useRef(null);

  useEffect(() => () => { stopped.current = true; clearTimeout(timer.current); }, []);

  const stop = () => {
    stopped.current = true;
    clearTimeout(timer.current);
    setRunning(false);
    setNextIn(0);
  };

  const countdown = (onDone) => {
    let left = (marketIsOpen() ? RETRY_MS : CLOSED_RETRY_MS) / 1000;
    setNextIn(left);
    const tick = () => {
      if (stopped.current) return;
      left -= 1;
      setNextIn(left);
      if (left <= 0) onDone();
      else timer.current = setTimeout(tick, 1000);
    };
    timer.current = setTimeout(tick, 1000);
  };

  const start = (payload, onFound) => {
    stopped.current = false;
    setRunning(true);
    setError(null);
    setCandidates(null);
    setSkipped([]);
    setAttempts(0);

    const attempt = async () => {
      if (stopped.current) return;
      setAttempts((a) => a + 1);
      setNextIn(0);
      try {
        const res = await invokeFunction("scanEntries", payload);
        if (stopped.current) return;
        const data = res.data || {};
        // A failed pass (rate limit, no chain, market closed) is not fatal — keep looping.
        if (data.error) {
          setError(data.error);
          countdown(attempt);
          return;
        }
        setError(null);
        setSkipped(data.skipped || []);
        const found = data.candidates || [];
        if (found.length > 0) {
          setCandidates(found);
          setRunning(false);
          playAlert();
          onFound?.(found);
          return;
        }
        countdown(attempt);
      } catch (e) {
        if (stopped.current) return;
        setError(e.message);
        countdown(attempt);
      }
    };

    attempt();
  };

  // The UI says "waiting for the open" rather than counting down to a pass that
  // cannot find anything.
  return { running, attempts, nextIn, candidates, skipped, error, start, stop, setCandidates, marketOpen: marketIsOpen() };
}