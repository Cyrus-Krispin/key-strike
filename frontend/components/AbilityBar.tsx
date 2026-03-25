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
    <div className="rounded-xl border border-white/25 bg-black p-4">
      <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-300">Abilities</h3>
      <div className="mt-3 grid gap-2">
        {abilities.map((ability) => (
          <button
            key={ability.keybind}
            className="flex items-center justify-between rounded-md border border-white/20 bg-black px-3 py-2 text-left hover:border-white/60"
            type="button"
          >
            <div>
              <p className="font-medium text-zinc-100">{ability.name}</p>
              <p className="text-xs text-zinc-400">Cost: {ability.cost}</p>
            </div>
            <span className="rounded border border-white/30 bg-zinc-950 px-2 py-1 text-xs text-zinc-100">{ability.keybind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
