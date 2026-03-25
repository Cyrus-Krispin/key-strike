export type MatchPhase = "countdown" | "active" | "ended";
export type PlayerId = "player" | "enemy";
export type Winner = PlayerId | "draw" | null;

export type TypedEntry = {
  char: string;
  correct: boolean;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  health: number;
  energy: number;
  cursor: number;
  combo: number;
  mistakes: number;
  sentencesCleared: number;
  typed: TypedEntry[];
};

export type SentenceState = {
  text: string;
};

export type GameState = {
  phase: MatchPhase;
  winner: Winner;
  nowMs: number;
  countdownEndsAtMs: number;
  sentence: SentenceState;
  player: PlayerState;
  enemy: PlayerState;
  rngSeed: number;
  enemyNextTypeAtMs: number;
  enemyTypeIntervalMs: number;
};

const MAX_HEALTH = 100;
const MAX_ENERGY = 100;
const COUNTDOWN_MS = 2500;
const ENEMY_TYPE_INTERVAL_MS = 280;

const SENTENCE_BANK = [
  "Stay steady and type with clean intent.",
  "Rhythm matters more than panic speed.",
  "Every clean keypress keeps your combo alive.",
  "Small mistakes cost momentum in this duel.",
  "Precision under pressure decides this round."
];

export function createInitialGameState(input?: {
  playerName?: string;
  enemyName?: string;
  nowMs?: number;
  seed?: number;
}): GameState {
  const nowMs = input?.nowMs ?? Date.now();
  const countdownEndsAtMs = nowMs + COUNTDOWN_MS;
  const seed = input?.seed ?? nowMs;
  const firstSentence = pickSentence(seed);

  return {
    phase: "countdown",
    winner: null,
    nowMs,
    countdownEndsAtMs,
    sentence: {
      text: firstSentence.text
    },
    player: createPlayer("player", input?.playerName ?? "You"),
    enemy: createPlayer("enemy", input?.enemyName ?? "Rival"),
    rngSeed: firstSentence.nextSeed,
    enemyNextTypeAtMs: countdownEndsAtMs + ENEMY_TYPE_INTERVAL_MS,
    enemyTypeIntervalMs: ENEMY_TYPE_INTERVAL_MS
  };
}

export function tickGame(state: GameState, nowMs: number): GameState {
  let next = { ...state, nowMs };

  if (next.phase === "ended") {
    return next;
  }

  if (next.phase === "countdown") {
    if (nowMs < next.countdownEndsAtMs) {
      return next;
    }
    next = {
      ...next,
      phase: "active",
      enemyNextTypeAtMs: nowMs + next.enemyTypeIntervalMs
    };
  }

  while (next.phase === "active" && nowMs >= next.enemyNextTypeAtMs) {
    next = applyEnemyInput(next);
    next = {
      ...next,
      enemyNextTypeAtMs: next.enemyNextTypeAtMs + next.enemyTypeIntervalMs
    };
    next = resolveWinner(next);
    if (next.phase === "ended") {
      return next;
    }
  }

  return next;
}

export function applyPlayerInput(state: GameState, key: string, nowMs: number): GameState {
  let next = tickGame(state, nowMs);
  if (next.phase !== "active") {
    return next;
  }
  if (key.length !== 1) {
    return next;
  }
  if (next.player.cursor >= next.sentence.text.length) {
    return next;
  }

  const expectedChar = next.sentence.text[next.player.cursor];
  const isCorrect = normalizeChar(expectedChar) === normalizeChar(key);

  const updatedPlayer: PlayerState = {
    ...next.player,
    cursor: next.player.cursor + 1,
    typed: [...next.player.typed, { char: key, correct: isCorrect }],
    combo: isCorrect ? next.player.combo + 1 : 0,
    mistakes: isCorrect ? next.player.mistakes : next.player.mistakes + 1,
    energy: clamp(next.player.energy + (isCorrect ? 3 : -2), 0, MAX_ENERGY)
  };

  next = {
    ...next,
    player: updatedPlayer
  };

  if (updatedPlayer.cursor >= next.sentence.text.length) {
    next = clearSentence(next, "player");
  }

  return resolveWinner(next);
}

export function applyPlayerBackspace(state: GameState, nowMs: number): GameState {
  let next = tickGame(state, nowMs);
  if (next.phase !== "active") {
    return next;
  }
  if (next.player.cursor <= 0) {
    return next;
  }

  const removed = next.player.typed[next.player.typed.length - 1];
  const typed = next.player.typed.slice(0, -1);
  const cursor = next.player.cursor - 1;

  next = {
    ...next,
    player: {
      ...next.player,
      typed,
      cursor,
      combo: trailingCorrectStreak(typed),
      mistakes: removed.correct ? next.player.mistakes : Math.max(0, next.player.mistakes - 1),
      energy: clamp(next.player.energy + (removed.correct ? -3 : 2), 0, MAX_ENERGY)
    }
  };

  return next;
}

export function getTypingProgressPercent(state: GameState, id: PlayerId): number {
  const actor = id === "player" ? state.player : state.enemy;
  if (!state.sentence.text.length) {
    return 0;
  }
  return Math.floor((actor.cursor / state.sentence.text.length) * 100);
}

function createPlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    health: MAX_HEALTH,
    energy: 0,
    cursor: 0,
    combo: 0,
    mistakes: 0,
    sentencesCleared: 0,
    typed: []
  };
}

function applyEnemyInput(state: GameState): GameState {
  if (state.phase !== "active") {
    return state;
  }
  if (state.enemy.cursor >= state.sentence.text.length) {
    return state;
  }

  const expectedChar = state.sentence.text[state.enemy.cursor];
  const roll = randomFloat(state.rngSeed);
  const successChance = expectedChar === " " ? 0.98 : 0.9;
  const isCorrect = roll.value <= successChance;

  const typedChar = isCorrect ? expectedChar : randomWrongChar(expectedChar, roll.nextSeed);
  const enemy: PlayerState = {
    ...state.enemy,
    cursor: state.enemy.cursor + 1,
    typed: [...state.enemy.typed, { char: typedChar, correct: isCorrect }],
    combo: isCorrect ? state.enemy.combo + 1 : 0,
    mistakes: isCorrect ? state.enemy.mistakes : state.enemy.mistakes + 1,
    energy: clamp(state.enemy.energy + (isCorrect ? 2 : -1), 0, MAX_ENERGY)
  };

  let next: GameState = {
    ...state,
    enemy,
    rngSeed: roll.nextSeed
  };

  if (enemy.cursor >= next.sentence.text.length) {
    next = clearSentence(next, "enemy");
  }

  return next;
}

function clearSentence(state: GameState, attackerId: PlayerId): GameState {
  const attacker = attackerId === "player" ? state.player : state.enemy;
  const target = attackerId === "player" ? state.enemy : state.player;

  const correctCount = attacker.typed.filter((entry) => entry.correct).length;
  const accuracy = attacker.typed.length > 0 ? correctCount / attacker.typed.length : 0;
  const comboBonus = Math.floor(Math.min(attacker.combo, 9) / 3);
  const mistakePenalty = Math.min(3, Math.floor(attacker.mistakes / 3));
  const damage = clamp(6 + Math.floor(accuracy * 6) + comboBonus - mistakePenalty, 3, 16);

  const nextAttacker: PlayerState = {
    ...attacker,
    sentencesCleared: attacker.sentencesCleared + 1
  };
  const nextTarget: PlayerState = {
    ...target,
    health: clamp(target.health - damage, 0, MAX_HEALTH)
  };

  const refreshed =
    attackerId === "player"
      ? { player: nextAttacker, enemy: nextTarget }
      : { player: nextTarget, enemy: nextAttacker };

  return withNextSentence({
    ...state,
    ...refreshed
  });
}

function withNextSentence(state: GameState): GameState {
  const picked = pickSentence(state.rngSeed);
  return {
    ...state,
    sentence: {
      text: picked.text
    },
    player: resetForSentence(state.player),
    enemy: resetForSentence(state.enemy),
    rngSeed: picked.nextSeed
  };
}

function resetForSentence(player: PlayerState): PlayerState {
  return {
    ...player,
    cursor: 0,
    combo: 0,
    mistakes: 0,
    typed: []
  };
}

function resolveWinner(state: GameState): GameState {
  const playerDown = state.player.health <= 0;
  const enemyDown = state.enemy.health <= 0;

  if (!playerDown && !enemyDown) {
    return state;
  }

  let winner: Winner = null;
  if (playerDown && enemyDown) {
    winner = "draw";
  } else if (playerDown) {
    winner = "enemy";
  } else {
    winner = "player";
  }

  return {
    ...state,
    phase: "ended",
    winner
  };
}

function pickSentence(seed: number) {
  const random = randomFloat(seed);
  const index = Math.floor(random.value * SENTENCE_BANK.length) % SENTENCE_BANK.length;
  return {
    text: SENTENCE_BANK[index],
    nextSeed: random.nextSeed
  };
}

function randomFloat(seed: number) {
  const nextSeed = (1664525 * seed + 1013904223) >>> 0;
  return {
    value: nextSeed / 4294967296,
    nextSeed
  };
}

function randomWrongChar(expectedChar: string, seed: number) {
  const pool = "abcdefghijklmnopqrstuvwxyz";
  let index = seed % pool.length;
  let candidate = pool[index];
  if (normalizeChar(candidate) === normalizeChar(expectedChar)) {
    index = (index + 1) % pool.length;
    candidate = pool[index];
  }
  return candidate;
}

function trailingCorrectStreak(typed: TypedEntry[]) {
  let streak = 0;
  for (let i = typed.length - 1; i >= 0; i--) {
    if (!typed[i].correct) break;
    streak++;
  }
  return streak;
}

function normalizeChar(char: string) {
  return char.toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
