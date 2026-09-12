import DeltaMintMark from "./DeltaMintMark";

// Mark + lowercase wordmark lockup used in every header.
export default function Wordmark({ size = 26, textClass = "text-base" }) {
  return (
    <div className="flex items-center gap-2.5">
      <DeltaMintMark size={size} />
      {/* Set in the display face, at the landing site's own weight and
          tracking. The app had it in the body face at +0.02em while
          deltamint.app set its brandmark in Bricolage Grotesque 700 at
          -0.02em — the same two words in two different typefaces, one click
          apart, which is what the owner meant by "frontpage is now different
          from the app". */}
      <span className={`${textClass} font-heading font-bold tracking-[-0.02em] text-dm-text`}>
        delta<span className="text-dm-mint">mint</span>
      </span>
    </div>
  );
}
