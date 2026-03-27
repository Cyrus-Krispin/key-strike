package game

import (
	"errors"
	"fmt"
	"math/rand"
	"net/url"
	"strings"
	"sync"
	"time"
)

type QueueRequest struct {
	PlayerID   string
	PlayerName string
	Mode       string
	Difficulty string
}

type QueueResponse struct {
	Status    string       `json:"status"`
	Mode      string       `json:"mode,omitempty"`
	RoomID    string       `json:"roomId,omitempty"`
	QueueSize int          `json:"queueSize,omitempty"`
	Opponent  *QueuePlayer `json:"opponent,omitempty"`
	WSPath    string       `json:"wsPath,omitempty"`
}

type StatusResponse struct {
	Status    string `json:"status"`
	Mode      string `json:"mode,omitempty"`
	RoomID    string `json:"roomId,omitempty"`
	QueueSize int    `json:"queueSize,omitempty"`
	Position  int    `json:"position,omitempty"`
	WSPath    string `json:"wsPath,omitempty"`
	Phase     Phase  `json:"phase,omitempty"`
}

type QueuePlayer struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type queueTicket struct {
	PlayerID   string
	PlayerName string
	Mode       string
	EnqueuedAt time.Time
}

type Manager struct {
	mu sync.RWMutex

	rooms map[string]*Room
	queue map[string][]queueTicket

	assignments map[string]string
	random      *rand.Rand
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
		queue: map[string][]queueTicket{
			"ranked": {},
			"casual": {},
		},
		assignments: make(map[string]string),
		random:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (m *Manager) Queue(req QueueRequest) (QueueResponse, error) {
	playerID := strings.TrimSpace(req.PlayerID)
	if playerID == "" {
		return QueueResponse{}, errors.New("playerId is required")
	}

	playerName := strings.TrimSpace(req.PlayerName)
	if playerName == "" {
		playerName = playerID
	}

	mode := normalizeMode(req.Mode)
	difficulty := normalizeDifficulty(req.Difficulty)

	m.mu.Lock()
	defer m.mu.Unlock()

	if assignedRoomID, ok := m.assignments[playerID]; ok {
		room := m.rooms[assignedRoomID]
		if room == nil {
			delete(m.assignments, playerID)
		} else {
			snapshot := room.Snapshot()

			// Bot requests should always create a brand-new room. We also clear stale
			// or mode-mismatched assignments so queueing starts fresh.
			shouldReuse := snapshot.Phase != PhaseEnded && snapshot.Mode == mode && mode != "bot"
			if shouldReuse {
				opponent := findOpponent(snapshot, playerID)
				return QueueResponse{
					Status:   "matched",
					Mode:     snapshot.Mode,
					RoomID:   snapshot.RoomID,
					Opponent: opponent,
					WSPath:   buildWSPath(snapshot.RoomID, playerID),
				}, nil
			}

			delete(m.assignments, playerID)
			if snapshot.Mode == "bot" {
				room.Close()
				delete(m.rooms, assignedRoomID)
			}
		}
	}

	m.removeFromQueueLocked(playerID)

	if mode == "bot" {
		roomID := m.newRoomIDLocked(mode)
		botID := "bot-" + roomID[len(roomID)-5:]

		botConfig := &BotConfig{
			ID:            botID,
			Name:          botName(difficulty),
			TypeInterval:  botTypeInterval(difficulty),
			AccuracyBonus: botAccuracyBonus(difficulty),
		}

		room := NewRoom(RoomConfig{
			ID:   roomID,
			Mode: mode,
			Players: []PlayerSeed{
				{ID: playerID, Name: playerName},
			},
			Bot: botConfig,
		})
		m.rooms[roomID] = room
		m.assignments[playerID] = roomID

		snapshot := room.Snapshot()
		return QueueResponse{
			Status:   "matched",
			Mode:     snapshot.Mode,
			RoomID:   snapshot.RoomID,
			Opponent: findOpponent(snapshot, playerID),
			WSPath:   buildWSPath(snapshot.RoomID, playerID),
		}, nil
	}

	opponentIndex := -1
	for i, ticket := range m.queue[mode] {
		if ticket.PlayerID != playerID {
			opponentIndex = i
			break
		}
	}

	if opponentIndex >= 0 {
		opponentTicket := m.queue[mode][opponentIndex]
		m.queue[mode] = append(m.queue[mode][:opponentIndex], m.queue[mode][opponentIndex+1:]...)

		roomID := m.newRoomIDLocked(mode)
		room := NewRoom(RoomConfig{
			ID:   roomID,
			Mode: mode,
			Players: []PlayerSeed{
				{ID: opponentTicket.PlayerID, Name: opponentTicket.PlayerName},
				{ID: playerID, Name: playerName},
			},
		})
		m.rooms[roomID] = room
		m.assignments[playerID] = roomID
		m.assignments[opponentTicket.PlayerID] = roomID

		return QueueResponse{
			Status: "matched",
			Mode:   mode,
			RoomID: roomID,
			Opponent: &QueuePlayer{
				ID:   opponentTicket.PlayerID,
				Name: opponentTicket.PlayerName,
			},
			WSPath: buildWSPath(roomID, playerID),
		}, nil
	}

	m.queue[mode] = append(m.queue[mode], queueTicket{
		PlayerID:   playerID,
		PlayerName: playerName,
		Mode:       mode,
		EnqueuedAt: time.Now(),
	})

	return QueueResponse{
		Status:    "searching",
		Mode:      mode,
		QueueSize: len(m.queue[mode]),
	}, nil
}

func (m *Manager) Status(playerID string) StatusResponse {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return StatusResponse{Status: "idle"}
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	if roomID, ok := m.assignments[playerID]; ok {
		if room := m.rooms[roomID]; room != nil {
			snapshot := room.Snapshot()
			return StatusResponse{
				Status: "matched",
				Mode:   snapshot.Mode,
				RoomID: roomID,
				WSPath: buildWSPath(roomID, playerID),
				Phase:  snapshot.Phase,
			}
		}
	}

	for mode, tickets := range m.queue {
		for idx, ticket := range tickets {
			if ticket.PlayerID == playerID {
				return StatusResponse{
					Status:    "searching",
					Mode:      mode,
					QueueSize: len(tickets),
					Position:  idx + 1,
				}
			}
		}
	}

	return StatusResponse{Status: "idle"}
}

func (m *Manager) Cancel(playerID string) bool {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return false
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	return m.removeFromQueueLocked(playerID)
}

func (m *Manager) GetRoom(roomID string) (*Room, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	room, ok := m.rooms[strings.TrimSpace(roomID)]
	return room, ok
}

func (m *Manager) RoomSnapshot(roomID string) (RoomSnapshot, bool) {
	room, ok := m.GetRoom(roomID)
	if !ok {
		return RoomSnapshot{}, false
	}
	return room.Snapshot(), true
}

func (m *Manager) QueueDepth() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total := 0
	for _, tickets := range m.queue {
		total += len(tickets)
	}
	return total
}

func (m *Manager) removeFromQueueLocked(playerID string) bool {
	removed := false
	for mode, tickets := range m.queue {
		filtered := tickets[:0]
		for _, ticket := range tickets {
			if ticket.PlayerID == playerID {
				removed = true
				continue
			}
			filtered = append(filtered, ticket)
		}
		m.queue[mode] = filtered
	}
	return removed
}

func (m *Manager) newRoomIDLocked(mode string) string {
	suffix := fmt.Sprintf("%05x", m.random.Int31n(0xFFFFF))
	return fmt.Sprintf("%s-%s-%s", mode, strconvBase36(time.Now().UnixMilli()), suffix)
}

func buildWSPath(roomID, playerID string) string {
	return fmt.Sprintf("/ws/room?roomId=%s&playerId=%s", url.QueryEscape(roomID), url.QueryEscape(playerID))
}

func findOpponent(snapshot RoomSnapshot, playerID string) *QueuePlayer {
	for _, player := range snapshot.Players {
		if player.ID == playerID {
			continue
		}
		return &QueuePlayer{
			ID:   player.ID,
			Name: player.Name,
		}
	}
	return nil
}

func normalizeMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "ranked":
		return "ranked"
	case "bot":
		return "bot"
	default:
		return "casual"
	}
}

func normalizeDifficulty(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "easy":
		return "easy"
	case "hard":
		return "hard"
	default:
		return "medium"
	}
}

func botName(difficulty string) string {
	switch difficulty {
	case "easy":
		return "Bot Easy"
	case "hard":
		return "Bot Hard"
	default:
		return "Bot Medium"
	}
}

func botTypeInterval(difficulty string) time.Duration {
	switch difficulty {
	case "easy":
		return 360 * time.Millisecond
	case "hard":
		return 210 * time.Millisecond
	default:
		return 280 * time.Millisecond
	}
}

func botAccuracyBonus(difficulty string) float64 {
	switch difficulty {
	case "easy":
		return -0.08
	case "hard":
		return 0.05
	default:
		return 0
	}
}

func strconvBase36(value int64) string {
	const charset = "0123456789abcdefghijklmnopqrstuvwxyz"
	if value == 0 {
		return "0"
	}

	n := value
	if n < 0 {
		n = -n
	}

	buf := make([]byte, 0, 12)
	for n > 0 {
		buf = append(buf, charset[n%36])
		n /= 36
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}
