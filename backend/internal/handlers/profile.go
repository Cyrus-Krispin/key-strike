package handlers

import "net/http"

func (h *Handler) Profile(w http.ResponseWriter, r *http.Request) {
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":       playerID,
		"username": defaultPlayerName(playerID),
		"level":    12,
		"wins":     27,
		"losses":   9,
	})
}
