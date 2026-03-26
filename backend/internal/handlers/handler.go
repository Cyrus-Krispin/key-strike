package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"

	"key-strike/backend/internal/game"
)

type Handler struct {
	rooms    *game.Manager
	upgrader websocket.Upgrader
}

func New() *Handler {
	return &Handler{
		rooms: game.NewManager(),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(_ *http.Request) bool {
				// CORS and auth rules can be tightened when auth is introduced.
				return true
			},
		},
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(r *http.Request, target any) error {
	return json.NewDecoder(r.Body).Decode(target)
}
