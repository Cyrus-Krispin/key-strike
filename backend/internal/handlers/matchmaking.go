package handlers

import (
	"net/http"
	"strings"

	"key-strike/backend/internal/game"
)

type queueRequestBody struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
	Mode       string `json:"mode"`
	Difficulty string `json:"difficulty,omitempty"`
}

type cancelQueueBody struct {
	PlayerID string `json:"playerId"`
}

func (h *Handler) MatchmakingQueue(w http.ResponseWriter, r *http.Request) {
	var body queueRequestBody
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	response, err := h.rooms.Queue(game.QueueRequest{
		PlayerID:   body.PlayerID,
		PlayerName: body.PlayerName,
		Mode:       body.Mode,
		Difficulty: body.Difficulty,
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) MatchmakingCancel(w http.ResponseWriter, r *http.Request) {
	var body cancelQueueBody
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	playerID := strings.TrimSpace(body.PlayerID)
	if playerID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "playerId is required"})
		return
	}

	removed := h.rooms.Cancel(playerID)
	writeJSON(w, http.StatusOK, map[string]any{
		"removed": removed,
	})
}

func (h *Handler) MatchmakingStatus(w http.ResponseWriter, r *http.Request) {
	playerID := strings.TrimSpace(r.URL.Query().Get("playerId"))
	if playerID == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "idle",
			"queueSize": h.rooms.QueueDepth(),
		})
		return
	}

	writeJSON(w, http.StatusOK, h.rooms.Status(playerID))
}
