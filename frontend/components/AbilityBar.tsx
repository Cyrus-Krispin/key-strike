type Ability = {
  name: string;
  cost: number;
  keybind: string;
};

type AbilityBarProps = {
  abilities: Ability[];
};

export function AbilityBar({ abilities }: AbilityBarProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
      <h3 className="text-sm uppercase tracking-[0.2em] text-slate-400">Abilities</h3>
      <div className="mt-3 grid gap-2">
        {abilities.map((ability) => (
          <button
            key={ability.keybind}
            className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-left hover:border-cyan-400/60"
            type="button"
          >
            <div>
              <p className="font-medium text-slate-100">{ability.name}</p>
              <p className="text-xs text-slate-400">Cost: {ability.cost}</p>
            </div>
            <span className="rounded border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">{ability.keybind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
