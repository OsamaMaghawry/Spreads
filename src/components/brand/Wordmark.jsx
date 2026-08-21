import DeltaMintMark from "./DeltaMintMark";

// Mark + lowercase wordmark lockup used in every header.
export default function Wordmark({ size = 26, textClass = "text-base" }) {
  return (
    <div className="flex items-center gap-2.5">
      <DeltaMintMark size={size} />
      <span className={`${textClass} font-medium tracking-[0.02em] text-dm-text`}>
        delta<b className="font-semibold text-dm-mint">mint</b>
      </span>
    </div>
  );
}
