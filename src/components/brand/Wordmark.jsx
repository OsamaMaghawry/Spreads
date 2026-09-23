import DeltaMintMark, { EM_PER_PX } from "./DeltaMintMark";

// A LOCKUP TAKES ONE NUMBER, NOT TWO.
//
// This used to take a mark size AND a text class, set independently at each
// call site: 24/1.05rem in the header, 22/1.05rem in the mobile drawer,
// 28/1.125rem on the auth screens. Three different relationships between the
// same two things, none of them written down, and the delta ended up at 1.54x
// the type size of the word it belongs to -- the letter towering over its own
// name. Two numbers that must stay in proportion should never both be inputs.
//
// So `size` is the WORDMARK's type size in pixels, and the mark and the gap are
// derived from it. Change one number and the lockup stays in proportion.

// The mark is set 1.2x the wordmark's type size: clearly larger than the word's
// own ascenders, so it reads as a mark rather than a stray first letter, and
// close enough in weight that the two still look like one object. Judged by
// rendering 1.1, 1.2, 1.3 and 1.54 side by side rather than by arithmetic --
// it is an optical decision and the arithmetic only makes it repeatable.
const MARK_RATIO = 1.2;

// Three tenths of the type size. Wider than the word's own letter spacing,
// narrower than a word space, so the mark reads as attached to the name rather
// than sitting next to it. This is now the WHOLE gap: see INK in DeltaMintMark
// for the transparent padding that used to be added to it invisibly.
const GAP_RATIO = 0.3;

export default function Wordmark({ size = 16.8, className = "" }) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: `${size * GAP_RATIO}px` }}>
      <DeltaMintMark size={(size * MARK_RATIO) / EM_PER_PX} tight />
      {/* Bricolage Grotesque 700 at -0.02em, matching the marketing site
          exactly -- the same two words in two typefaces one click apart is what
          the owner meant by "frontpage is now different from the app".

          NOTE: this is NOT the family the delta is drawn from. Bricolage ships
          latin, latin-ext and vietnamese only; it has no Greek, so the mark
          cannot be drawn from it and is IBM Plex Sans 700 instead. The lockup
          is therefore two typefaces until that is decided one way or the
          other. Recorded here rather than left to be rediscovered. */}
      <span
        className="font-heading font-bold tracking-[-0.02em] text-dm-text"
        style={{ fontSize: `${size}px`, lineHeight: 1 }}
      >
        delta<span className="text-dm-mint">mint</span>
      </span>
    </div>
  );
}
