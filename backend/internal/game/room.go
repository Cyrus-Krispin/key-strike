package game

import (
	"errors"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"
)

var sentenceBank = []string{
	"Stay steady and type with clean intent.",
	"Rhythm matters more than panic speed.",
	"Every clean keypress keeps your combo alive.",
	"Small mistakes cost momentum in this duel.",
	"Precision under pressure decides this round.",
}

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
			ID:        id,
			Name:      name,
			Ready:     false,
			Connected: false,
			Health:    maxHealth,
			Cursor:    0,
			Mistakes:  0,
			Typed:     make([]TypedEntry, 0, 64),
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
			ID:        botID,
			Name:      botName,
			Ready:     true,
			Connected: true,
			Health:    maxHealth,
			Cursor:    0,
			Mistakes:  0,
			Typed:     make([]TypedEntry, 0, 64),
		}
		r.order = append(r.order, botID)
	}

	if len(r.order) == 0 {
		panic("room requires at least one player")
	}

	r.sentence = r.pickSentenceLocked()

	go r.loop()
	return r
}

func (r *Room) ID() string {
	return r.id
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

	if player.Cursor >= len(sentenceRunes) {
		r.resolveSentenceLocked(playerID)
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

	if bot.Cursor >= len(sentenceRunes) {
		r.resolveSentenceLocked(r.botID)
	}
	return true
}

func (r *Room) resolveSentenceLocked(attackerID string) {
	attacker, ok := r.players[attackerID]
	if !ok {
		return
	}
	opponentID := r.otherPlayerIDLocked(attackerID)
	if opponentID == "" {
		return
	}
	opponent, ok := r.players[opponentID]
	if !ok {
		return
	}

	damage := calculateDamage(attacker)
	opponent.Health -= damage
	if opponent.Health < 0 {
		opponent.Health = 0
	}

	if opponent.Health == 0 {
		r.phase = PhaseEnded
		r.winner = attackerID
		return
	}

	r.sentence = r.pickSentenceLocked()
	for _, playerID := range r.order {
		p := r.players[playerID]
		p.Cursor = 0
		p.Mistakes = 0
		p.Typed = p.Typed[:0]
	}
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

func (r *Room) pickSentenceLocked() string {
	index := r.random.Intn(len(sentenceBank))
	return sentenceBank[index]
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
			Health:    player.Health,
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

func calculateDamage(attacker *PlayerState) int {
	if attacker == nil {
		return 3
	}
	correctCount := 0
	for _, entry := range attacker.Typed {
		if entry.Correct {
			correctCount++
		}
	}
	accuracy := 0.0
	if len(attacker.Typed) > 0 {
		accuracy = float64(correctCount) / float64(len(attacker.Typed))
	}

	damage := 6 + int(accuracy*6) - min(3, attacker.Mistakes/2)
	if damage < 3 {
		damage = 3
	}
	if damage > 16 {
		damage = 16
	}
	return damage
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
