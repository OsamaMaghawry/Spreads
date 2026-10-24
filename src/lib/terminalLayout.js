// Where the terminal's windows sit. The owner, 24 Oct 2026: "I need to be able
// to control the places of the windows ... drag them and lock them". The
// screen is a grid (react-grid-layout): each window has a column, a row, a
// width and a height in grid cells, the trader moves and resizes them, and the
// arrangement is kept in this browser. Pure, so the rules are tested
// (terminalLayout.test.js).

export const PANELS = ["watch", "chart", "account", "book", "tape", "ticket"];
export const ROWS = 30; // the default arrangement fills this many rows
export const MARGIN = 8;

// Wide screens: 24 columns. Watchlist | chart over account | book over tape | ticket.
const LG = [
  { i: "watch", x: 0, y: 0, w: 4, h: 30, minW: 3, minH: 6 },
  { i: "chart", x: 4, y: 0, w: 10, h: 20, minW: 5, minH: 8 },
  { i: "account", x: 4, y: 20, w: 10, h: 10, minW: 4, minH: 5 },
  { i: "book", x: 14, y: 0, w: 5, h: 17, minW: 3, minH: 6 },
  { i: "tape", x: 14, y: 17, w: 5, h: 13, minW: 3, minH: 5 },
  { i: "ticket", x: 19, y: 0, w: 5, h: 30, minW: 3, minH: 10 }
];
// Narrower screens: 12 columns. Chart wide on top, book and tape side by side.
const MD = [
  { i: "chart", x: 0, y: 0, w: 9, h: 20, minW: 4, minH: 8 },
  { i: "ticket", x: 9, y: 0, w: 3, h: 20, minW: 3, minH: 10 },
  { i: "book", x: 0, y: 20, w: 4, h: 14, minW: 3, minH: 6 },
  { i: "tape", x: 4, y: 20, w: 4, h: 14, minW: 3, minH: 5 },
  { i: "watch", x: 8, y: 20, w: 4, h: 14, minW: 2, minH: 6 },
  { i: "account", x: 0, y: 34, w: 12, h: 10, minW: 4, minH: 5 }
];
// Phones: one column, in reading order.
const SM = ["chart", "ticket", "book", "tape", "account", "watch"].map((i, n) => ({
  i, x: 0, y: n * 14, w: 1, h: i === "chart" ? 18 : 14
}));

export const DEFAULT_LAYOUTS = { lg: LG, md: MD, sm: SM };
export const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };
export const COLS = { lg: 24, md: 12, sm: 1 };

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

/** The row height that makes the default arrangement fill the space below the header. */
export function rowHeightFor(available) {
  return Math.max(14, Math.floor((available - (ROWS - 1) * MARGIN) / ROWS));
}
