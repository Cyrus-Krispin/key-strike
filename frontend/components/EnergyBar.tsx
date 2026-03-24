type EnergyBarProps = {
  value: number;
  enemy?: boolean;
};

export function EnergyBar({ value, enemy = false }: EnergyBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = enemy ? "bg-orange-400" : "bg-cyan-400";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-wide text-slate-300">
        <span>Energy</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800">
        <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
