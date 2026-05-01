# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Focus Ecosystem** is a productivity app with a Node.js/Express backend and a React Native (Expo) frontend. Users start timed focus sessions, block distracting apps, and scan NFC tags to verify physical presence. Analytics and AI insights track productivity over time.

## Commands

### Backend (`backend/`)
```bash
npm run dev     # nodemon server.js — auto-reload dev server
npm start       # node server.js — production
```

### Frontend (`frontend/`)
```bash
npx expo start            # opens Expo dev tools
npx expo start --android  # Android emulator
npx expo start --ios      # iOS simulator
npx expo start --web      # web preview
```

There are no tests in this project.

## Architecture

### Backend
`server.js` is the entry point. It connects to MongoDB and mounts four route groups:

| Prefix | File | Auth |
|---|---|---|
| `/api/auth` | `routes/auth.js` | None |
| `/api/user` | `routes/user.js` | Required |
| `/api/sessions` | `routes/sessions.js` | Required |
| `/api/analytics` | `routes/analytics.js` | Required |

Auth middleware (`middleware/auth.js`) verifies the Bearer JWT and attaches `req.user` (without `passwordHash`) to the request.

The backend uses **ES modules** (`"type": "module"` in `backend/package.json`). Use `import`/`export`, not `require`.

### Frontend
`App.tsx` is both the state container and the router. It holds all global state (`token`, `user`, `sessions`) and manages navigation via a `current: ScreenName` string + `navigate()` function — there is no React Navigation stack. All 12 screens receive a `NavProps` object with `{ navigate, token, setToken, sessions, user, ... }`.

The API client lives in `frontend/api/client.ts`. It exports a single `apiFetch<T>()` function that prepends the base URL and injects the `Authorization: Bearer` header. The base URL is hardcoded for Android emulator (`http://10.0.2.2:5000/api`); see comments in that file to switch for iOS or physical devices.

### Data Models

- **User** — email/passwordHash, name, nested `settings` (session type, timer mode, duration defaults, daily/weekly goals)
- **Session** — userId, type (STUDY/WORK/CUSTOM), status (PENDING→ACTIVE→COMPLETED/ABANDONED), timerMode, timerConfig/timerState, focusScore (0–100), dateStr (YYYY-MM-DD)
- **NFCTag** — global record for a physical tag UID; shared across users
- **UserTag** — join table (userId + tagId), with a user-defined label
- **FocusLog** — append-only event log per session (SESSION_STARTED, APP_BLOCKED, BREAK_STARTED, etc.)
- **Statistics** — pre-aggregated daily stats per user; rebuilt from raw sessions after any mutation via `syncStats()`
- **AIInsight** — one doc per user, written by an external ML service via `PUT /api/analytics/ai-insight`

### Key Patterns

**Statistics sync**: After any session create/end/delete, `syncStats(userId, dateStr)` recalculates the Statistics document from raw Session data. Never mutate Statistics directly.

**Focus score** (computed server-side in `routes/sessions.js` on session end):
```
ratio = min(1, actualMins / plannedMins)
pomoBon = timerMode === 'POMODORO' ? 8 : 0
penalty = min(24, distractionCount * 4)
score = min(99, max(20, round(ratio * 80) + pomoBon - penalty + 12))
```

**Date handling**: All session/stats documents use `dateStr: YYYY-MM-DD` in local time (no UTC conversion). Frontend helpers: `toDateStr()`, `daysAgo()`, `fmtHHMM()` in `frontend/store/sessions.ts`.

**Session serialization**: `Session.toFrontendRecord()` is a static method on the Mongoose model that converts DB docs to the `SessionRecord` type expected by the frontend.

**Screen navigation**: Screens are rendered by a `switch` on `current` in `App.tsx`. Screen transitions use `Animated.timing` fades (110 ms out, 180 ms in). The drawer overlay is shown on a subset of screens.

## Environment

Backend requires a `.env` file with:
```
MONGO_URI=
JWT_SECRET=
JWT_EXPIRES_IN=7d   # optional, defaults to 7d
PORT=5000           # optional, defaults to 5000
```
