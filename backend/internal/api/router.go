package api

import (
	"net/http"

	"key-strike/backend/internal/handlers"
)

func NewRouter(h *handlers.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", method(http.MethodGet, h.Health))
	mux.HandleFunc("/api/profile", method(http.MethodGet, h.Profile))
	mux.HandleFunc("/api/matchmaking/status", method(http.MethodGet, h.MatchmakingStatus))
	return mux
}

func method(allowed string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != allowed {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}
