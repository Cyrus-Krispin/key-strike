package game

import (
	"encoding/json"
	"time"
)

type Phase string

const (
	PhaseWaiting   Phase = "waiting"
	PhaseCountdown Phase = "countdown"
	PhaseActive    Phase = "active"
	PhaseEnded     Phase = "ended"
)

const (
	countdownDuration = 3 * time.Second
)

type ClientEvent struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type ServerEvent struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
	Error   string `json:"error,omitempty"`
}

type ReadyPayload struct {
	Ready bool `json:"ready"`
}

type InputCharPayload struct {
	Char string `json:"char"`
}

type TypedEntry struct {
	Char    string `json:"char"`
	Correct bool   `json:"correct"`
}

type PlayerState struct {
	ID            string
	Name          string
	Ready         bool
	Connected     bool
	Cursor        int
	WordLockStart int
	Mistakes      int
	Typed         []TypedEntry
}

type PlayerSnapshot struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Ready     bool         `json:"ready"`
	Connected bool         `json:"connected"`
	Cursor    int          `json:"cursor"`
	Mistakes  int          `json:"mistakes"`
	Typed     []TypedEntry `json:"typed"`
}

type RoomSnapshot struct {
	RoomID                 string           `json:"roomId"`
	Mode                   string           `json:"mode"`
	Phase                  Phase            `json:"phase"`
	Sentence               string           `json:"sentence"`
	WinnerPlayerID         string           `json:"winnerPlayerId,omitempty"`
	CountdownSecondsRemain int              `json:"countdownSecondsRemain"`
	Players                []PlayerSnapshot `json:"players"`
	UpdatedAtMs            int64            `json:"updatedAtMs"`
}

type PlayerSeed struct {
	ID   string
	Name string
}

type BotConfig struct {
	ID            string
	Name          string
	TypeInterval  time.Duration
	AccuracyBonus float64
}

type RoomConfig struct {
	ID      string
	Mode    string
	Players []PlayerSeed
	Bot     *BotConfig
}

type Session struct {
	PlayerID   string
	PlayerName string
	Send       chan ServerEvent
}

func NewSession(playerID, playerName string) *Session {
	return &Session{
		PlayerID:   playerID,
		PlayerName: playerName,
		Send:       make(chan ServerEvent, 64),
	}
}
