package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"key-strike/backend/internal/game"
)

func (h *Handler) RoomState(w http.ResponseWriter, r *http.Request) {
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		log.Printf("room_state unauthorized: err=%v", err)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	roomID := strings.TrimSpace(r.PathValue("roomId"))
	if roomID == "" {
		log.Printf("room_state bad_request: player_id=%s missing room_id", playerID)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "roomId is required"})
		return
	}

	room, ok := h.rooms.GetRoom(roomID)
	if !ok {
		log.Printf("room_state not_found: player_id=%s room_id=%s", playerID, roomID)
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "room not found"})
		return
	}
	if !room.AllowsPlayer(playerID) {
		log.Printf("room_state forbidden: player_id=%s room_id=%s", playerID, roomID)
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
	log.Printf("room_ws attempt: room_id=%s requested_name=%q", roomID, playerName)

	if roomID == "" {
		log.Printf("room_ws bad_request: player_id=%s missing room_id", playerID)
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}
	if err != nil {
		log.Printf("room_ws unauthorized: room_id=%s err=%v", roomID, err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	room, ok := h.rooms.GetRoom(roomID)
	if !ok {
		log.Printf("room_ws not_found: player_id=%s room_id=%s", playerID, roomID)
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	if !room.AllowsPlayer(playerID) {
		log.Printf("room_ws forbidden: player_id=%s room_id=%s", playerID, roomID)
		http.Error(w, "room access denied", http.StatusForbidden)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("room_ws upgrade_failed: player_id=%s room_id=%s err=%v", playerID, roomID, err)
		return
	}

	session := game.NewSession(playerID, playerName)
	snapshot, err := room.Connect(session)
	if err != nil {
		log.Printf("room_ws connect_failed: player_id=%s room_id=%s err=%v", playerID, roomID, err)
		_ = conn.WriteJSON(game.ServerEvent{Type: "error", Error: err.Error()})
		_ = conn.Close()
		return
	}
	log.Printf("room_ws connected: player_id=%s room_id=%s phase=%s", playerID, roomID, snapshot.Phase)

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
			log.Printf("room_ws read_closed: player_id=%s room_id=%s err=%v", playerID, roomID, err)
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
				log.Printf("room_ws player_ready_failed: player_id=%s room_id=%s ready=%t err=%v", playerID, roomID, ready, err)
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			} else {
				log.Printf("room_ws player_ready: player_id=%s room_id=%s ready=%t", playerID, roomID, ready)
			}
		case "input_char":
			var payload game.InputCharPayload
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				log.Printf("room_ws input_char_payload_invalid: player_id=%s room_id=%s err=%v", playerID, roomID, err)
				pushEvent(session, game.ServerEvent{Type: "error", Error: "invalid input_char payload"})
				continue
			}
			if err := room.HandleInputChar(playerID, payload.Char); err != nil {
				log.Printf("room_ws input_char_failed: player_id=%s room_id=%s err=%v", playerID, roomID, err)
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			}
		case "input_backspace":
			if err := room.HandleBackspace(playerID); err != nil {
				log.Printf("room_ws input_backspace_failed: player_id=%s room_id=%s err=%v", playerID, roomID, err)
				pushEvent(session, game.ServerEvent{Type: "error", Error: err.Error()})
			}
		case "ping":
			pushEvent(session, game.ServerEvent{Type: "pong"})
		default:
			log.Printf("room_ws unsupported_event: player_id=%s room_id=%s type=%q", playerID, roomID, event.Type)
			pushEvent(session, game.ServerEvent{Type: "error", Error: "unsupported event type"})
		}
	}

	log.Printf("room_ws disconnecting: player_id=%s room_id=%s", playerID, roomID)
	room.Disconnect(playerID)
	close(session.Send)
	<-done
	log.Printf("room_ws disconnected: player_id=%s room_id=%s", playerID, roomID)
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
				log.Printf("room_ws write_failed: event_type=%s err=%v", event.Type, err)
				return
			}
		case <-pingTicker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				log.Printf("room_ws ping_failed: err=%v", err)
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
