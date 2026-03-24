import { AbilityBar } from "@/components/AbilityBar";
import { GameHUD } from "@/components/GameHUD";
import { TypingInput } from "@/components/TypingInput";

export default function PlayPage() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5">
        <h2 className="text-xl font-semibold text-slate-100">Battle Arena</h2>
        <div className="mt-6">
          <GameHUD
            playerName="You"
            enemyName="Shadow Scribe"
            playerHealth={78}
            playerEnergy={52}
            enemyHealth={61}
            enemyEnergy={40}
          />
        </div>
        <div className="mt-6">
          <TypingInput promptText="The quick brown fox jumps over the lazy dog." />
        </div>
      </div>
      <div className="space-y-6">
        <AbilityBar
          abilities={[
            { name: "Burst", cost: 20, keybind: "Q" },
            { name: "Shield", cost: 15, keybind: "W" },
            { name: "Slow", cost: 25, keybind: "E" }
          ]}
        />
      </div>
    </section>
  );
}
