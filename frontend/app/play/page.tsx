"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  buildWebSocketUrl,
  cancelMatchmaking,
  getMatchmakingStatus,
  getRoomState,
  queueMatchmaking,
  type BotDifficulty,
  type MatchmakingMode,
  type RoomPlayerSnapshot,
  type RoomSnapshot
} from "@/lib/api";

type PlayMode = MatchmakingMode;
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

type SocketServerEvent = {
  type: string;
  payload?: RoomSnapshot;
  error?: string;
};

const VS_INTRO_MS = 4500;

const PLAYER_PROFILE: MatchProfile = {
  name: "You",
  rank: "Silver II",
  winRate: "58%",
  wpm: 76,
  streak: 4,
  avatar: "KB-01"
};

const PLAYER_ID_STORAGE_KEY = "key_strike_player_id";
const PLAYER_NAME_STORAGE_KEY = "key_strike_player_name";

export default function PlayPage() {
  const router = useRouter();
  const pathname = usePathname();
  const socketRef = useRef<WebSocket | null>(null);
  const queueRequestIdRef = useRef(0);
  const readyRequestSentRef = useRef(false);

  const [screen, setScreen] = useState<ScreenPhase>("lobby");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("medium");
  const [pendingMatch, setPendingMatch] = useState<MatchContext | null>(null);
  const [matchContext, setMatchContext] = useState<MatchContext | null>(null);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [routeMode, setRouteMode] = useState<PlayMode | null>(null);
  const [routeDifficulty, setRouteDifficulty] = useState<BotDifficulty | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [localPlayer, setLocalPlayer] = useState<{ id: string; name: string } | null>(null);

  const routeBattleId = useMemo(() => {
    const match = pathname.match(/^\/play\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const selfPlayer = useMemo(() => {
    if (!roomState || !localPlayer) return null;
    return roomState.players.find((player) => player.id === localPlayer.id) ?? null;
  }, [roomState, localPlayer]);

  const opponentPlayer = useMemo(() => {
    if (!roomState || !localPlayer) return null;
    return roomState.players.find((player) => player.id !== localPlayer.id) ?? null;
  }, [roomState, localPlayer]);

  const playerReady = Boolean(selfPlayer?.ready);
  const opponentReady = Boolean(opponentPlayer?.ready);

  useEffect(() => {
    readyRequestSentRef.current = playerReady;
  }, [playerReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let playerID = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (!playerID) {
      playerID = `player-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerID);
    }

    let playerName = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (!playerName) {
      playerName = `Typer-${playerID.slice(-4).toUpperCase()}`;
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
    }

    setLocalPlayer({ id: playerID, name: playerName });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setRouteMode(parseRouteMode(params.get("mode")));
    setRouteDifficulty(parseRouteDifficulty(params.get("difficulty")));
  }, [pathname]);

  useEffect(() => {
    if (routeBattleId) return;

    setScreen("lobby");
    setMatchContext(null);
    setRoomState(null);
    setConnectionError(null);
    setSocketConnected(false);

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [routeBattleId]);

  useEffect(() => {
    if (!routeBattleId || !localPlayer) return;

    let cancelled = false;
    setConnectionError(null);

    const bootstrapRoom = async () => {
      try {
        const snapshot = await getRoomState(routeBattleId);
        if (cancelled) return;

        setRoomState(snapshot);
        const mode = routeMode ?? snapshot.mode;
        const difficulty = mode === "bot" ? routeDifficulty ?? inferBotDifficulty(snapshot) : null;
        setMatchContext(buildMatchContext(snapshot, localPlayer, mode, difficulty));
        setPendingMatch(null);
        setScreen("vs_intro");
      } catch {
        if (cancelled) return;
        setConnectionError("Unable to load room state.");
      }
    };

    bootstrapRoom();
    return () => {
      cancelled = true;
    };
  }, [routeBattleId, localPlayer, routeMode, routeDifficulty]);

  useEffect(() => {
    if (!routeBattleId || !localPlayer) return;

    const wsPath = `/ws/room?roomId=${encodeURIComponent(routeBattleId)}&playerId=${encodeURIComponent(localPlayer.id)}&playerName=${encodeURIComponent(localPlayer.name)}`;
    const ws = new WebSocket(buildWebSocketUrl(wsPath));
    socketRef.current = ws;

    ws.onopen = () => {
      setSocketConnected(true);
      setConnectionError(null);
    };

    ws.onclose = () => {
      setSocketConnected(false);
    };

    ws.onerror = () => {
      setConnectionError("Realtime connection failed.");
    };

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SocketServerEvent;
        if (event.type === "state_update" && event.payload) {
          setRoomState(event.payload);
          return;
        }
        if (event.type === "error" && event.error) {
          setConnectionError(event.error);
        }
      } catch {
        setConnectionError("Received invalid realtime payload.");
      }
    };

    return () => {
      ws.close();
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [routeBattleId, localPlayer]);

  useEffect(() => {
    if (!roomState || !localPlayer) return;

    const mode = routeMode ?? roomState.mode;
    const difficulty = mode === "bot" ? routeDifficulty ?? inferBotDifficulty(roomState) : null;
    setMatchContext(buildMatchContext(roomState, localPlayer, mode, difficulty));
  }, [roomState, localPlayer, routeMode, routeDifficulty]);

  useEffect(() => {
    if (!pendingMatch || !localPlayer) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const status = await getMatchmakingStatus(localPlayer.id);
        if (cancelled) return;

        if (status.status === "matched" && status.roomId) {
          setPendingMatch(null);
          const mode = status.mode ?? pendingMatch.mode;
          const difficulty = mode === "bot" ? pendingMatch.difficulty : null;
          router.push(buildBattleRoute(status.roomId, mode, difficulty));
        }
      } catch {
        if (!cancelled) {
          setConnectionError("Unable to poll matchmaking status.");
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingMatch, localPlayer, router]);

  useEffect(() => {
    if (screen !== "vs_intro" || !matchContext) return;

    const timer = setTimeout(() => {
      setScreen("battle");
    }, VS_INTRO_MS);

    return () => clearTimeout(timer);
  }, [screen, matchContext]);

  const sendSocketEvent = useCallback((event: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(event));
  }, []);

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
          if (pressed.has("f") && pressed.has("j") && !readyRequestSentRef.current) {
            event.preventDefault();
            readyRequestSentRef.current = true;
            sendSocketEvent({
              type: "player_ready",
              payload: { ready: true }
            });
          }
        }
        return;
      }

      if (!roomState || roomState.phase !== "active") {
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        sendSocketEvent({ type: "input_backspace" });
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        sendSocketEvent({
          type: "input_char",
          payload: { char: event.key }
        });
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
  }, [screen, playerReady, roomState, sendSocketEvent]);

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

  const enemyProgress = useMemo(() => {
    if (!roomState || !opponentPlayer) return 0;
    const sentenceLength = roomState.sentence.length;
    if (!sentenceLength) return 0;
    return Math.floor((opponentPlayer.cursor / sentenceLength) * 100);
  }, [roomState, opponentPlayer]);

  const countdownValue = roomState?.phase === "countdown" ? Math.max(1, roomState.countdownSecondsRemain) : null;

  const battleStatus = useMemo(() => {
    if (connectionError) {
      return connectionError;
    }
    if (routeBattleId && !socketConnected) {
      return "Connecting to room...";
    }
    if (!playerReady) {
      return "Press F + J together to mark ready.";
    }
    if (!opponentReady) {
      return "Waiting for opponent readiness...";
    }
    if (!roomState) {
      return "Syncing room state...";
    }
    if (roomState.phase === "countdown") {
      return "Both ready. Countdown started.";
    }
    if (roomState.phase === "ended") {
      if (!localPlayer) return "Match ended";
      if (!roomState.winnerPlayerId) return "Draw";
      return roomState.winnerPlayerId === localPlayer.id ? "You win" : "Opponent wins";
    }
    return "Type directly on the sentence. Mistypes stay red. Backspace fixes.";
  }, [connectionError, routeBattleId, socketConnected, playerReady, opponentReady, roomState, localPlayer]);

  const handleQueueMode = async (mode: PlayMode) => {
    if (!localPlayer) {
      setConnectionError("Local player profile not ready. Refresh and try again.");
      return;
    }

    setConnectionError(null);
    setRoomState(null);
    setMatchContext(null);
    setScreen("lobby");

    const difficulty = mode === "bot" ? botDifficulty : null;
    const preview: MatchContext = {
      battleId: createBattleId(mode),
      mode,
      difficulty,
      player: {
        ...PLAYER_PROFILE,
        name: localPlayer.name
      },
      opponent: buildOpponentProfile(mode, difficulty)
    };

    setPendingMatch(preview);
    const requestID = ++queueRequestIdRef.current;

    try {
      await cancelMatchmaking(localPlayer.id).catch(() => undefined);

      const response = await queueMatchmaking({
        playerId: localPlayer.id,
        playerName: localPlayer.name,
        mode,
        difficulty: difficulty ?? undefined
      });

      if (queueRequestIdRef.current !== requestID) {
        return;
      }

      if (response.status === "matched" && response.roomId) {
        setPendingMatch(null);
        router.push(buildBattleRoute(response.roomId, mode, difficulty));
      }
    } catch {
      if (queueRequestIdRef.current === requestID) {
        setPendingMatch(null);
        setConnectionError("Failed to queue for matchmaking.");
      }
    }
  };

  const handleBackToLobby = async () => {
    if (localPlayer) {
      await cancelMatchmaking(localPlayer.id).catch(() => undefined);
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setPendingMatch(null);
    setMatchContext(null);
    setRoomState(null);
    setConnectionError(null);
    setSocketConnected(false);
    setScreen("lobby");
    router.push("/");
  };

  if (!matchContext && routeBattleId) {
    return <section className="fixed inset-0 z-50 h-[100dvh] w-screen bg-black" />;
  }

  if (screen === "lobby") {
    return (
      <section className="rounded-xl border border-white/25 bg-black p-6">
        <h1 className="text-2xl text-white">Choose Match Type</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-zinc-400">Battle modes</p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <ModeCard title="Ranked" description="Competitive matchmaking with rating impact." onClick={() => void handleQueueMode("ranked")} />
          <ModeCard title="Casual" description="Relaxed matchmaking with no rating pressure." onClick={() => void handleQueueMode("casual")} />

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
              onClick={() => void handleQueueMode("bot")}
            >
              Start Bot Match
            </button>
          </div>
        </div>

        {connectionError && <p className="mt-4 text-sm text-red-400">{connectionError}</p>}

        {pendingMatch && (
          <div className="fixed bottom-6 right-6 w-72 rounded-lg border border-white/25 bg-black p-4 shadow-xl shadow-black/70">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Finding Match</p>
            <p className="mt-1 text-sm text-white">
              {labelMode(pendingMatch.mode)}
              {pendingMatch.difficulty ? ` (${pendingMatch.difficulty})` : ""}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Ticket {pendingMatch.battleId}</p>
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

  const sentence = roomState?.sentence ?? "PRESS F + J TO READY";
  const typed = selfPlayer?.typed ?? [];
  const cursor = selfPlayer?.cursor ?? 0;

  return (
    <section className="fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black px-4 pb-6 pt-4 md:px-8 md:pb-8 md:pt-6">
      <div className="absolute right-4 top-4 text-right md:right-8 md:top-6">
        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Battle ID {matchContext.battleId}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
          {labelMode(matchContext.mode)}
          {matchContext.difficulty ? ` | ${matchContext.difficulty}` : ""}
        </p>
      </div>

      <p className="absolute left-1/2 top-4 w-[70%] -translate-x-1/2 text-center text-sm text-zinc-300 md:top-6">{battleStatus}</p>

      <div className="absolute left-4 top-24 w-[48%] max-w-xs md:left-10 md:top-24">
        <Combatant profile={matchContext.opponent} health={opponentPlayer?.health ?? 100} energy={0} />
      </div>

      <div className="absolute bottom-10 right-4 w-[48%] max-w-xs md:bottom-10 md:right-10">
        <Combatant profile={matchContext.player} health={selfPlayer?.health ?? 100} energy={0} alignRight />
      </div>

      <div className="absolute left-1/2 top-1/2 w-[92%] -translate-x-1/2 -translate-y-1/2 text-center md:w-[76%]">
        <SentenceLine sentence={sentence} typed={typed} cursor={cursor} showCursor />
        <OpponentProgressLine progress={enemyProgress} />
      </div>

      {countdownValue !== null && (
        <div
          key={countdownValue}
          className="countdown-pop pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(4rem,16vw,10rem)] leading-none text-white md:top-[36%]"
        >
          {countdownValue}
        </div>
      )}

      <button
        className="absolute left-4 top-4 rounded border border-white/30 px-3 py-1.5 text-xs uppercase tracking-wider text-zinc-300 hover:border-white/70 hover:text-white"
        type="button"
        onClick={() => void handleBackToLobby()}
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
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">
        HP {Math.floor(health)} | EN {Math.floor(energy)}
      </p>
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
  typed: RoomPlayerSnapshot["typed"];
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

function buildBattleRoute(roomID: string, mode: PlayMode, difficulty: BotDifficulty | null) {
  const params = new URLSearchParams({ mode });
  if (difficulty) {
    params.set("difficulty", difficulty);
  }
  return `/play/${roomID}?${params.toString()}`;
}

function parseRouteMode(value: string | null): PlayMode | null {
  if (value === "ranked" || value === "casual" || value === "bot") {
    return value;
  }
  return null;
}

function parseRouteDifficulty(value: string | null): BotDifficulty | null {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return null;
}

function labelMode(mode: PlayMode) {
  if (mode === "ranked") return "Ranked";
  if (mode === "casual") return "Casual";
  return "Bot";
}

function createBattleId(mode: PlayMode) {
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildMatchContext(
  snapshot: RoomSnapshot,
  localPlayer: { id: string; name: string },
  mode: PlayMode,
  difficulty: BotDifficulty | null
): MatchContext {
  const me = snapshot.players.find((player) => player.id === localPlayer.id);
  const opponent = snapshot.players.find((player) => player.id !== localPlayer.id);

  const playerProfile: MatchProfile = {
    ...PLAYER_PROFILE,
    name: me?.name || localPlayer.name
  };

  const opponentProfile = buildOpponentProfile(mode, difficulty, opponent?.name);
  return {
    battleId: snapshot.roomId,
    mode,
    difficulty,
    player: playerProfile,
    opponent: opponentProfile
  };
}

function buildOpponentProfile(mode: PlayMode, difficulty: BotDifficulty | null, name?: string): MatchProfile {
  if (mode === "ranked") {
    return {
      name: name || "ApexTyper",
      rank: "Gold I",
      winRate: "62%",
      wpm: 84,
      streak: 7,
      avatar: "KB-17"
    };
  }

  if (mode === "casual") {
    return {
      name: name || "TypeRunner",
      rank: "Bronze I",
      winRate: "49%",
      wpm: 68,
      streak: 2,
      avatar: "KB-09"
    };
  }

  if (difficulty === "easy") {
    return {
      name: name || "Bot Easy",
      rank: "Training",
      winRate: "40%",
      wpm: 52,
      streak: 1,
      avatar: "KB-B1"
    };
  }
  if (difficulty === "hard") {
    return {
      name: name || "Bot Hard",
      rank: "Elite",
      winRate: "78%",
      wpm: 95,
      streak: 9,
      avatar: "KB-B3"
    };
  }
  return {
    name: name || "Bot Medium",
    rank: "Standard",
    winRate: "58%",
    wpm: 74,
    streak: 4,
    avatar: "KB-B2"
  };
}

function inferBotDifficulty(snapshot: RoomSnapshot): BotDifficulty {
  const name = snapshot.players.map((player) => player.name.toLowerCase()).join(" ");
  if (name.includes("hard")) return "hard";
  if (name.includes("easy")) return "easy";
  return "medium";
}
