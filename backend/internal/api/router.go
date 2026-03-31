package api

import (
	"net/http"

	"key-strike/backend/internal/config"
	"key-strike/backend/internal/handlers"
)

func NewRouter(h *handlers.Handler, cfg config.Config) http.Handler {
	protect := protectedRoute(cfg.ClerkAuthorizedParties)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.Handle("GET /api/profile", protect(http.HandlerFunc(h.Profile)))
	mux.Handle("GET /api/matchmaking/status", protect(http.HandlerFunc(h.MatchmakingStatus)))
	mux.Handle("POST /api/matchmaking/queue", protect(http.HandlerFunc(h.MatchmakingQueue)))
	mux.Handle("POST /api/matchmaking/cancel", protect(http.HandlerFunc(h.MatchmakingCancel)))
	mux.Handle("GET /api/rooms/{roomId}/state", protect(http.HandlerFunc(h.RoomState)))
	mux.HandleFunc("GET /ws/room", h.RoomWebSocket)
	return mux
}
