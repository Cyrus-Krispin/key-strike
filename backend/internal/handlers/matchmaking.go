package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"key-strike/backend/internal/game"
)

type queueRequestBody struct {
	PlayerName string `json:"playerName"`
	Mode       string `json:"mode"`
	Difficulty string `json:"difficulty,omitempty"`
}

type cancelQueueBody struct {
	PlayerID string `json:"playerId"`
}

func (h *Handler) MatchmakingQueue(w http.ResponseWriter, r *http.Request) {
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var body queueRequestBody
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	playerName := strings.TrimSpace(body.PlayerName)
	if playerName == "" {
		playerName = defaultPlayerName(playerID)
	}

	response, err := h.rooms.Queue(game.QueueRequest{
		PlayerID:   playerID,
		PlayerName: playerName,
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
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var body cancelQueueBody
	if err := decodeJSONOptional(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	requestedPlayerID := strings.TrimSpace(body.PlayerID)
	if requestedPlayerID != "" && requestedPlayerID != playerID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "playerId mismatch"})
		return
	}

	removed := h.rooms.Cancel(playerID)
	writeJSON(w, http.StatusOK, map[string]any{
		"removed": removed,
	})
}

func (h *Handler) MatchmakingStatus(w http.ResponseWriter, r *http.Request) {
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, h.rooms.Status(playerID))
}

func decodeJSONOptional(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return err
	}
	return nil
}
