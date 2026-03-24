type HealthBarProps = {
  value: number;
  enemy?: boolean;
};

export function HealthBar({ value, enemy = false }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = enemy ? "bg-rose-500" : "bg-emerald-500";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-wide text-slate-300">
        <span>Health</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800">
        <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
