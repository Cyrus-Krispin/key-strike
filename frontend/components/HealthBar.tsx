type HealthBarProps = {
  value: number;
  enemy?: boolean;
};

export function HealthBar({ value, enemy = false }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = enemy ? "bg-zinc-400" : "bg-white";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-wide text-zinc-300">
        <span>Health</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-3 rounded-full bg-zinc-900">
        <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
