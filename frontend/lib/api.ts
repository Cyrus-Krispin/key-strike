export type Profile = {
  id: string;
  username: string;
  level: number;
  wins: number;
  losses: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type MatchmakingMode = "ranked" | "casual" | "bot";
export type BotDifficulty = "easy" | "medium" | "hard";

export type QueueRequest = {
  playerId: string;
  playerName: string;
  mode: MatchmakingMode;
  difficulty?: BotDifficulty;
};

export type QueueResponse = {
  status: "searching" | "matched";
  mode?: MatchmakingMode;
  roomId?: string;
  queueSize?: number;
  opponent?: {
    id: string;
    name: string;
  };
  wsPath?: string;
};

export type MatchmakingStatusResponse = {
  status: "idle" | "searching" | "matched";
  mode?: MatchmakingMode;
  roomId?: string;
  queueSize?: number;
  position?: number;
  wsPath?: string;
  phase?: "waiting" | "countdown" | "active" | "ended";
};

export type RoomPlayerSnapshot = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  cursor: number;
  mistakes: number;
  typed: Array<{
    char: string;
    correct: boolean;
  }>;
};

export type RoomSnapshot = {
  roomId: string;
  mode: MatchmakingMode;
  phase: "waiting" | "countdown" | "active" | "ended";
  sentence: string;
  winnerPlayerId?: string;
  countdownSecondsRemain: number;
  players: RoomPlayerSnapshot[];
  updatedAtMs: number;
};

type RequestInitExtended = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function request<T>(path: string, init?: RequestInitExtended): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getProfile() {
  return request<Profile>("/api/profile");
}

export function queueMatchmaking(payload: QueueRequest) {
  return request<QueueResponse>("/api/matchmaking/queue", {
    method: "POST",
    body: payload
  });
}

export function cancelMatchmaking(playerId: string) {
  return request<{ removed: boolean }>("/api/matchmaking/cancel", {
    method: "POST",
    body: { playerId }
  });
}

export function getMatchmakingStatus(playerId: string) {
  const query = new URLSearchParams({ playerId });
  return request<MatchmakingStatusResponse>(`/api/matchmaking/status?${query.toString()}`);
}

export function getRoomState(roomId: string) {
  return request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(roomId)}/state`);
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function buildWebSocketUrl(path: string) {
  const base = new URL(API_BASE_URL);
  const protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${base.host}${path}`;
}
