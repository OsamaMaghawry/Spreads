// The on-screen account's orders as Alpaca moves them, from the price stream
// (functions/_shared/orderStream.ts). A fill reaches the ticket and the hotkey
// pop-ups the moment Alpaca reports it, instead of at the next check, which
// came once a second (28 Oct: "Is there anyway to enhance the execution
// speed"). The checks carry on for whatever the stream misses.
//
// A market order can fill before the answer naming it comes back, so the
// last few updates are kept, and an order followed after its fill still sees it.

const KEEP = 200;
const seen = new Map();
const waiting = new Map();

/** One "order" message from the stream. */
export function noteOrder(m) {
  if (!m?.id) return;
  seen.delete(m.id);
  seen.set(m.id, m);
  if (seen.size > KEEP) seen.delete(seen.keys().next().value);
  waiting.get(m.id)?.forEach((fn) => fn(m));
}

/** Calls `fn` with each update to order `id`, the latest one first if it came already; returns the way to stop. */
export function onOrder(id, fn) {
  if (!id) return () => {};
  if (!waiting.has(id)) waiting.set(id, new Set());
  waiting.get(id).add(fn);
  const early = seen.get(id);
  if (early) fn(early);
  return () => {
    const set = waiting.get(id);
    set?.delete(fn);
    if (set && !set.size) waiting.delete(id);
  };
}
