package game

import (
	"errors"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"
)

const duelSentence = "" +
	"In this single extended duel sentence, keep your rhythm steady, recover quickly from slips, and focus on clean transitions between words because every keypress adds pressure as both racers push through the same long passage until one reaches the final character."

type Room struct {
	mu sync.Mutex

	id     string
	mode   string
	phase  Phase
	winner string

	sentence        string
	countdownEndsAt time.Time

	players  map[string]*PlayerState
	order    []string
	allowed  map[string]struct{}
	sessions map[string]*Session

	botID            string
	botTypeInterval  time.Duration
	botAccuracyBonus float64
	botNextTypeAt    time.Time

	random    *rand.Rand
	updatedAt time.Time

	stopLoop chan struct{}
	doneLoop chan struct{}
}

func NewRoom(config RoomConfig) *Room {
	now := time.Now()
	r := &Room{
		id:        config.ID,
		mode:      strings.ToLower(strings.TrimSpace(config.Mode)),
		phase:     PhaseWaiting,
		players:   make(map[string]*PlayerState, 2),
		order:     make([]string, 0, 2),
		allowed:   make(map[string]struct{}, 2),
		sessions:  make(map[string]*Session, 2),
		random:    rand.New(rand.NewSource(now.UnixNano())),
		updatedAt: now,
		stopLoop:  make(chan struct{}),
		doneLoop:  make(chan struct{}),
	}

	for _, seed := range config.Players {
		id := strings.TrimSpace(seed.ID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(seed.Name)
		if name == "" {
			name = id
		}
		r.allowed[id] = struct{}{}
		r.players[id] = &PlayerState{
			ID:            id,
			Name:          name,
			Ready:         false,
			Connected:     false,
			Cursor:        0,
			WordLockStart: 0,
			Mistakes:      0,
			Typed:         make([]TypedEntry, 0, 64),
		}
		r.order = append(r.order, id)
	}

	if config.Bot != nil {
		botID := strings.TrimSpace(config.Bot.ID)
		if botID == "" {
			botID = "bot"
		}
		botName := strings.TrimSpace(config.Bot.Name)
		if botName == "" {
			botName = "Bot"
		}
		r.botID = botID
		r.botTypeInterval = config.Bot.TypeInterval
		if r.botTypeInterval <= 0 {
			r.botTypeInterval = 280 * time.Millisecond
		}
		r.botAccuracyBonus = config.Bot.AccuracyBonus

		r.allowed[botID] = struct{}{}
		r.players[botID] = &PlayerState{
			ID:            botID,
			Name:          botName,
			Ready:         true,
			Connected:     true,
			Cursor:        0,
			WordLockStart: 0,
			Mistakes:      0,
			Typed:         make([]TypedEntry, 0, 64),
		}
		r.order = append(r.order, botID)
	}

	if len(r.order) == 0 {
		panic("room requires at least one player")
	}

	r.sentence = duelSentence

	go r.loop()
	return r
}

func (r *Room) ID() string {
	return r.id
}

func (r *Room) AllowsPlayer(playerID string) bool {
	id := strings.TrimSpace(playerID)
	if id == "" {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.allowed[id]
	return ok
}

func (r *Room) Snapshot() RoomSnapshot {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.snapshotLocked(time.Now())
}

func (r *Room) Connect(session *Session) (RoomSnapshot, error) {
	if session == nil {
		return RoomSnapshot{}, errors.New("session is required")
	}
	playerID := strings.TrimSpace(session.PlayerID)
	if playerID == "" {
		return RoomSnapshot{}, errors.New("playerId is required")
	}

	r.mu.Lock()
	if _, allowed := r.allowed[playerID]; !allowed {
		r.mu.Unlock()
		return RoomSnapshot{}, errors.New("player not allowed in room")
	}

	player, ok := r.players[playerID]
	if !ok {
		r.mu.Unlock()
		return RoomSnapshot{}, errors.New("player state not found")
	}

	player.Connected = true
	name := strings.TrimSpace(session.PlayerName)
	if name != "" {
		player.Name = name
	}
	r.sessions[playerID] = session
	r.updatedAt = time.Now()

	snapshot := r.snapshotLocked(r.updatedAt)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
	return snapshot, nil
}

func (r *Room) Disconnect(playerID string) {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return
	}

	r.mu.Lock()
	delete(r.sessions, playerID)

	player, ok := r.players[playerID]
	if !ok {
		r.mu.Unlock()
		return
	}
	if playerID != r.botID {
		player.Connected = false
		player.Ready = false
	}

	if r.phase == PhaseCountdown && !r.canStartCountdownLocked() {
		r.phase = PhaseWaiting
		r.countdownEndsAt = time.Time{}
	}

	r.updatedAt = time.Now()
	snapshot := r.snapshotLocked(r.updatedAt)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
}

func (r *Room) SetReady(playerID string, ready bool) error {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return errors.New("playerId is required")
	}

	r.mu.Lock()
	player, ok := r.players[playerID]
	if !ok {
		r.mu.Unlock()
		return errors.New("player not found")
	}
	if playerID == r.botID {
		r.mu.Unlock()
		return errors.New("bot readiness is managed by server")
	}
	if r.phase == PhaseEnded {
		r.mu.Unlock()
		return errors.New("match already ended")
	}
	if !player.Connected {
		r.mu.Unlock()
		return errors.New("player is not connected")
	}

	player.Ready = ready
	if r.phase == PhaseWaiting && r.canStartCountdownLocked() {
		r.phase = PhaseCountdown
		r.countdownEndsAt = time.Now().Add(countdownDuration)
	}
	if r.phase == PhaseCountdown && !r.canStartCountdownLocked() {
		r.phase = PhaseWaiting
		r.countdownEndsAt = time.Time{}
	}

	r.updatedAt = time.Now()
	snapshot := r.snapshotLocked(r.updatedAt)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
	return nil
}

func (r *Room) HandleInputChar(playerID, char string) error {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return errors.New("playerId is required")
	}

	typedRunes := []rune(char)
	if len(typedRunes) == 0 {
		return errors.New("char is required")
	}
	typedRune := typedRunes[0]

	r.mu.Lock()
	player, ok := r.players[playerID]
	if !ok {
		r.mu.Unlock()
		return errors.New("player not found")
	}
	if playerID == r.botID {
		r.mu.Unlock()
		return errors.New("bot input is server-managed")
	}
	if r.phase != PhaseActive {
		r.mu.Unlock()
		return errors.New("match is not active")
	}

	sentenceRunes := []rune(r.sentence)
	if player.Cursor >= len(sentenceRunes) {
		r.mu.Unlock()
		return nil
	}

	if typedRune == ' ' {
		r.applySpaceJumpLocked(player, sentenceRunes)
	} else {
		expectedRune := sentenceRunes[player.Cursor]
		correct := strings.EqualFold(string(expectedRune), string(typedRune))

		player.Typed = append(player.Typed, TypedEntry{
			Char:    string(typedRune),
			Correct: correct,
		})
		player.Cursor++
		if !correct {
			player.Mistakes++
		}
		player.WordLockStart = wordStartForCursor(sentenceRunes, player.Cursor)
	}

	if player.Cursor >= len(sentenceRunes) {
		r.finishRaceLocked(playerID, len(sentenceRunes))
	}

	r.updatedAt = time.Now()
	snapshot := r.snapshotLocked(r.updatedAt)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
	return nil
}

func (r *Room) HandleBackspace(playerID string) error {
	playerID = strings.TrimSpace(playerID)
	if playerID == "" {
		return errors.New("playerId is required")
	}

	r.mu.Lock()
	player, ok := r.players[playerID]
	if !ok {
		r.mu.Unlock()
		return errors.New("player not found")
	}
	if playerID == r.botID {
		r.mu.Unlock()
		return errors.New("bot input is server-managed")
	}
	if r.phase != PhaseActive {
		r.mu.Unlock()
		return errors.New("match is not active")
	}
	if player.Cursor <= 0 || len(player.Typed) == 0 {
		r.mu.Unlock()
		return nil
	}
	if player.Cursor <= player.WordLockStart {
		r.mu.Unlock()
		return nil
	}

	last := player.Typed[len(player.Typed)-1]
	player.Typed = player.Typed[:len(player.Typed)-1]
	player.Cursor--
	if !last.Correct && player.Mistakes > 0 {
		player.Mistakes--
	}

	r.updatedAt = time.Now()
	snapshot := r.snapshotLocked(r.updatedAt)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
	return nil
}

func (r *Room) Close() {
	close(r.stopLoop)
	<-r.doneLoop
}

func (r *Room) loop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer func() {
		ticker.Stop()
		close(r.doneLoop)
	}()

	for {
		select {
		case <-ticker.C:
			r.tick()
		case <-r.stopLoop:
			return
		}
	}
}

func (r *Room) tick() {
	now := time.Now()

	r.mu.Lock()
	changed := false

	if r.phase == PhaseCountdown && !r.countdownEndsAt.IsZero() && now.After(r.countdownEndsAt) {
		r.phase = PhaseActive
		r.countdownEndsAt = time.Time{}
		if r.botID != "" {
			r.botNextTypeAt = now.Add(r.botTypeInterval)
		}
		changed = true
	}

	if r.phase == PhaseActive && r.botID != "" && !r.botNextTypeAt.IsZero() && !now.Before(r.botNextTypeAt) {
		if r.applyBotInputLocked() {
			changed = true
		}
		r.botNextTypeAt = now.Add(r.botTypeInterval)
	}

	if !changed {
		r.mu.Unlock()
		return
	}

	r.updatedAt = now
	snapshot := r.snapshotLocked(now)
	sessions := r.sessionListLocked()
	r.mu.Unlock()

	broadcast(sessions, ServerEvent{Type: "state_update", Payload: snapshot})
}

func (r *Room) applyBotInputLocked() bool {
	bot, ok := r.players[r.botID]
	if !ok || r.phase != PhaseActive {
		return false
	}

	sentenceRunes := []rune(r.sentence)
	if bot.Cursor >= len(sentenceRunes) {
		return false
	}

	expectedRune := sentenceRunes[bot.Cursor]
	successChance := 0.9 + r.botAccuracyBonus
	if expectedRune == ' ' {
		successChance += 0.08
	}
	if successChance > 0.98 {
		successChance = 0.98
	}
	if successChance < 0.55 {
		successChance = 0.55
	}

	correct := r.random.Float64() <= successChance
	typedRune := expectedRune
	if !correct {
		typedRune = randomWrongRune(expectedRune, r.random)
	}

	bot.Typed = append(bot.Typed, TypedEntry{
		Char:    string(typedRune),
		Correct: correct,
	})
	bot.Cursor++
	if !correct {
		bot.Mistakes++
	}
	bot.WordLockStart = wordStartForCursor(sentenceRunes, bot.Cursor)

	if bot.Cursor >= len(sentenceRunes) {
		r.finishRaceLocked(r.botID, len(sentenceRunes))
	}
	return true
}

func (r *Room) finishRaceLocked(playerID string, sentenceLen int) {
	if r.phase != PhaseActive {
		return
	}
	player, ok := r.players[playerID]
	if !ok || player.Cursor < sentenceLen {
		return
	}

	opponentID := r.otherPlayerIDLocked(playerID)
	if opponentID == "" {
		r.phase = PhaseEnded
		r.winner = playerID
		return
	}
	opponent := r.players[opponentID]

	r.phase = PhaseEnded
	if opponent != nil && opponent.Cursor >= sentenceLen {
		r.winner = ""
		return
	}
	r.winner = playerID
}

func (r *Room) applySpaceJumpLocked(player *PlayerState, sentenceRunes []rune) {
	if player == nil {
		return
	}
	if player.Cursor >= len(sentenceRunes) {
		return
	}

	start := player.Cursor
	target := nextWordStartIndex(sentenceRunes, start)
	if target <= start {
		target = minInt(start+1, len(sentenceRunes))
	}

	for idx := start; idx < target; idx++ {
		expectedRune := sentenceRunes[idx]
		correct := expectedRune == ' '
		player.Typed = append(player.Typed, TypedEntry{
			Char:    " ",
			Correct: correct,
		})
		if !correct {
			player.Mistakes++
		}
	}

	player.Cursor = target
	player.WordLockStart = wordStartForCursor(sentenceRunes, player.Cursor)
}

func (r *Room) canStartCountdownLocked() bool {
	if len(r.players) == 0 {
		return false
	}
	for playerID, player := range r.players {
		if playerID == r.botID {
			continue
		}
		if !player.Connected || !player.Ready {
			return false
		}
	}
	return true
}

func (r *Room) otherPlayerIDLocked(playerID string) string {
	for _, id := range r.order {
		if id != playerID {
			return id
		}
	}
	return ""
}

func nextWordStartIndex(sentence []rune, cursor int) int {
	if cursor < 0 {
		cursor = 0
	}
	if cursor >= len(sentence) {
		return len(sentence)
	}

	idx := cursor
	for idx < len(sentence) && sentence[idx] != ' ' {
		idx++
	}
	for idx < len(sentence) && sentence[idx] == ' ' {
		idx++
	}
	return idx
}

func wordStartForCursor(sentence []rune, cursor int) int {
	if len(sentence) == 0 || cursor <= 0 {
		return 0
	}
	if cursor > len(sentence) {
		cursor = len(sentence)
	}

	if sentence[cursor-1] == ' ' {
		return cursor
	}

	start := cursor - 1
	for start >= 0 && sentence[start] != ' ' {
		start--
	}
	return start + 1
}

func (r *Room) snapshotLocked(now time.Time) RoomSnapshot {
	countdownRemain := 0
	if r.phase == PhaseCountdown && !r.countdownEndsAt.IsZero() {
		countdownRemain = int(math.Ceil(r.countdownEndsAt.Sub(now).Seconds()))
		if countdownRemain < 0 {
			countdownRemain = 0
		}
	}

	players := make([]PlayerSnapshot, 0, len(r.order))
	for _, playerID := range r.order {
		player := r.players[playerID]
		typed := make([]TypedEntry, len(player.Typed))
		copy(typed, player.Typed)

		players = append(players, PlayerSnapshot{
			ID:        player.ID,
			Name:      player.Name,
			Ready:     player.Ready,
			Connected: player.Connected,
			Cursor:    player.Cursor,
			Mistakes:  player.Mistakes,
			Typed:     typed,
		})
	}

	return RoomSnapshot{
		RoomID:                 r.id,
		Mode:                   r.mode,
		Phase:                  r.phase,
		Sentence:               r.sentence,
		WinnerPlayerID:         r.winner,
		CountdownSecondsRemain: countdownRemain,
		Players:                players,
		UpdatedAtMs:            r.updatedAt.UnixMilli(),
	}
}

func (r *Room) sessionListLocked() []*Session {
	sessions := make([]*Session, 0, len(r.sessions))
	for _, session := range r.sessions {
		sessions = append(sessions, session)
	}
	return sessions
}

func broadcast(sessions []*Session, event ServerEvent) {
	for _, session := range sessions {
		select {
		case session.Send <- event:
		default:
			// Drop when the client channel is full to keep the room loop responsive.
		}
	}
}

func randomWrongRune(expected rune, random *rand.Rand) rune {
	pool := []rune("abcdefghijklmnopqrstuvwxyz")
	if len(pool) == 0 {
		return expected
	}
	candidate := pool[random.Intn(len(pool))]
	if strings.EqualFold(string(candidate), string(expected)) {
		candidate = pool[(random.Intn(len(pool)-1)+1)%len(pool)]
	}
	return candidate
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
