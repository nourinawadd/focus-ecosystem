# Anchor — Current State (as of 2026-06-09)

Productivity app: timed focus sessions, distraction-app blocking, NFC presence
verification, and AI insights. Node/Express + MongoDB backend, React Native
(Expo, custom dev client) frontend, Gemini for AI.

---

## Backend — what works

**Auth & accounts**
- Register / login (bcrypt, cost 12), with timing-attack-safe login and
  rate limiting (`/login` 5/min, `/register` 10/hr).
- JWT **access tokens (1h)** + **refresh tokens (30d)** with rotation,
  reuse-detection (burns the chain), and `/auth/logout` revocation.
  Refresh tokens stored hashed (HMAC) in the `RefreshToken` model.
- **Google & Apple social sign-in** (`/auth/google`, `/auth/apple`):
  provider token verified against JWKS, then linked by provider id or
  verified email, else a passwordless account is created.
- Login/register responses return only `{ id, name, email, settings }`.

**Sessions & stats**
- Create / end / log-event / delete. Focus score computed **server-side**
  only (client values ignored); session end is **atomic** (guarded
  `findOneAndUpdate` so racing ends can't double-count).
- Input validation/bounds on all session + settings fields.
- `syncStats()` rebuilds per-day `Statistics` after every mutation.
- **Streaks**: `Statistics.computeStreak()` walks back day-by-day (O(streak),
  not O(all sessions)) with an **until-midnight grace period** (an idle/
  abandoned-only "today" doesn't reset a live streak).
- **Timezone-aware**: `User.settings.timezone` (IANA, default UTC) drives all
  server-side hour-of-day / "today" math (analytics best hour, streaks,
  `mostProductiveHour`).
- Analytics `summary` (day/week/month) — totals, completion rate, best hour,
  health score, streaks, and **completed-only** bar data (consistent with
  `totalFocusMinutes`). Raw `statistics` endpoint for ML/history.

**Tasks**
- `GET/POST/DELETE /api/tasks` (name + priority). Feed the AI scheduler.

**Hardening / ops**
- Phase 1 security: `helmet`, CORS allowlist (`CORS_ORIGINS`), `express.json`
  100kb limit, `trust proxy`, fail-fast env assertion (JWT secret length etc).
- Phase 3 robustness: `asyncHandler`, manual `validate` helpers, graceful
  shutdown, Mongo pool/timeout options, `/api/health` readiness ping.
- Phase 5 observability: **pino + pino-http** structured logging (JSON in prod,
  pretty in dev, secrets redacted).
- `config/db.js` owns the Mongo connection (no dead code).

**Tests & CI**
- **Vitest + supertest + mongodb-memory-server** (in-memory, no live DB).
  Suites: auth, sessions (+focus-score edge cases), analytics, accounts
  (social, mocked), ai (mocked Gemini), tasks, user/NFC, datetime.
- CI (`.github/workflows/ci.yml`): `npm audit` gate + full test job with
  cached mongod binary; v8 coverage available via `npm run test:coverage`.

---

## Frontend — what works

- 14 screens routed through the `App.tsx` `switch` (no React Navigation):
  Dashboard, CreateSession, ActiveSession, SessionComplete, Analytics,
  AIInsights, History, NFC, NFCSetup, Settings, Profile, Login, SignUp,
  ComingSoon.
- `api/client.ts`: stores **access + refresh tokens** (AsyncStorage),
  refresh-on-401 with single-flight, logout revokes server-side.
- Native **Google & Apple sign-in** wired on Login/SignUp.
- **Session timer is wall-clock anchored** — backgrounding no longer pauses
  it; on return it reflects real elapsed time. **Pomodoro multi-phase
  catch-up** lands on the correct phase/round/remaining after a long absence.
- **NFC**: scan to register a tag (NFCSetup) and tap-to-end a session.
- **Screen Time app blocking (iOS)** via the local `anchor-screen-time` Expo
  module (Family Controls + ManagedSettings): authorization, app picker,
  `applyShield`/`clearShield` wired into the ActiveSession lifecycle.
  No-ops on Android/web.

---

## AI — what works

- Gemini via `@google/generative-ai` (legacy SDK **0.21.0**).
- **Insights** (`aiInsightsService`): builds a 30-day profile (hourly/weekday
  activity, scores, distractions) + tasks → prompt → `generateJSON` with a
  response schema → `validateAndClamp` → cached in `AIInsight` (6h, min 3
  completed sessions). Endpoints: `POST /api/ai/insights/generate`,
  `GET /api/ai/insights`.
- **Suggestion** (`aiSuggestionService`): lightweight dashboard tip, cached,
  invalidated on session mutation. `GET /api/ai/suggestion`.
- AI generation is **owned server-side** — the old external-writer
  `PUT /api/analytics/ai-insight` was removed.
- Recent hardening: `maxOutputTokens` 2048 + `finishReason`-aware errors so
  truncation is diagnosable instead of a generic 502.

---

## In flight / known issues

- **Gemini model**: `.env` currently sets `GEMINI_MODEL=gemini-2.5-flash`, a
  *thinking* model whose hidden reasoning eats the output budget and truncates
  the JSON → `BAD_JSON`/502. **Action: set `GEMINI_MODEL=gemini-2.0-flash`**
  (the legacy SDK can't cap thinking). Optional: migrate to `@google/genai`
  for `thinkingConfig`.
- **Custom block screen (shield UI)**: not built. iOS only allows a templated
  `ShieldConfiguration` extension (icon/title/subtitle/2 buttons), not a full
  RN screen, and it needs an App Group to show live session details. Discussed,
  not scaffolded.
- **Refresh-token storage**: still AsyncStorage (plaintext). Phase 7 calls for
  moving it to `expo-secure-store`.
- **Family Controls Distribution entitlement**: dev works; App Store/TestFlight
  distribution still gated on Apple approval of the entitlement.

---

## Key files
- `backend/app.js` — Express app factory; `backend/server.js` — runtime boot.
- `backend/routes/{auth,sessions,analytics,ai,tasks,user}.js`
- `backend/models/*.js` — User, Session, NFCTag, UserTag, FocusLog, Statistics,
  AIInsight, Task, RefreshToken
- `backend/services/{aiInsightsService,aiSuggestionService}.js`,
  `backend/config/gemini.js`
- `backend/utils/{jwt,datetime,socialAuth,logger}.js`
- `backend/test/*` — Vitest suites
- `frontend/App.tsx` — global state + nav switch
- `frontend/api/client.ts` — apiFetch + token/refresh authority
- `frontend/screens/ActiveSessionScreen.tsx` — timer, shield + NFC end flow
- `frontend/modules/anchor-screen-time/` — Family Controls Expo module
- `frontend/app.json` / `frontend/ios/Anchor/Anchor.entitlements` — iOS 16
  target, family-controls + applesignin entitlements, build 32

## Architectural rules (from CLAUDE.md, do not break)
- `Statistics` is always rebuilt via `syncStats()` after session writes — never
  mutate directly.
- Sessions/stats store `dateStr` "YYYY-MM-DD" in local time; server-side
  hour/today math uses `User.settings.timezone`.
- `Session.toFrontendRecord()` is the canonical serializer.
- Focus score is always recomputed server-side; client values are ignored.
- Backend uses ES modules (import/export).

## Constraints
- `FamilyActivityPicker` returns opaque, device-bound tokens — the app only
  knows counts, never which apps, and tokens must not be sent to the server.
- Personal Apple team can develop Family Controls but not distribute.
