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

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

Set API URL:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:8080"
```

## API endpoints

- `GET /health`
- `GET /api/profile`
- `GET /api/matchmaking/status`
