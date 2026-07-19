# AI-Driven Energy Supply Chain Resilience — Foundation

MERN + TypeScript foundation for the hackathon project. This is the **blocking foundation phase**:
auth (Firebase email/password) + an empty dashboard shell with placeholder cards for all 6 agents.
Once this is merged, the 4-person layer split (Data / Core Logic / API / Frontend) can start in parallel.

```
energy-scr-platform/
├── backend/     Express + TypeScript + MongoDB (Mongoose) + Firebase Admin (token verification)
└── frontend/    React + TypeScript + Vite + Tailwind + Firebase Auth (client)
```

## Quick start

### 1. Firebase setup (5 min)
1. Go to https://console.firebase.google.com → Create project
2. Build → Authentication → Get Started → Sign-in method → enable **Email/Password**
3. Project settings (gear icon) → General → scroll to "Your apps" → Add app → Web → copy the config object
4. Project settings → Service accounts → Generate new private key → downloads a JSON file (backend needs this)

### 2. Backend
```bash
cd backend
cp .env.example .env
# paste your MongoDB URI and Firebase service account values into .env
npm install
python -m pip install -r requirements.txt
npm run dev
```
Runs on `http://localhost:5000`.

GRIA's local Gemma worker uses `llama-cpp-python`. If it is installed in a virtual environment,
set `PYTHON_BIN` in `backend/.env` to that environment's Python executable.

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# paste your Firebase web config values into .env
npm install
npm run dev
```
Runs on `http://localhost:5173`.

### 4. MongoDB
Use a free MongoDB Atlas cluster (fastest for a hackathon) — create a cluster, add your IP to the
network access list, grab the connection string, and put it in `backend/.env` as `MONGO_URI`.

## What's built right now (foundation phase)
- Landing page (`/`) — project pitch, redirects logged-in users straight to `/dashboard`
- Auth page (`/auth`) — login + signup toggle, Firebase email/password only, no OAuth
- Dashboard (`/dashboard`) — protected route, empty shell with 6 placeholder module cards:
  GRIA, DSM, APO, SROA, SCDT, TFM
- Backend — Express server, MongoDB connection, a `User` model, a `/api/auth/sync` route that
  verifies the Firebase ID token and upserts the user into MongoDB on first login

## What's intentionally NOT built yet
No module logic (GRIA/DSM/APO/SROA/SCDT/TFM), no Google/OAuth login, no real data. That's the
next phase, split across the 4-layer structure (Data / Core Logic / API / Frontend) discussed
separately so all 4 of you can work without blocking each other.

## Handing this off to the team
- `frontend/src/pages/Dashboard.tsx` — the 6 `ModuleCard` placeholders are where each module's
  UI eventually mounts. Don't change the grid/shell, just build inside a card.
- `backend/src/routes/` — add one router file per module (e.g. `griaRoutes.ts`), mount it in
  `server.ts`. Don't touch `authRoutes.ts`.
- `backend/src/models/` — add one Mongoose model per module's data shape.
- Agree on the `/contracts` JSON shape for each module **before** writing logic, so frontend and
  backend can build against mocks in parallel.
