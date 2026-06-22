# Contributing to Anchor

Thanks for working on Anchor. This guide covers local setup, the development
build, and how the project is run day to day.

## Repository layout

| Path | Description |
|---|---|
| `backend/` | Node.js / Express API (ES modules) + MongoDB (Mongoose) |
| `frontend/` | React Native (Expo) app with custom native modules |
| `landing/` | Marketing landing page |
| `assets/` | Shared brand and README assets |

## Prerequisites

- Node.js 18+ and npm
- A MongoDB connection string (local or Atlas)
- For iOS native features: a Mac, Xcode, an Apple Developer account, and the
  [EAS CLI](https://docs.expo.dev/eas/) (`npm i -g eas-cli`)

## Backend

```bash
cd backend
cp .env.example .env   # then fill in the values
npm install
npm run dev            # nodemon, auto-reload — or `npm start` for production
```

All environment variables are documented in [`backend/.env.example`](./backend/.env.example).
`JWT_SECRET` must be at least 32 characters and `CORS_ORIGINS` must be set, or
the server refuses to boot.

### Tests

The backend is covered by an automated [Vitest](https://vitest.dev/) suite that
runs against an in-memory MongoDB (no live database required):

```bash
cd backend
npm test
npm run test:coverage   # optional, v8 coverage
```

CI runs the suite plus an `npm audit` gate on every push (`.github/workflows/ci.yml`).

## Frontend

> **This app uses a custom dev client.** It bundles custom
> native modules (`anchor-screen-time`, NFC, Screen Time / Family Controls) that
> Expo Go cannot load. Always run against a development build.

```bash
cd frontend
npm install
npx expo start --dev-client   # daily dev: starts Metro, then scan the QR with the installed dev build
npx expo start --web          # web preview only (native modules are unavailable)
```

Point the app at your backend by setting `EXPO_PUBLIC_API_URL` in `frontend/.env`
to your machine's LAN IP (e.g. `http://192.168.1.95:5000/api`) so a physical
device can reach it over Wi-Fi. This value is baked in at bundle time — restart
Metro after changing it. Release builds use `PROD_URL` in `frontend/api/client.ts`.

The React Native app is verified manually against a development build; see
[`frontend/TESTING.md`](./frontend/TESTING.md) for the QA checklist.

### iOS development build (one-time setup)

```bash
npm i -g eas-cli
eas login
eas device:create                          # register the target iPhone's UDID
eas build -p ios --profile development      # cloud build; returns a QR/install link
```

Install the resulting build on the iPhone once. After that, daily development is
just `npx expo start --dev-client` and scanning the QR.

`app.json` is the source of truth for native configuration. The `ios/` and
`android/` folders are not committed — EAS regenerates them on the build worker
from `app.json` and config plugins (CNG). Run `npx expo prebuild` locally if you
need them.

## Deployment

The backend deploys to Render (service root `backend/`), auto-deploying from
`main`. Health check: `GET /api/health`. Environment variables live in the Render
dashboard. A free uptime monitor pings `/api/health` every 5 minutes to keep the
instance warm and the in-process notification cron running.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope,
e.g. `fix(ios): ...`, `feat(backend): ...`, `chore(landing): ...`.
