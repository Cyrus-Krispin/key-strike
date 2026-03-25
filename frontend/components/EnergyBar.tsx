type EnergyBarProps = {
  value: number;
  enemy?: boolean;
};

export function EnergyBar({ value, enemy = false }: EnergyBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = enemy ? "bg-zinc-600" : "bg-zinc-200";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-wide text-zinc-300">
        <span>Energy</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-900">
        <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
