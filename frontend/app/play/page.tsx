"use client";

import { useEffect, useMemo, useState } from "react";
import { AbilityBar } from "@/components/AbilityBar";
import { GameHUD } from "@/components/GameHUD";
import { TypingInput } from "@/components/TypingInput";
import { applyPlayerBackspace, applyPlayerInput, createInitialGameState, getTypingProgressPercent, tickGame, type TypedEntry } from "@/lib/game/engine";

const TICK_MS = 60;

export default function PlayPage() {
  const [game, setGame] = useState(() =>
    createInitialGameState({
      playerName: "You",
      enemyName: "Shadow Scribe"
    })
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setGame((prev) => tickGame(prev, Date.now()));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const playerProgress = getTypingProgressPercent(game, "player");
  const enemyProgress = getTypingProgressPercent(game, "enemy");

  const statusText = useMemo(() => {
    if (game.phase === "countdown") {
      const remainingMs = Math.max(0, game.countdownEndsAtMs - game.nowMs);
      return `Match starts in ${Math.ceil(remainingMs / 1000)}...`;
    }
    if (game.phase === "ended") {
      if (game.winner === "draw") return "Draw";
      if (game.winner === "player") return "You win";
      return "Enemy wins";
    }
    return "Type through the fixed sentence. Backspace to fix mistakes.";
  }, [game.countdownEndsAtMs, game.nowMs, game.phase, game.winner]);

  const handleTypeChar = (char: string) => {
    setGame((prev) => applyPlayerInput(prev, char, Date.now()));
  };

  const handleBackspace = () => {
    setGame((prev) => applyPlayerBackspace(prev, Date.now()));
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-white/25 bg-black p-5">
        <h2 className="text-xl font-semibold text-white">Battle Arena</h2>
        <p className="mt-1 text-sm tracking-wider text-zinc-300">{statusText}</p>

        <div className="mt-5 rounded-lg border border-white/20 bg-black p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-zinc-300">Live Sentence</p>
          <TypingLine label="You" sentence={game.sentence.text} typed={game.player.typed} cursor={game.player.cursor} />
          <TypingLine label="Enemy" sentence={game.sentence.text} typed={game.enemy.typed} cursor={game.enemy.cursor} />
        </div>

        <div className="mt-6">
          <GameHUD
            playerName={game.player.name}
            enemyName={game.enemy.name}
            playerHealth={game.player.health}
            playerEnergy={game.player.energy}
            enemyHealth={game.enemy.health}
            enemyEnergy={game.enemy.energy}
          />
        </div>

        <div className="mt-6">
          <TypingInput
            disabled={game.phase !== "active"}
            onBackspace={handleBackspace}
            onTypeChar={handleTypeChar}
            progress={playerProgress}
            promptText={game.sentence.text}
            helperText={`You ${playerProgress}% | Enemy ${enemyProgress}%`}
          />
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

function TypingLine({
  label,
  sentence,
  typed,
  cursor
}: {
  label: string;
  sentence: string;
  typed: TypedEntry[];
  cursor: number;
}) {
  return (
    <div className="mb-3 rounded border border-white/20 bg-black p-3 last:mb-0">
      <p className="mb-1 text-xs uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="break-words text-2xl leading-relaxed">
        {sentence.split("").map((expectedChar, index) => {
          const entry = typed[index];
          const displayChar = entry ? entry.char : expectedChar;
          const textClass = entry ? (entry.correct ? "text-white" : "text-red-500") : "text-zinc-500";

          return (
            <span key={`${label}-${index}`} className="relative inline-block">
              {index === cursor && <span className="absolute -left-1 top-0 animate-pulse text-white">|</span>}
              <span className={textClass}>{displayChar === " " ? "\u00A0" : displayChar}</span>
            </span>
          );
        })}
        {cursor === sentence.length && <span className="ml-0.5 animate-pulse text-white">|</span>}
      </div>
    </div>
  );
}
