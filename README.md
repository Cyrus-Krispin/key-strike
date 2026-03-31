# key-strike monorepo

Minimal full-stack setup for a multiplayer typing game.

## Structure

- `frontend` - Next.js + TypeScript + Tailwind (App Router)
- `backend` - Go (`net/http`) API
- `docs` - project notes

## Run locally

### 0) Clerk setup

1. Create a Clerk application in your Clerk dashboard.
2. Copy:
   - Frontend publishable key: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Backend secret key: `CLERK_SECRET_KEY`
3. Set authorized parties to your frontend origin (for local dev: `http://localhost:3000`).

### 1) Backend

```powershell
cd backend
go run ./cmd/server
```

Backend defaults to `http://localhost:8080`.
You can override with local-only env in `backend/.env.local`.
Required auth env:

- `CLERK_SECRET_KEY`
- `CLERK_AUTHORIZED_PARTIES` (comma-separated origins, e.g. `http://localhost:3000`)

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.
API URL is read from local-only `frontend/.env.local`.
Required auth env:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

## API endpoints

- `GET /health`
- `GET /api/profile` (auth required)
- `GET /api/matchmaking/status` (auth required)
- `POST /api/matchmaking/queue` (auth required)
- `POST /api/matchmaking/cancel` (auth required)
- `GET /api/rooms/{roomId}/state` (auth required)
- `GET /ws/room` (auth required via `token` query param)
