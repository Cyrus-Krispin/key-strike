# key-strike monorepo

Minimal full-stack setup for a multiplayer typing game.

## Structure

- `frontend` - Next.js + TypeScript + Tailwind (App Router)
- `backend` - Go (`net/http`) API
- `docs` - project notes

## Run locally

### 1) Backend

```powershell
cd backend
go run ./cmd/server
```

Backend defaults to `http://localhost:8080`.
You can override with local-only env in `backend/.env.local`.

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.
API URL is read from local-only `frontend/.env.local`.

## API endpoints

- `GET /health`
- `GET /api/profile`
- `GET /api/matchmaking/status`
