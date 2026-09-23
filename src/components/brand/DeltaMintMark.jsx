// The DeltaMint mark: the lowercase Greek delta.
//
// Not a drawn triangle any more. The mark IS the letter traders already read on
// every option chain — the same delta the product is named after and the same
// one it reports in the positions table — so the logo and the vocabulary agree
// instead of the logo gesturing at it with a shape.
//
// WHY THIS IS A PATH AND NOT <text>.
//
// The glyph is IBM Plex Sans 700, the family the wordmark beside it is set in,
// so the mark and the word are one drawing used twice. But a <text> element
// resolves against whatever font the renderer happens to have: a browser that
// has not finished loading Plex, a favicon tab strip that loads no webfonts at
// all, an email client, a PDF exporter — each would substitute a different
// delta, and the brand would quietly change shape depending on where it was
// looked at. The outline was extracted once from the Plex Sans 700 Greek subset
// (U+03B4) and baked into coordinates, so every surface draws the identical
// letter with nothing to load. IBM Plex is OFL-licensed, which permits this.
//
// Fitted to a 32-unit box with 3 units of margin top and bottom, horizontally
// centred on the glyph's own bounds rather than its advance width — a letter
// carries side bearings meant for setting words, and leaving them in makes a
// standalone mark sit visibly off-centre.
export const DELTA_PATH =
  "M16.97 13.27Q15.62 13.3 14.69 13.94Q13.75 14.58 13.29 15.64Q12.82 16.69 12.82 18.11V21.36Q12.82 22.5 13.2 23.31Q13.58 24.12 14.29 24.54Q15 24.95 16 24.95Q17 24.95 17.71 24.54Q18.42 24.12 18.8 23.31Q19.18 22.5 19.18 21.36V19.56Q19.18 18.52 18.99 17.61Q18.8 16.69 18.4 15.88Q18.01 15.07 17.33 14.31Q16.66 13.55 15.72 12.82L9.36 7.84V3H22.88V6.98H17.42L14.2 6.6V6.73L17.83 8.95Q19.66 10.09 20.94 11.28Q22.22 12.47 23 13.79Q23.78 15.1 24.14 16.52Q24.51 17.94 24.51 19.49Q24.51 22.43 23.49 24.56Q22.47 26.68 20.56 27.84Q18.66 29 16 29Q13.34 29 11.44 27.82Q9.53 26.65 8.51 24.61Q7.49 22.57 7.49 19.94Q7.49 17.24 8.39 15.38Q9.29 13.51 10.74 12.54Q12.2 11.57 13.89 11.57V10.81Z";

// Where the letter's ink actually sits inside that square box.
//
// A SQUARE BOX IS RIGHT FOR A TILE AND WRONG FOR A LOCKUP. An app icon and a
// favicon want the letter centred in a square. A lockup does not: the delta is
// 17.01 units of ink in a 32-unit box, so a square mark carries 7.495 units of
// transparent padding on each side. At a 24px mark that is 5.6px of space on
// the right that nobody chose and nobody can see -- it simply adds itself to
// whatever gap the lockup sets, which is why a 10px gap was really 15.6px.
// `tight` crops the viewBox to the ink so the gap means what it says.
export const INK = { x: 7.495, width: 17.01 };

// The mark's EFFECTIVE FONT SIZE, per pixel of rendered height.
//
// The glyph fills 26 of the 32 units for a letter 752 of 1000 font units tall,
// so a mark rendered H pixels high is set at 1.0804 x H. This is the number
// that lets a lockup size the mark AGAINST THE WORDMARK rather than by eye:
// without it the two are independent magic numbers and drift apart, which is
// exactly how the delta ended up at 1.54x the type size of the word beside it.
export const EM_PER_PX = (26 * (1000 / 752)) / 32;

// One shape, one fill. The mark stays legible in a single colour, which is what
// a favicon, a printed page and an email signature all eventually reduce it to.
// `size` is the rendered HEIGHT; a tight mark's width follows from the ink.
export default function DeltaMintMark({ size = 26, color = "#534AB7", className = "", tight = false }) {
  return (
    <svg
      width={tight ? (size * INK.width) / 32 : size}
      height={size}
      viewBox={tight ? `${INK.x} 0 ${INK.width} 32` : "0 0 32 32"}
      className={className}
      aria-hidden="true"
    >
      <path d={DELTA_PATH} fill={color} />
    </svg>
  );
}
