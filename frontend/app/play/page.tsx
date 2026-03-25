"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyPlayerBackspace,
  applyPlayerInput,
  createInitialGameState,
  getTypingProgressPercent,
  tickGame,
  type GameState,
  type TypedEntry
} from "@/lib/game/engine";

type PlayMode = "ranked" | "casual" | "bot";
type BotDifficulty = "easy" | "medium" | "hard";
type ScreenPhase = "lobby" | "vs_intro" | "battle";

type MatchProfile = {
  name: string;
  rank: string;
  winRate: string;
  wpm: number;
  streak: number;
  avatar: string;
};

type MatchContext = {
  battleId: string;
  mode: PlayMode;
  difficulty: BotDifficulty | null;
  player: MatchProfile;
  opponent: MatchProfile;
};

const TICK_MS = 60;
const VS_INTRO_MS = 4500;

const PLAYER_PROFILE: MatchProfile = {
  name: "You",
  rank: "Silver II",
  winRate: "58%",
  wpm: 76,
  streak: 4,
  avatar: "KB-01"
};

export default function PlayPage() {
  const [screen, setScreen] = useState<ScreenPhase>("lobby");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("medium");
  const [pendingMatch, setPendingMatch] = useState<MatchContext | null>(null);
  const [matchContext, setMatchContext] = useState<MatchContext | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  useEffect(() => {
    if (!pendingMatch || pendingMatch.mode === "bot") return;

    const waitMs = pendingMatch.mode === "ranked" ? 3000 : 2200;
    const timer = setTimeout(() => {
      setMatchContext(pendingMatch);
      setPendingMatch(null);
      setScreen("vs_intro");
    }, waitMs);

    return () => clearTimeout(timer);
  }, [pendingMatch]);

  useEffect(() => {
    if (screen !== "vs_intro" || !matchContext) return;

    const timer = setTimeout(() => {
      setScreen("battle");
    }, VS_INTRO_MS);

    return () => clearTimeout(timer);
  }, [screen, matchContext]);

  useEffect(() => {
    if (screen !== "battle" || !matchContext) return;

    setGame(null);
    setPlayerReady(false);
    setOpponentReady(false);

    const readyDelayMs = matchContext.mode === "bot" ? 500 : 1400;
    const timer = setTimeout(() => setOpponentReady(true), readyDelayMs);

    return () => clearTimeout(timer);
  }, [screen, matchContext]);

  useEffect(() => {
    if (screen !== "battle" || !matchContext) return;
    if (!playerReady || !opponentReady) return;
    if (game) return;

    setGame(
      createInitialGameState({
        playerName: matchContext.player.name,
        enemyName: matchContext.opponent.name,
        startActive: false,
        enemyTypeIntervalMs: getEnemyInterval(matchContext.difficulty)
      })
    );
  }, [screen, matchContext, playerReady, opponentReady, game]);

  useEffect(() => {
    if (screen !== "battle" || !game) return;

    const interval = setInterval(() => {
      setGame((prev) => (prev ? tickGame(prev, Date.now()) : prev));
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [screen, game]);

  useEffect(() => {
    if (screen !== "battle") return;

    const pressed = new Set<string>();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingField = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      if (isTypingField || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const lowerKey = event.key.toLowerCase();

      if (!playerReady) {
        if (lowerKey === "f" || lowerKey === "j") {
          pressed.add(lowerKey);
          if (pressed.has("f") && pressed.has("j")) {
            event.preventDefault();
            setPlayerReady(true);
          }
        }
        return;
      }

      if (!game || game.phase !== "active") {
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setGame((prev) => (prev ? applyPlayerBackspace(prev, Date.now()) : prev));
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        setGame((prev) => (prev ? applyPlayerInput(prev, event.key, Date.now()) : prev));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === "f" || lowerKey === "j") {
        pressed.delete(lowerKey);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [screen, playerReady, game]);

  useEffect(() => {
    const fullscreenScreen = screen === "vs_intro" || screen === "battle";
    if (!fullscreenScreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [screen]);

  const enemyProgress = game ? getTypingProgressPercent(game, "enemy") : 0;
  const battleIsFullscreen = screen === "battle";
  const countdownValue =
    game && game.phase === "countdown" ? Math.max(1, Math.ceil((game.countdownEndsAtMs - game.nowMs) / 1000)) : null;

  const battleStatus = useMemo(() => {
    if (!playerReady) {
      return "Press F + J together to mark ready.";
    }
    if (!opponentReady) {
      return "Waiting for opponent readiness...";
    }
    if (!game) {
      return "Preparing match start...";
    }
    if (game.phase === "countdown") {
      return "Both ready. Countdown started.";
    }
    if (game.phase === "ended") {
      if (game.winner === "draw") return "Draw";
      if (game.winner === "player") return "You win";
      return "Opponent wins";
    }
    return "Type directly on the sentence. Mistypes stay red. Backspace fixes.";
  }, [playerReady, opponentReady, game]);

  const handleQueueMode = (mode: PlayMode) => {
    setGame(null);
    setPlayerReady(false);
    setOpponentReady(false);

    const difficulty = mode === "bot" ? botDifficulty : null;
    const context: MatchContext = {
      battleId: createBattleId(mode),
      mode,
      difficulty,
      player: PLAYER_PROFILE,
      opponent: buildOpponentProfile(mode, difficulty)
    };

    if (mode === "bot") {
      setPendingMatch(null);
      setMatchContext(context);
      setScreen("vs_intro");
      return;
    }

    setScreen("lobby");
    setPendingMatch(context);
  };

  const handleBackToLobby = () => {
    setScreen("lobby");
    setMatchContext(null);
    setPendingMatch(null);
    setGame(null);
    setPlayerReady(false);
    setOpponentReady(false);
  };

  if (screen === "lobby") {
    return (
      <section className="rounded-xl border border-white/25 bg-black p-6">
        <h1 className="text-2xl text-white">Choose Match Type</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-zinc-400">Battle modes</p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <ModeCard title="Ranked" description="Competitive matchmaking with rating impact." onClick={() => handleQueueMode("ranked")} />
          <ModeCard title="Casual" description="Relaxed matchmaking with no rating pressure." onClick={() => handleQueueMode("casual")} />

          <div className="rounded-lg border border-white/20 bg-black p-4">
            <h2 className="text-xl text-white">Bot</h2>
            <p className="mt-1 text-sm text-zinc-400">Instant match with difficulty selection.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["easy", "medium", "hard"] as BotDifficulty[]).map((level) => (
                <button
                  key={level}
                  className={`rounded border px-3 py-2 text-xs uppercase tracking-widest ${
                    botDifficulty === level
                      ? "border-white bg-zinc-900 text-white"
                      : "border-white/20 bg-black text-zinc-300 hover:border-white/60"
                  }`}
                  type="button"
                  onClick={() => setBotDifficulty(level)}
                >
                  {level}
                </button>
              ))}
            </div>
            <button
              className="mt-4 w-full rounded border border-white/40 bg-zinc-950 px-3 py-2 text-sm text-white hover:bg-zinc-900"
              type="button"
              onClick={() => handleQueueMode("bot")}
            >
              Start Bot Match
            </button>
          </div>
        </div>

        {pendingMatch && (
          <div className="fixed bottom-6 right-6 w-72 rounded-lg border border-white/25 bg-black p-4 shadow-xl shadow-black/70">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Finding Match</p>
            <p className="mt-1 text-sm text-white">
              {labelMode(pendingMatch.mode)}
              {pendingMatch.difficulty ? ` (${pendingMatch.difficulty})` : ""}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Battle ID {pendingMatch.battleId}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-white" />
              <span>Searching opponent...</span>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (!matchContext) {
    return null;
  }

  if (screen === "vs_intro") {
    return <VSIntro context={matchContext} durationMs={VS_INTRO_MS} />;
  }

  return (
    <section
      className={
        battleIsFullscreen
          ? "fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black px-4 pb-6 pt-4 md:px-8 md:pb-8 md:pt-6"
          : "relative min-h-[620px] rounded-xl border border-white/25 bg-black p-4"
      }
    >
      <div className={battleIsFullscreen ? "absolute right-4 top-4 text-right md:right-8 md:top-6" : ""}>
        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Battle ID {matchContext.battleId}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
          {labelMode(matchContext.mode)}
          {matchContext.difficulty ? ` | ${matchContext.difficulty}` : ""}
        </p>
      </div>

      <p
        className={
          battleIsFullscreen
            ? "absolute left-1/2 top-4 w-[70%] -translate-x-1/2 text-center text-sm text-zinc-300 md:top-6"
            : "mt-2 text-sm text-zinc-300"
        }
      >
        {battleStatus}
      </p>

      <div className={battleIsFullscreen ? "absolute left-4 top-24 w-[48%] max-w-xs md:left-10 md:top-24" : "absolute left-4 top-20 w-[42%] lg:w-60"}>
        <Combatant profile={matchContext.opponent} health={game?.enemy.health ?? 100} energy={game?.enemy.energy ?? 0} />
      </div>

      <div
        className={battleIsFullscreen ? "absolute bottom-10 right-4 w-[48%] max-w-xs md:bottom-10 md:right-10" : "absolute bottom-8 right-4 w-[42%] lg:w-60"}
      >
        <Combatant profile={matchContext.player} health={game?.player.health ?? 100} energy={game?.player.energy ?? 0} alignRight />
      </div>

      <div
        className={
          battleIsFullscreen
            ? "absolute left-1/2 top-1/2 w-[92%] -translate-x-1/2 -translate-y-1/2 text-center md:w-[76%]"
            : "absolute left-1/2 top-1/2 w-[88%] -translate-x-1/2 -translate-y-1/2 text-center lg:w-[72%]"
        }
      >
        <SentenceLine
          sentence={game?.sentence.text ?? "PRESS F + J TO READY"}
          typed={game?.player.typed ?? []}
          cursor={game?.player.cursor ?? 0}
          showCursor={Boolean(game)}
        />
        <OpponentProgressLine progress={enemyProgress} />
      </div>

      {countdownValue !== null && (
        <div
          key={countdownValue}
          className="countdown-pop pointer-events-none absolute left-1/2 top-[38%] z-20 select-none text-[clamp(4rem,16vw,10rem)] leading-none text-white md:top-[36%]"
        >
          {countdownValue}
        </div>
      )}

      <button
        className={
          battleIsFullscreen
            ? "absolute left-4 top-4 rounded border border-white/30 px-3 py-1.5 text-xs uppercase tracking-wider text-zinc-300 hover:border-white/70 hover:text-white"
            : "absolute bottom-4 left-4 rounded border border-white/30 px-3 py-1.5 text-xs uppercase tracking-wider text-zinc-300 hover:border-white/70 hover:text-white"
        }
        type="button"
        onClick={handleBackToLobby}
      >
        Back To Modes
      </button>
    </section>
  );
}

function ModeCard({
  title,
  description,
  onClick
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="rounded-lg border border-white/20 bg-black p-4 text-left hover:border-white/70" type="button" onClick={onClick}>
      <h2 className="text-xl text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
    </button>
  );
}

function VSIntro({
  context,
  durationMs
}: {
  context: MatchContext;
  durationMs: number;
}) {
  return (
    <section className="fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black p-4 md:p-6">
      <p className="absolute right-4 top-4 text-xs uppercase tracking-[0.25em] text-zinc-400 md:right-8 md:top-6">
        Battle ID {context.battleId}
      </p>

      <div className="absolute inset-0 bg-black" />
      <div
        className="vs-diagonal-line absolute bottom-0 left-0 h-[2px] w-[170%] origin-bottom-left rotate-[29deg] bg-white/55"
        style={{ animationDuration: `${durationMs}ms` }}
      />

      <div className="vs-panel-left absolute inset-y-0 left-0 w-1/2 border-r border-white/10 bg-zinc-950" style={{ animationDuration: `${durationMs}ms` }}>
        <div className="absolute left-4 top-20 w-[90%] md:left-8">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400 md:text-base">Opponent</p>
          <p className="mt-2 text-3xl text-white md:text-6xl">{context.opponent.name}</p>
          <StatLine label="Rank" value={context.opponent.rank} />
          <StatLine label="Win Rate" value={context.opponent.winRate} />
          <StatLine label="WPM" value={String(context.opponent.wpm)} />
          <StatLine label="Streak" value={String(context.opponent.streak)} />
        </div>
      </div>

      <div className="vs-panel-right absolute inset-y-0 right-0 w-1/2 border-l border-white/10 bg-zinc-900" style={{ animationDuration: `${durationMs}ms` }}>
        <div className="absolute bottom-16 right-4 w-[90%] text-right md:right-8">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400 md:text-base">You</p>
          <p className="mt-2 text-3xl text-white md:text-6xl">{context.player.name}</p>
          <StatLine label="Rank" value={context.player.rank} alignRight />
          <StatLine label="Win Rate" value={context.player.winRate} alignRight />
          <StatLine label="WPM" value={String(context.player.wpm)} alignRight />
          <StatLine label="Streak" value={String(context.player.streak)} alignRight />
        </div>
      </div>

      <div className="vs-label absolute left-1/2 top-1/2 z-10 px-4 py-2 text-6xl text-white md:text-8xl" style={{ animationDuration: `${durationMs}ms` }}>
        VS
      </div>
    </section>
  );
}

function StatLine({
  label,
  value,
  alignRight = false
}: {
  label: string;
  value: string;
  alignRight?: boolean;
}) {
  return (
    <p className={`mt-2 text-base text-zinc-300 md:text-2xl ${alignRight ? "text-right" : ""}`}>
      {label}: {value}
    </p>
  );
}

function Combatant({
  profile,
  health,
  energy,
  alignRight = false
}: {
  profile: MatchProfile;
  health: number;
  energy: number;
  alignRight?: boolean;
}) {
  return (
    <div className={alignRight ? "text-right" : ""}>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{profile.avatar}</p>
      <p className="text-lg text-white">{profile.name}</p>
      <p className="text-xs text-zinc-400">Rank {profile.rank}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">HP {Math.floor(health)} | EN {Math.floor(energy)}</p>
    </div>
  );
}

function SentenceLine({
  sentence,
  typed,
  cursor,
  showCursor
}: {
  sentence: string;
  typed: TypedEntry[];
  cursor: number;
  showCursor: boolean;
}) {
  return (
    <p className="break-words text-3xl leading-relaxed">
      {sentence.split("").map((expectedChar, index) => {
        const entry = typed[index];
        const textClass = entry ? (entry.correct ? "text-white" : "text-red-500") : "text-zinc-500";

        return (
          <span key={index} className="relative inline-block">
            {showCursor && index === cursor && <span className="absolute -left-1 top-0 animate-pulse text-white">|</span>}
            <span className={textClass}>{expectedChar === " " ? "\u00A0" : expectedChar}</span>
          </span>
        );
      })}
      {showCursor && cursor === sentence.length && <span className="ml-0.5 animate-pulse text-white">|</span>}
    </p>
  );
}

function OpponentProgressLine({ progress }: { progress: number }) {
  return (
    <div className="mx-auto mt-4 w-40 md:w-52">
      <div className="h-[3px] w-full rounded-full bg-zinc-800">
        <div className="h-[3px] rounded-full bg-zinc-400 transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function getEnemyInterval(level: BotDifficulty | null) {
  if (level === "easy") return 360;
  if (level === "hard") return 210;
  return 280;
}

function labelMode(mode: PlayMode) {
  if (mode === "ranked") return "Ranked";
  if (mode === "casual") return "Casual";
  return "Bot";
}

function createBattleId(mode: PlayMode) {
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildOpponentProfile(mode: PlayMode, difficulty: BotDifficulty | null): MatchProfile {
  if (mode === "ranked") {
    return {
      name: "ApexTyper",
      rank: "Gold I",
      winRate: "62%",
      wpm: 84,
      streak: 7,
      avatar: "KB-17"
    };
  }

  if (mode === "casual") {
    return {
      name: "TypeRunner",
      rank: "Bronze I",
      winRate: "49%",
      wpm: 68,
      streak: 2,
      avatar: "KB-09"
    };
  }

  if (difficulty === "easy") {
    return {
      name: "Bot Easy",
      rank: "Training",
      winRate: "40%",
      wpm: 52,
      streak: 1,
      avatar: "KB-B1"
    };
  }
  if (difficulty === "hard") {
    return {
      name: "Bot Hard",
      rank: "Elite",
      winRate: "78%",
      wpm: 95,
      streak: 9,
      avatar: "KB-B3"
    };
  }
  return {
    name: "Bot Medium",
    rank: "Standard",
    winRate: "58%",
    wpm: 74,
    streak: 4,
    avatar: "KB-B2"
  };
}
