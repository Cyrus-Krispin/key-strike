# Backend Realtime Protocol (v1)

This document describes the in-memory multiplayer flow implemented in the Go backend.

## HTTP Endpoints

- `GET /health`
- `GET /api/profile`
- `GET /api/matchmaking/status?playerId=<id>`
- `POST /api/matchmaking/queue`
- `POST /api/matchmaking/cancel`
- `GET /api/rooms/{roomId}/state`
- `GET /ws/room?roomId=<id>&playerId=<id>&playerName=<name>`

## Queue Request

`POST /api/matchmaking/queue`

```json
{
  "playerId": "p1",
  "playerName": "You",
  "mode": "ranked",
  "difficulty": "medium"
}
```

`mode` supports: `ranked`, `casual`, `bot`.

## Matchmaking Status Values

- `idle`: player is not queued.
- `searching`: player is queued and waiting.
- `matched`: room is ready; connect via websocket.

## WebSocket Client Events

- `player_ready`
```json
{ "type": "player_ready", "payload": { "ready": true } }
```

- `input_char`
```json
{ "type": "input_char", "payload": { "char": "a" } }
```

- `input_backspace`
```json
{ "type": "input_backspace" }
```

- `ping`
```json
{ "type": "ping" }
```

## WebSocket Server Events

- `state_update` (authoritative room snapshot)
- `pong`
- `error`

Room phases:

- `waiting`
- `countdown`
- `active`
- `ended`
