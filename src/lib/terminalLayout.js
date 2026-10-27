// Where the terminal's windows sit. The owner, 24 Oct 2026: "I need to be able
// to control the places of the windows ... drag them and lock them". The
// screen is a grid (react-grid-layout): each window has a column, a row, a
// width and a height in grid cells, the trader moves and resizes them, and the
// arrangement is kept in this browser. Pure, so the rules are tested
// (terminalLayout.test.js).

export const PANELS = ["watch", "chart", "account", "book", "tape", "ticket"];
export const ROWS = 30; // the default arrangement fills this many rows
// Between windows, in pixels: tight, as on a trading desk (27 Oct: "use all
// the space").
export const MARGIN = 4;

// Wide screens: 24 columns. Watchlist | chart over account | book over tape | ticket.
const LG = [
  { i: "watch", x: 0, y: 0, w: 4, h: 30, minW: 3, minH: 6 },
  { i: "chart", x: 4, y: 0, w: 10, h: 20, minW: 5, minH: 8 },
  { i: "account", x: 4, y: 20, w: 10, h: 10, minW: 4, minH: 5 },
  { i: "book", x: 14, y: 0, w: 5, h: 17, minW: 3, minH: 6 },
  { i: "tape", x: 14, y: 17, w: 5, h: 13, minW: 3, minH: 5 },
  { i: "ticket", x: 19, y: 0, w: 5, h: 30, minW: 3, minH: 10 }
];
// Tablets and small laptops: 12 columns. Watchlist beside the chart, as on a
// wide screen (25 Oct: "watchlists disappeared on my laptop": the old
// arrangement put it under the chart, out of sight), then ticket, book and
// tape side by side, the account across the foot.
const MD = [
  { i: "watch", x: 0, y: 0, w: 3, h: 18, minW: 2, minH: 6 },
  { i: "chart", x: 3, y: 0, w: 9, h: 18, minW: 4, minH: 8 },
  { i: "ticket", x: 0, y: 18, w: 4, h: 16, minW: 3, minH: 10 },
  { i: "book", x: 4, y: 18, w: 4, h: 16, minW: 3, minH: 6 },
  { i: "tape", x: 8, y: 18, w: 4, h: 16, minW: 3, minH: 5 },
  { i: "account", x: 0, y: 34, w: 12, h: 10, minW: 4, minH: 5 }
];
// Phones: one column, every window, in the order they are used.
const SM = [["chart", 18], ["watch", 12], ["ticket", 18], ["book", 14], ["tape", 14], ["account", 14]].reduce((out, [i, h]) => {
  const y = out.length ? out[out.length - 1].y + out[out.length - 1].h : 0;
  return [...out, { i, x: 0, y, w: 1, h }];
}, []);

export const DEFAULT_LAYOUTS = { lg: LG, md: MD, sm: SM };
// The grid's own width, not the window's: the app's menu takes some of a
// laptop screen, and a 1,280-pixel laptop still gets the full arrangement.
export const BREAKPOINTS = { lg: 1000, md: 640, sm: 0 };
export const COLS = { lg: 24, md: 12, sm: 1 };

/**
 * An arrangement saved under the first version: the wide-screen one is kept
 * as the trader left it; the narrower ones start again from the new defaults.
 */
export function fromFirstVersion(saved) {
  return saved && Array.isArray(saved.lg) ? { lg: saved.lg } : null;
}

/**
 * A saved arrangement, checked: every window present once, inside the grid,
 * at least its minimum size. Anything missing or broken comes from the
 * default, so a bad save can never lose a window off the screen.
 */
export function cleanLayouts(saved) {
  const out = {};
  for (const [bp, defaults] of Object.entries(DEFAULT_LAYOUTS)) {
    const list = Array.isArray(saved?.[bp]) ? saved[bp] : [];
    out[bp] = defaults.map((d) => {
      const s = list.find((x) => x && x.i === d.i);
      const ok = s && [s.x, s.y, s.w, s.h].every((v) => Number.isInteger(v) && v >= 0) && s.x + s.w <= COLS[bp] && s.y < 500;
      if (!ok) return { ...d };
      return { ...d, x: s.x, y: s.y, w: Math.max(s.w, d.minW || 1), h: Math.max(s.h, d.minH || 1) };
    });
  }
  return out;
}

/** The row height that makes the default arrangement fill the space below the header (the grid has no padding of its own). */
export function rowHeightFor(available) {
  // Not rounded down: thirty rows each a pixel short leave a strip of empty
  // screen at the foot; the grid rounds each window's edge itself.
  return Math.max(14, (available - (ROWS - 1) * MARGIN) / ROWS);
}
