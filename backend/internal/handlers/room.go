package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"key-strike/backend/internal/game"
)

func (h *Handler) RoomState(w http.ResponseWriter, r *http.Request) {
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	roomID := strings.TrimSpace(r.PathValue("roomId"))
	if roomID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "roomId is required"})
		return
	}

	room, ok := h.rooms.GetRoom(roomID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "room not found"})
		return
	}
	if !room.AllowsPlayer(playerID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "room access denied"})
		return
	}

	snapshot := room.Snapshot()

	writeJSON(w, http.StatusOK, snapshot)
}

func (h *Handler) RoomWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := strings.TrimSpace(r.URL.Query().Get("roomId"))
	playerName := strings.TrimSpace(r.URL.Query().Get("playerName"))
	playerID, err := h.verifyWebSocketSession(r)

	if roomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	room, ok := h.rooms.GetRoom(roomID)
	if !ok {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	if !room.AllowsPlayer(playerID) {
		http.Error(w, "room access denied", http.StatusForbidden)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	session := game.NewSession(playerID, playerName)
	snapshot, err := room.Connect(session)
	if err != nil {
		_ = conn.WriteJSON(game.ServerEvent{Type: "error", Error: err.Error()})
		_ = conn.Close()
		return
	}

	done := make(chan struct{})
	go writeSocketLoop(conn, session.Send, done)
	pushEvent(session, game.ServerEvent{Type: "state_update", Payload: snapshot})

	conn.SetReadLimit(4096)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	for {
		var event game.ClientEvent
		if err := conn.ReadJSON(&event); err != nil {
			break
		}

		switch strings.TrimSpace(strings.ToLower(event.Type)) {
		case "player_ready":
			ready := true
			if len(event.Payload) > 0 {
				var payload game.ReadyPayload
				if err := json.Unmarshal(event.Payload, &payload); err == nil {
					ready = payload.Ready
				}
			}
			if err := room.SetReady(playerID, ready); err != nil {
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			}
		case "input_char":
			var payload game.InputCharPayload
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				pushEvent(session, game.ServerEvent{Type: "error", Error: "invalid input_char payload"})
				continue
			}
			if err := room.HandleInputChar(playerID, payload.Char); err != nil {
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			}
		case "input_backspace":
			if err := room.HandleBackspace(playerID); err != nil {
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			}
		case "ping":
			pushEvent(session, game.ServerEvent{Type: "pong"})
		default:
			pushEvent(session, game.ServerEvent{Type: "error", Error: "unsupported event type"})
		}
	}

	room.Disconnect(playerID)
	close(session.Send)
	<-done
}

func writeSocketLoop(conn *websocket.Conn, send <-chan game.ServerEvent, done chan<- struct{}) {
	defer close(done)
	defer conn.Close()

	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case event, ok := <-send:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "closed"))
				return
			}
			if err := conn.WriteJSON(event); err != nil {
				return
			}
		case <-pingTicker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				return
			}
		}
	}
}

func pushEvent(session *game.Session, event game.ServerEvent) {
	if session == nil {
		return
	}
	select {
	case session.Send <- event:
	default:
	}
}
