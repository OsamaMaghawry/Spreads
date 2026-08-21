// The DeltaMint mark: violet delta outline with two mint sprigs. Never recolored.
export default function DeltaMintMark({ size = 26, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" className={className} aria-hidden="true">
      <path d="M13 8 L21 22 L5 22 Z" fill="none" stroke="#534AB7" strokeWidth="1.6" />
      <path d="M10 15 Q13 10.5 10 6 Q7 10.5 10 15 Z" fill="#3FA672" />
      <path d="M16 15 Q19 10.5 16 6 Q13 10.5 16 15 Z" fill="#3FA672" />
    </svg>
  );
}
