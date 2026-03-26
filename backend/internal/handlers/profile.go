package handlers

import "net/http"

func (h *Handler) Profile(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       "player-1",
		"username": "wordblazer",
		"level":    12,
		"wins":     27,
		"losses":   9,
	})
}
