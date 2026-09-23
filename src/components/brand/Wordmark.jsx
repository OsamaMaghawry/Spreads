import DeltaMintMark, { INK } from "./DeltaMintMark";

// A LOCKUP TAKES ONE NUMBER, NOT TWO.
//
// This used to take a mark size AND a text class, set independently at each
// call site: 24/1.05rem in the header, 22/1.05rem in the mobile drawer,
// 28/1.125rem on the auth screens. Three different relationships between the
// same two things, none of them written down, and the delta ended up at 1.54x
// the type size of the word it belongs to -- the letter towering over its own
// name. Two numbers that must stay in proportion should never both be inputs.
//
// So `size` is the WORDMARK's type size in pixels, and the mark, the gap and
// the vertical placement are all derived from it.

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

// WHERE "deltamint" ACTUALLY PUTS INK, in Bricolage Grotesque 700, measured
// from the font rather than assumed.
//
// The word's ink runs from the round overshoot under d, e and a to the dot on
// the i -- NOT from the baseline to the cap line.
//
// AND IT MOVES WITH THE TYPE SIZE, which is the trap here. Bricolage Grotesque
// is a variable font whose only axis is optical size (opsz 12..96), and CSS
// `font-optical-sizing: auto` -- the default -- sets opsz to the rendered pixel
// size. The letterforms are therefore not fixed: the i-dot sits at 0.745em at
// opsz 12 and 0.709em at opsz 96, so the word's ink centre travels from 0.3655
// to 0.3475em depending purely on how big it is drawn.
//
// The first version of this constant used 0.3475 -- the opsz 96 value, because
// 96 is the axis DEFAULT and so what fontTools reports for the uninstantiated
// font. Lockups render at 18-24px, where opsz is 18-24 and the true centre is
// 0.3629-0.3642em. That 0.016em gap is exactly the residual misalignment that
// showed up when the rendered page was measured at two scales.
//
// So these are the opsz 21 values -- nav size, and the middle of the range
// every lockup uses. Across 18-24px the centre moves 0.0013em, which is three
// hundredths of a pixel and below anything that can be drawn.
const WORD_INK_TOP = 0.7411;
const WORD_INK_BOTTOM = -0.014;
const WORD_INK_CENTRE = (WORD_INK_TOP + WORD_INK_BOTTOM) / 2;

// The delta's own ink is 752 of its 1000 em units tall (-12 to 740), so at
// MARK_RATIO it stands this tall in the wordmark's em.
const MARK_INK = INK.emHeight * MARK_RATIO;

// ALIGNED ON INK, NOT ON BOXES.
//
// `align-items: center` centres the mark's BOX against the text's LINE BOX,
// and those are not the same thing: "deltamint" has no descender, so its ink
// sits entirely above the baseline while the line box still reserves descender
// space below it. Measured on an 80px lockup, that put the delta 3.5px low --
// 2px of overhang above the word and 9px below. The owner: "the height is not
// centred in the middle both together ... no discrepancies whether height from
// above or below."
//
// So the mark hangs off the TEXT BASELINE instead, and this is how far below
// that baseline its bottom edge must sit for the two ink centres to coincide.
// The delta is taller than the word either way; it now overhangs equally above
// and below rather than lopsidedly.
const MARK_DROP = MARK_INK / 2 - WORD_INK_CENTRE;

export default function Wordmark({ size = 16.8, className = "" }) {
  return (
    <div className={`flex items-baseline ${className}`} style={{ gap: `${size * GAP_RATIO}px` }}>
      <DeltaMintMark
        size={size * MARK_INK}
        tight
        style={{ position: "relative", top: `${size * MARK_DROP}px` }}
      />
      {/* Bricolage Grotesque 700 at -0.02em, matching the marketing site
          exactly -- the same two words in two typefaces one click apart is what
          the owner meant by "frontpage is now different from the app".

          NOTE: this is NOT the family the delta is drawn from. Bricolage ships
          latin, latin-ext and vietnamese only; across all three subsets it
          carries 456 codepoints and NOT ONE of them is Greek, so the mark
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
