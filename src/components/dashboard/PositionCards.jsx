import PositionCard from "./PositionCard";

export default function PositionCards({ spreads, accountId, onClose }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
      {spreads.map((s, i) => (
        <PositionCard key={`${s.shortSymbol}_${s.longSymbol}_${i}`} spread={s} accountId={accountId} onClose={onClose} />
      ))}
    </div>
  );
}