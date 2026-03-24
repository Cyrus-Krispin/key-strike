import { EnergyBar } from "@/components/EnergyBar";
import { HealthBar } from "@/components/HealthBar";

type GameHUDProps = {
  playerName: string;
  enemyName: string;
  playerHealth: number;
  playerEnergy: number;
  enemyHealth: number;
  enemyEnergy: number;
};

export function GameHUD({
  playerName,
  enemyName,
  playerHealth,
  playerEnergy,
  enemyHealth,
  enemyEnergy
}: GameHUDProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-lg border border-cyan-600/40 bg-slate-950/70 p-4">
        <h3 className="text-sm uppercase tracking-widest text-cyan-300">Player</h3>
        <p className="mt-2 text-lg font-semibold text-slate-50">{playerName}</p>
        <div className="mt-4 space-y-3">
          <HealthBar value={playerHealth} />
          <EnergyBar value={playerEnergy} />
        </div>
      </div>
      <div className="rounded-lg border border-rose-600/40 bg-slate-950/70 p-4">
        <h3 className="text-sm uppercase tracking-widest text-rose-300">Enemy</h3>
        <p className="mt-2 text-lg font-semibold text-slate-50">{enemyName}</p>
        <div className="mt-4 space-y-3">
          <HealthBar value={enemyHealth} enemy />
          <EnergyBar value={enemyEnergy} enemy />
        </div>
      </div>
    </div>
  );
}
