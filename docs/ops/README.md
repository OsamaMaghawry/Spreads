# Operations

The daily loop. Strategy is weekly and lands in the Friday board pack; this
folder is where the product is kept running between those meetings.

- `queue.md` — tickets. Anyone appends; the duty engineer drains oldest-first
  every run and moves each line to *fixed (commit)*, *escalated (date)* or
  *needs owner*. A finding on the money path is fixed on staging within a
  working hour of being seen or escalated the same run; it is never only
  reported.
- `shipped.md` — one line per change that reached `main`, in plain English,
  what a user can now do. The product run reads it first; the board pack
  lists it as "what changed".
- `YYYY-MM-DD.md` — the duty engineer's ledger for a day: what it read, what
  it fixed, what it escalated. A clean hour is one line.
