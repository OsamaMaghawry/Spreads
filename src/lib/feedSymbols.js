// What one shared price connection streams for every terminal tab of the
// account in this browser (components/terminal/useTerminalStream.js): each
// tab's list starts with its chart's symbol, so the first of each comes
// before the second of any, up to the relay's limit.
export const MAX_SYMBOLS = 30;

export function unionSymbols(lists, max = MAX_SYMBOLS) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const l of lists) {
      const sym = l[i];
      if (sym && !out.includes(sym) && out.length < max) out.push(sym);
    }
  }
  return out;
}
