package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"

	"key-strike/backend/internal/config"
	"key-strike/backend/internal/game"
)

type Handler struct {
	rooms             *game.Manager
	upgrader          websocket.Upgrader
	authorizedParties []string
}

func New(cfg config.Config) *Handler {
	allowedOrigins := collectAllowedOrigins(cfg.AllowedOrigin, cfg.ClerkAuthorizedParties)

	return &Handler{
		rooms: game.NewManager(),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				if len(allowedOrigins) == 0 {
					return true
				}

				origin := strings.TrimSpace(r.Header.Get("Origin"))
				if origin == "" {
					return false
				}

				normalized, ok := normalizeOrigin(origin)
				if !ok {
					return false
				}

				_, exists := allowedOrigins[normalized]
				return exists
			},
		},
		authorizedParties: cfg.ClerkAuthorizedParties,
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

func collectAllowedOrigins(primary string, authorizedParties []string) map[string]struct{} {
	allowlist := make(map[string]struct{})
	appendOrigin := func(value string) {
		normalized, ok := normalizeOrigin(value)
		if !ok {
			return
		}
		allowlist[normalized] = struct{}{}
	}

	if strings.TrimSpace(primary) != "*" {
		appendOrigin(primary)
	}
	for _, party := range authorizedParties {
		appendOrigin(party)
	}
	return allowlist
}

func normalizeOrigin(value string) (string, bool) {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return "", false
	}

	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", false
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), true
}
