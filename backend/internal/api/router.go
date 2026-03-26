package api

import (
	"net/http"

	"key-strike/backend/internal/handlers"
)

func NewRouter(h *handlers.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("GET /api/profile", h.Profile)
	mux.HandleFunc("GET /api/matchmaking/status", h.MatchmakingStatus)
	mux.HandleFunc("POST /api/matchmaking/queue", h.MatchmakingQueue)
	mux.HandleFunc("POST /api/matchmaking/cancel", h.MatchmakingCancel)
	mux.HandleFunc("GET /api/rooms/{roomId}/state", h.RoomState)
	mux.HandleFunc("GET /ws/room", h.RoomWebSocket)
	return mux
}
