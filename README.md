# Anchor — Focus & Productivity App

## Overview

**Anchor** is a cross-platform productivity and focus management application that helps users maintain deep work sessions, track their productivity, and overcome digital distractions. Built with a React Native frontend (Expo) and Node.js/Express backend, Anchor combines NFC-based physical presence verification, intelligent app-blocking, and AI-powered productivity insights to create a comprehensive focus ecosystem.

The application targets students, knowledge workers, and professionals who struggle with digital distractions and aim to improve their focus quality and consistency over time.

## Problem Statement

### Core Challenges

1. **Digital Distraction Epidemic**: Users struggle to maintain focus during work sessions due to constant app notifications, social media temptations, and device usage patterns that interrupt deep work.

2. **Lack of Accountability**: Traditional focus timers and task management apps lack real-world verification mechanisms, making it easy for users to "trick" the system without genuine focus.

3. **Passive Productivity Tracking**: Most productivity apps record session durations but don't provide intelligent analysis of patterns, optimal work times, or personalized recommendations.

4. **No Focus Verification**: Users cannot prove they were physically present at their designated focus location during claimed focus sessions.

5. **Generic Focus Sessions**: One-size-fits-all timer solutions don't account for individual productivity patterns, distractions, and optimal work schedules.

## Solution

**Anchor** addresses these challenges through:

- **NFC-Based Verification**: Users scan registered NFC tags at the end of sessions to prove physical presence, creating tamper-resistant session records.
- **AI-Powered Insights**: Google Gemini analyzes session patterns to identify optimal focus hours, distractions, and personalized productivity recommendations.
- **Multi-Mode Timers**: Support for Countdown, Pomodoro, and Stopwatch modes with customizable work/break durations and goals.
- **Screen Time Integration** (iOS): Apple Screen Time API shields distracting apps during active sessions (Family Controls entitlement).
- **Comprehensive Analytics**: Day/week/month views with focus scores, completion rates, health scores, and streak tracking.
- **Granular Session Logs**: Event-level tracking of session starts, app blocks, breaks, and NFC verifications for forensic productivity analysis.
- **Settings Personalization**: Per-user goals (daily/weekly), preferred timer modes, notification preferences, and timezone support.

## Key Features

### Implemented Features

#### 1. **User Authentication & Profile Management**
- Secure JWT-based authentication with access/refresh token rotation
- Rate-limited login/registration endpoints (mitigates brute force)
- Password hashing with bcrypt (12 rounds)
- Per-user settings: session type defaults, timer modes, daily/weekly goals, timezone, notification preferences
- Profile screen displaying cumulative stats and member tenure

#### 2. **Focus Session Management**
- Create sessions with type (Study/Work/Custom), timer mode, and duration
- Three timer modes: Countdown (fixed duration), Pomodoro (work/break intervals), Stopwatch (open-ended)
- Session states: PENDING → ACTIVE → COMPLETED/ABANDONED
- Atomic session end with race condition protection (prevents double-ending)
- Real-time countdown UI with circular progress indicator
- Session data persistence: start time, end time, actual duration, focus score

#### 3. **Focus Score Computation** (Server-Side)
- Formula: `score = min(99, max(20, round(ratio * 80) + pomoBon - penalty + 12))`
- **Ratio**: Actual minutes ÷ Planned minutes (clamped at 1.0)
- **Pomodoro Bonus**: +8 points if Pomodoro mode
- **Penalty**: Up to 24 points (4 points per app blocked, capped at 6 distractions)
- Score range: 20–99 (never 0 to encourage continuation)
- Client-supplied focus scores are ignored; server always recomputes from authoritative sources

#### 4. **NFC Tag Registration & Verification**
- iOS & Android NFC tag scanning via `react-native-nfc-manager`
- Global NFCTag registry (one physical UID → one record across all users)
- Per-user UserTag mapping with custom labels
- Register/delete user tags via dedicated UI (NFCSetupScreen)
- Session end requires optional NFC scan to verify physical presence
- FocusLog event: `NFC_VERIFIED` logged with timestamp and UID

#### 5. **App Blocking & Distraction Tracking**
- Session specifies blocked apps (array of package names)
- Distraction events logged in FocusLog with metadata (app name, package, reason)
- Focus score penalty scales with distraction count
- Per-day top-blocked-app aggregation in Statistics
- iOS Screen Time Shield integration (pending native module completion)

#### 6. **Daily & Aggregated Statistics**
- Per-day Statistics documents automatically synced after session mutations
- Metrics: total focus minutes, sessions completed/abandoned, productivity hour, top blocked app, daily/weekly focus scores
- Current streak: walk-back algorithm O(streak_length)
- Longest streak: max(current, previous_longest)
- Rebuilt from raw Session and FocusLog data via `Statistics.rebuildForDay()`
- Streak calculation efficient: unique {userId, dateStr} index lookup

#### 7. **Analytics & Reporting**
- Summary endpoint: `/api/analytics/summary?period=day|week|month`
- Metrics: total focus minutes, completion rate, average focus score, best hour, health score
- **Health Score** breakdown (out of 100):
  - **Consistency** (40%): % of days with ≥1 completed session
  - **Completion** (30%): Completion rate (completed ÷ total)
  - **Volume** (30%): Minutes achieved vs. goal
- Bar chart data: 4-hour buckets (day), daily totals (week), weekly totals (month)
- Best productive hour calculated from hourly distribution
- Latest streak pulled from Statistics model

#### 8. **AI-Powered Insights** (via Google Gemini)
- **Bulk Insights**: Analyzes 30-day history to generate:
  - Best productive hour (0–23)
  - Optimal session duration (15–120 min)
  - Suggested schedule with day/start-hour/duration/confidence
  - Distraction risk score (0–100) with level (Low/Medium/High) and factors
  - Personalized insight text
- **Quick Suggestion**: Lightweight 1-2 sentence tip for Dashboard (7-day data, 30-min cache)
- Caching: 6-hour TTL for bulk insights, 30-min for suggestions
- Schema validation: Gemini JSON mode with response schema ensures valid output
- Temperature tuning: 0.4 for deterministic insights, 0.1 for structured JSON
- Graceful degradation: Returns 204 if insufficient data; returns stale insight if generation fails but previous exists

#### 9. **History & Session Browsing**
- Filter sessions by Today/Week/Month
- Group by date with labels (Today, Yesterday, weekday-month-day format)
- Week strip visual indicator: highlights completed days vs. gaps
- Delete session capability (triggers stats sync)
- Per-session detail: type, duration, focus score, start/end time

#### 10. **Dashboard**
- Personalized greeting with today's focus day (e.g., "FOCUS MONDAY")
- Today's focus score (0–100)
- Live stats: total sessions, cumulative focus hours, current streak
- Daily goal progress (% toward day's goal)
- Daily goal card: time remaining, sessions today, best time hint
- AI suggestion widget (with local fallback if API unavailable)
- "Start Session" button for quick navigation

#### 11. **Settings & Customization**
- Session type preference (Study/Work/Custom)
- Timer mode (Countdown/Pomodoro/Stopwatch)
- Default duration (15–480 min)
- Pomodoro intervals (work: 1–60 min, break: 1–60 min)
- Daily goal (0–1440 min)
- Weekly goal (0–10080 min)
- Timezone selection (IANA format for local date calculations)
- Notifications toggle
- All changes synced to backend immediately

#### 12. **User Tags & NFC Setup**
- Dedicated NFCSetupScreen for tag registration
- List registered tags with user labels
- Delete tag capability
- Scan new tag flow with visual feedback
- Unregistered tag detection (prompts registration)

#### 13. **Navigation & Screen Routing**
- 12 implemented screens routed through centralized App.tsx switch
- Screens: SignUp, Login, Dashboard, Profile, Settings, CreateSession, NFCScan, ActiveSession, SessionComplete, History, Analytics, AIInsights, NFCSetup, ComingSoonScreen
- Animated transitions (110ms fade out, 180ms fade in)
- Drawer navigation for quick access from supported screens
- Screen-specific status bar styling (dark for ActiveSession)

#### 14. **Token Lifecycle & Refresh**
- Access tokens: Short-lived (7 days default via JWT_EXPIRES_IN)
- Refresh tokens: 30-day TTL, persisted in DB with hash (never plaintext)
- Automatic refresh: Client transparently retries 401 with refresh token
- Token rotation: Refresh token replaced on each refresh; old token revoked
- Reuse detection: Multiple refresh attempts with same token triggers full logout (theft protection)
- User-agent & IP tracking on refresh tokens for security auditing

#### 15. **Comprehensive Logging & Audit Trail**
- FocusLog model: Event-level session tracking
- Events: SESSION_STARTED, SESSION_ENDED, APP_BLOCKED, BREAK_STARTED, BREAK_ENDED, NFC_VERIFIED, NFC_REJECTED
- Metadata: app name, package name, reason, UID
- Enables forensic analysis, distraction patterns, NFC verification proof

### Partially Implemented / In Progress

#### iOS Screen Time / App Blocking (Native Module Scaffold Pending)
- **Status**: Expo module created; Swift native code scaffolded but incomplete
- **Missing**: Swift implementation of `requestAuthorization()`, `presentPicker()`, `startBlocking()`, `stopBlocking()`, `isBlocking()`
- **Blocker**: Apple Family Controls entitlement approval (requested, awaiting reply from Apple)
- **Deployment Target**: Bumped to 16.0 in app.json (required for Screen Time APIs)
- **Integration Point**: CreateSessionScreen can configure app selection; ActiveSessionScreen can apply shield on session start
- **Status**: Requires physical iPhone testing (simulator doesn't support Screen Time APIs)


## Technology Stack

### Frontend
- **Framework**: React Native 0.81.5 (Expo ~54.0.33)
- **Language**: TypeScript 5.9.2
- **Navigation**: Custom switch-based routing (not React Navigation)
- **UI Components**: React Native core (View, Text, ScrollView, TouchableOpacity, etc.)
- **Icons**: Expo vector icons (Ionicons)
- **Animations**: React Native Animated API
- **NFC**: react-native-nfc-manager (3.17.2)
- **Storage**: @react-native-async-storage/async-storage (2.2.0)
- **HTTP Client**: Fetch API with custom wrapper
- **Safe Area**: react-native-safe-area-context (5.6.0)
- **Screens**: react-native-screens (4.16.0)
- **Build System**: EAS (Expo Application Services)

### Backend
- **Runtime**: Node.js with ES modules
- **Framework**: Express 5.2.1
- **Language**: JavaScript (ES6+ modules)
- **Database**: MongoDB 9.5.0 (Mongoose ODM)
- **Authentication**: JWT (jsonwebtoken 9.0.3) with access + refresh token rotation
- **Password Hashing**: bcryptjs (3.0.3)
- **Rate Limiting**: express-rate-limit (8.5.2)
- **Security**: Helmet (8.2.0) for HTTP headers
- **CORS**: cors (2.8.6)
- **AI Generation**: Google Generative AI (@google/generative-ai 0.21.0) - Gemini 2.5 Flash
- **Environment**: dotenv (17.4.2)
- **Dev Tools**: Nodemon (3.1.14)

### Database
- **Type**: MongoDB (NoSQL document store)
- **Collections/Models**:
  - `users`: Profile, settings, timezone, notification preferences
  - `sessions`: Focus sessions with timer config, state, blocked apps, focus score
  - `nfctags`: Global NFC tag registry
  - `usertags`: Per-user NFC tag mappings with labels
  - `focuslogs`: Event-level audit trail (start, end, app block, NFC)
  - `statistics`: Daily aggregated metrics (rebuilt from raw data)
  - `aiinsights`: Cached AI-generated recommendations
  - `refreshtokens`: Refresh token hashes with revocation status

### Authentication & Security
- **JWT Strategy**: Access (short-lived) + Refresh (long-lived) rotation
- **Password**: bcrypt 12 rounds
- **Rate Limiting**: 5 login attempts/min, 10 registration attempts/hour
- **Timing Attack Mitigation**: Dummy hash comparison for non-existent users
- **CORS**: Configurable origins from `CORS_ORIGINS` env var
- **Helmet**: XSS, CSP, HSTS protection
- **Refresh Token Theft Detection**: Reuse of revoked token triggers full logout

### AI/ML Services
- **Provider**: Google Gemini (Generative AI)
- **Model**: Gemini 2.5 Flash (configurable via `GEMINI_MODEL`)
- **Features**:
  - Insight generation with JSON schema validation
  - Deterministic scheduling (temperature 0.1)
  - Natural language suggestions (temperature 0.4)
- **Input Data**: 30-day session history + app distraction logs
- **Output**: Structured insights with productivity recommendations, distraction risk, schedule
- **Caching**: 6-hour for insights, 30-min for suggestions
- **Graceful Degradation**: Returns stale insight or 204 if API unavailable

### Cloud & Hosting
- **Backend**: Render (free tier) — `https://focus-ecosystem.onrender.com`, auto-deploys from `main`
- **Database**: MongoDB Atlas (cloud) or self-hosted MongoDB
- **Frontend**: EAS (Expo) for iOS/Android builds
- **NFC Hardware**: iOS/Android devices with NFC capability

### External APIs & Integrations
- **Google Generative AI**: Gemini 2.5 Flash for AI insights
- **MongoDB Atlas**: Cloud database (optional)
- **EAS Build**: iOS/Android build and deployment
- **Apple App Store**: iOS deployment (requires Team ID and paid account)
- **Google Play Store**: Android deployment
- **Physical NFC Tags**: ISO/IEC 14443 Type A or Type B compatible tags

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND (React Native)             │
│  Screens: Dashboard, Settings, ActiveSession, Analytics,   │
│  History, AIInsights, Profile, Auth, NFCSetup, etc.        │
│  State Management: App.tsx global state (sessions, user,    │
│  token)                                                     │
└───────────┬─────────────────────────────────────────────────┘
            │ HTTP (Bearer JWT)
            ▼
┌─────────────────────────────────────────────────────────────┐
│          BACKEND (Node.js / Express)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Routes:                                             │   │
│  │  • /api/auth (register, login, refresh, logout)    │   │
│  │  • /api/user (profile, settings, NFC tags)         │   │
│  │  • /api/sessions (CRUD sessions, focus score)      │   │
│  │  • /api/analytics (summary, statistics)            │   │
│  │  • /api/ai (insights, suggestions)                 │   │
│  │                                                     │   │
│  │ Middleware: auth, validation, error handling       │   │
│  │ Services: aiInsightsService, aiSuggestionService   │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────┬─────────────────────────────────────────────────┘
            │ Mongoose ODM
            ▼
┌─────────────────────────────────────────────────────────────┐
│                MongoDB (Document Store)                     │
│  Collections: users, sessions, statistics, focuslogs,      │
│  nfctags, usertags, aiinsights, refreshtokens             │
└─────────────────────────────────────────────────────────────┘
            ▲
            │ API calls
            │
┌─────────────────────────────────────────────────────────────┐
│     Google Generative AI (Gemini 2.5 Flash)                │
│  • Insight generation (30-day patterns)                     │
│  • Quick suggestions (7-day data)                           │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Session Creation & Completion

1. **User starts session**: Calls `POST /api/sessions` with type, timer mode, duration, blocked apps
2. **Backend**: Creates Session (ACTIVE), logs `SESSION_STARTED` event to FocusLog
3. **Frontend**: Starts countdown timer, displays progress, monitors distraction events
4. **Optional NFC Scan**: User scans tag (frontend reads UID)
5. **User ends session**: Calls `PATCH /api/sessions/:id/end` with actual duration, status (COMPLETED/ABANDONED), NFC UID
6. **Backend**:
   - Atomically transitions Session from ACTIVE → COMPLETED/ABANDONED
   - Server recomputes focus score from actual duration, distraction count, timer mode
   - Creates `SESSION_ENDED` and optional `NFC_VERIFIED` log events
   - Calls `syncStats(userId, dateStr)` which:
     - Rebuilds Statistics for the day (total minutes, completion rate, etc.)
     - Recalculates current and longest streaks
     - Updates Statistics document with streak values
   - Invalidates AI suggestion cache
7. **Frontend**: Refreshes sessions list, displays SessionCompleteScreen with score

#### Statistics Sync

```
Session write (create/end/delete)
    ↓
syncStats(userId, dateStr)
    ↓
Statistics.rebuildForDay(userId, dateStr)
    ├─ Query all sessions for the day
    ├─ Calculate totalFocusMinutes, sessionsCompleted, etc.
    ├─ Determine mostProductiveHour from hourly distribution
    ├─ Find topBlockedApp from FocusLog APP_BLOCKED events
    ├─ Compute dailyFocusScore from session focus scores
    └─ Update/create Statistics document
    ↓
computeStreaks(userId)
    ├─ Walk back from today, counting days with completed sessions
    ├─ Return current streak
    ├─ Fetch longest streak record
    └─ Return max(current, previous_longest)
    ↓
Statistics.setStreak(userId, dateStr, current, longest)
```

#### AI Insight Generation

1. **Frontend**: User navigates to AIInsightsScreen or Dashboard
2. **Frontend**: Calls `GET /api/ai/insights` or `GET /api/ai/suggestion`
3. **Backend**: Checks cache (6-hour TTL for insights, 30-min for suggestions)
4. **If cached**: Returns cached insight with `cached: true`
5. **If expired or missing**: Calls `getOrGenerateInsight(userId)` or `getSuggestion(userId)`
6. **Service layer**:
   - Queries 30-day session history
   - Builds user profile: hourly distribution, top distractions, avg score, etc.
   - Constructs detailed prompt with structured data
   - Calls `generateJSON(prompt, INSIGHT_SCHEMA)` with Gemini 2.5 Flash
   - Validates and clamps response (ensures hours in 0–23, scores in 0–100, etc.)
   - Stores in AIInsight collection
   - Caches in memory with TTL
   - Returns to frontend

---

## Installation

### Prerequisites

- **Node.js** 18+ (for backend)
- **npm** or **yarn**
- **MongoDB** (local or MongoDB Atlas)
- **Expo CLI** (for frontend development)
- **Xcode** (for iOS) or **Android Studio** (for Android)
- **Google Gemini API key** (optional, for AI features)

### Backend Setup

1. **Clone repository**:
   ```bash
   git clone https://github.com/yourusername/focus-ecosystem.git
   cd focus-ecosystem/backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file**:
   ```env
   MONGO_URI=mongodb://localhost:27017/anchor
   JWT_SECRET=your-secure-secret-min-32-chars
   JWT_REFRESH_SECRET=your-secure-refresh-secret-min-32-chars
   JWT_EXPIRES_IN=7d
   PORT=5000
   CORS_ORIGINS=http://localhost:3000,http://10.0.2.2:3000,exp://192.168.x.x:port
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.5-flash
   ```

4. **Start MongoDB** (if local):
   ```bash
   mongod
   ```

5. **Start backend server**:
   ```bash
   npm run dev    # development with nodemon
   npm start      # production
   ```

   Server should start on `http://localhost:5000`

### Backend Deployment (Render)

The production backend runs on Render's free tier at **`https://focus-ecosystem.onrender.com`** and auto-deploys on every push to `main`. To recreate the setup:

1. **Render** → New → Web Service → connect the GitHub repo:
   - Root Directory: `backend`
   - Build command: `npm install` · Start command: `npm start`
   - Instance type: Free
2. **Environment variables** (Render dashboard → Environment): `MONGO_URI`, `JWT_SECRET` (≥ 32 chars), `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `APPLE_BUNDLE_ID`. Do **not** set `PORT` — Render injects it.
3. **MongoDB Atlas** → Network Access → allow `0.0.0.0/0` (Render's outbound IPs are dynamic).
4. **Keep-alive**: a free [UptimeRobot](https://uptimerobot.com) monitor pings `GET /api/health` every 5 minutes. Without it the free instance spins down after ~15 min idle — the next request stalls ~50 s and the in-process notification cron silently stops while asleep.
5. **Verify**: `GET https://focus-ecosystem.onrender.com/api/health` → `{ "status": "ok", "db": "connected" }`. Note there is no route at `/` — everything lives under `/api`, so "Cannot GET /" in a browser is expected.

### Frontend Setup

1. **Navigate to frontend**:
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file** with the API base URL:
   ```env
   # Deployed backend (default for development against production data)
   EXPO_PUBLIC_API_URL=https://focus-ecosystem.onrender.com/api

   # Or a local backend over LAN (phone and computer on the same Wi-Fi)
   # EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:5000/api
   ```
   The value is baked in at bundle time — restart Metro after changing it.

> **⚠️ Do NOT use Expo Go.** Anchor bundles custom native modules (`anchor-screen-time`, NFC, Screen Time / Family Controls) that Expo Go cannot load. You must run against a **development build** (dev client). Expo Go is not a supported option.

4. **Build & install the iOS development build (one-time per device):**
   ```bash
   npm i -g eas-cli
   eas login
   eas device:create                       # register your iPhone's UDID (iOS only)
   eas build -p ios --profile development   # cloud build; EAS asks for Apple credentials, returns a QR/install link
   ```
   Open the QR/link on the iPhone to install the dev build.

5. **Daily development** — once the dev build is installed, just start Metro and scan the QR with the installed app:
   ```bash
   npx expo start --dev-client
   ```

---

## Environment Variables

### Backend (`.env`)

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `MONGO_URI` | string | Yes | — | MongoDB connection string (e.g., `mongodb://localhost:27017/anchor` or Atlas URI) |
| `JWT_SECRET` | string | Yes | — | Secret key for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | string | Yes | — | Secret key for signing refresh tokens (min 32 chars) |
| `JWT_EXPIRES_IN` | string | No | `7d` | Access token TTL (e.g., `7d`, `24h`) |
| `PORT` | number | No | `5000` | Express server port |
| `CORS_ORIGINS` | string | Yes | — | Comma-separated list of allowed origins |
| `GEMINI_API_KEY` | string | No | — | Google Generative AI API key (optional; AI features disabled if missing) |
| `GEMINI_MODEL` | string | No | `gemini-2.5-flash` | Gemini model name |

### Frontend (`.env`)

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | string | No | `http://10.0.2.2:5000/api` (dev) | Base URL for API requests (override for physical phones or production) |

---

## Running the Project

### Development

#### Terminal 1: Backend

```bash
cd backend
npm install
npm run dev
```

#### Terminal 2: Frontend

```bash
cd frontend
npm install
npx expo start --dev-client
```

> **⚠️ Requires the installed development build — NOT Expo Go.** See [Frontend Setup](#frontend-setup) for the one-time `eas build -p ios --profile development` step. Once the dev build is on your device, scan the QR from `npx expo start --dev-client` to connect. Expo Go is not supported because of the custom native modules.

### Production

#### Backend

```bash
cd backend
npm install
NODE_ENV=production npm start
```

#### Frontend (EAS Build)

```bash
cd frontend
npx eas build --platform ios      # or android
npx eas submit --platform ios     # submit to App Store
```

---

## Folder Structure

```
focus-ecosystem/
├── backend/
│   ├── config/
│   │   ├── db.js                 # MongoDB connection setup
│   │   └── gemini.js             # Google Generative AI client
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   ├── asyncHandler.js       # Async error wrapper
│   │   ├── errorHandler.js       # Global error handler
│   │   └── validate.js           # Input validation helpers
│   ├── models/
│   │   ├── User.js               # User profile + settings
│   │   ├── Session.js            # Focus session
│   │   ├── FocusLog.js           # Event-level audit trail
│   │   ├── Statistics.js         # Daily aggregated metrics
│   │   ├── AIInsight.js          # AI-generated recommendations
│   │   ├── NFCTag.js             # Global NFC tag registry
│   │   ├── UserTag.js            # Per-user NFC tag mapping
│   │   └── RefreshToken.js       # Refresh token storage + revocation
│   ├── routes/
│   │   ├── auth.js               # /api/auth endpoints
│   │   ├── user.js               # /api/user endpoints (profile, settings, NFC)
│   │   ├── sessions.js           # /api/sessions endpoints (CRUD + scoring)
│   │   ├── analytics.js          # /api/analytics endpoints
│   │   └── ai.js                 # /api/ai endpoints (insights, suggestions)
│   ├── services/
│   │   ├── aiInsightsService.js  # 30-day AI insight generation
│   │   └── aiSuggestionService.js # 7-day quick suggestion generation
│   ├── utils/
│   │   ├── datetime.js           # Date/time helpers (timezone-aware)
│   │   └── jwt.js                # JWT sign/verify utilities
│   ├── package.json
│   ├── server.js                 # Express app entry point
│   └── .env                      # Environment variables (git-ignored)
│
├── frontend/
│   ├── api/
│   │   └── client.ts             # HTTP wrapper + token management
│   ├── assets/
│   │   ├── icon.png
│   │   ├── splash-icon.png
│   │   ├── adaptive-icon.png
│   │   └── favicon.png
│   ├── components/
│   │   ├── Card.tsx              # Reusable card component
│   │   ├── CircularProgress.tsx   # SVG-based progress arc
│   │   ├── Drawer.tsx            # Side navigation drawer
│   │   ├── PillBadge.tsx         # Status badge component
│   │   └── SectionLabel.tsx      # Section header component
│   ├── constants/
│   │   └── theme.ts              # Colors, spacing, radii, typography
│   ├── modules/
│   │   └── anchor-screen-time/   # Local Expo module for iOS Screen Time
│   │       ├── expo-module.config.json
│   │       ├── package.json
│   │       ├── ios/
│   │       │   └── AnchorScreenTimeModule.swift
│   │       └── src/
│   │           └── index.ts
│   ├── screens/
│   │   ├── SignUpScreen.tsx      # Registration flow
│   │   ├── LoginScreen.tsx       # Login flow
│   │   ├── DashboardScreen.tsx   # Home/dashboard
│   │   ├── ProfileScreen.tsx     # User profile + stats
│   │   ├── SettingsScreen.tsx    # Settings customization
│   │   ├── CreateSessionScreen.tsx # Session setup with app blocking
│   │   ├── NFCScreen.tsx         # NFC tag scanning (session start)
│   │   ├── ActiveSessionScreen.tsx # Live timer + distraction tracking
│   │   ├── SessionCompleteScreen.tsx # Session summary + score
│   │   ├── HistoryScreen.tsx     # Session history with filtering
│   │   ├── AnalyticsScreen.tsx   # Period analytics + health score
│   │   ├── AIInsightsScreen.tsx  # AI recommendations
│   │   ├── NFCSetupScreen.tsx    # NFC tag registration
│   │   └── ComingSoonScreen.tsx  # Placeholder for future features
│   ├── store/
│   │   ├── sessions.ts           # Shared session data model + helpers
│   │   └── user.ts               # User profile model
│   ├── utils/
│   │   └── nfc.ts                # NFC tag reading utilities
│   ├── App.tsx                   # Root component + global state
│   ├── app.json                  # Expo configuration
│   ├── package.json
│   ├── tsconfig.json
│   ├── metro.config.js
│   ├── index.ts                  # Entry point
│   ├── ios/                      # iOS native code + entitlements
│   └── android/                  # Android native code
│
├── README_GENERATED.md           # This file
├── IDEA_OVERVIEW.md              # Presentation overview
├── CLAUDE.md                     # Development context
├── ANCHOR_CURRENT_STATE.md       # Project state snapshot
└── .gitignore
```

---

## API Documentation

### Authentication Endpoints

#### `POST /api/auth/register`
Register a new user.

**Request**:
```json
{
  "name": "Alice Johnson",
  "email": "alice@university.edu",
  "password": "SecurePassword123"
}
```

**Response** (201):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Alice Johnson",
    "email": "alice@university.edu",
    "settings": { "defaultSessionType": "STUDY", ... }
  }
}
```

#### `POST /api/auth/login`
Authenticate user.

**Request**:
```json
{
  "email": "alice@university.edu",
  "password": "SecurePassword123"
}
```

**Response** (200): Same as register response.

#### `POST /api/auth/refresh`
Rotate access token using refresh token.

**Request**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** (200): Same token pair structure.

#### `POST /api/auth/logout`
Revoke refresh token.

**Request**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** (204): No content.

---

### User Endpoints (Requires Auth)

#### `GET /api/user/me`
Fetch current user profile.

**Response** (200):
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Alice Johnson",
  "email": "alice@university.edu",
  "settings": {
    "defaultSessionType": "STUDY",
    "defaultTimerMode": "POMODORO",
    "defaultDuration": 45,
    "pomodoroWork": 25,
    "pomodoroBreak": 5,
    "dailyGoalMinutes": 120,
    "weeklyGoalMinutes": 600,
    "notificationsEnabled": true,
    "timezone": "America/New_York"
  },
  "createdAt": "2026-01-15T10:30:00Z"
}
```

#### `PATCH /api/user/settings`
Update user settings (partial).

**Request**:
```json
{
  "dailyGoalMinutes": 180,
  "timezone": "Europe/Istanbul"
}
```

**Response** (200): Updated user document.

#### `GET /api/user/nfc-tags`
List user's registered NFC tags.

**Response** (200):
```json
[
  {
    "_id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "tagId": {
      "_id": "507f1f77bcf86cd799439013",
      "uid": "04C4AB57842080"
    },
    "label": "Desk Tag",
    "registeredAt": "2026-01-20T08:00:00Z"
  }
]
```

#### `POST /api/user/nfc-tags`
Register a new NFC tag.

**Request**:
```json
{
  "uid": "04C4AB57842080",
  "label": "Study Desk"
}
```

**Response** (201): Created user tag document.

#### `DELETE /api/user/nfc-tags/:userTagId`
Delete a registered tag.

**Response** (200):
```json
{ "deleted": true }
```

#### `POST /api/user/nfc-verify`
Verify if a tag is registered to the user.

**Request**:
```json
{
  "uid": "04C4AB57842080"
}
```

**Response** (200):
```json
{
  "valid": true,
  "tag": { ... }
}
```

---

### Session Endpoints (Requires Auth)

#### `GET /api/sessions?status=COMPLETED&dateStr=2026-01-20&limit=50`
Fetch sessions (optionally filtered).

**Response** (200):
```json
[
  {
    "id": "507f1f77bcf86cd799439014",
    "title": "Study Session",
    "type": "Study",
    "duration": 45,
    "startTime": "14:30",
    "endTime": "15:15",
    "focusScore": 82,
    "completed": true,
    "dateStr": "2026-01-20"
  }
]
```

#### `POST /api/sessions`
Create a new session.

**Request**:
```json
{
  "type": "STUDY",
  "timerMode": "POMODORO",
  "timerConfig": {
    "plannedDuration": 90,
    "pomodoroWork": 25,
    "pomodoroBreak": 5,
    "pomodoroRounds": 4
  },
  "blockedApps": ["Instagram", "Twitter", "TikTok"],
  "dateStr": "2026-01-20",
  "startedAt": "2026-01-20T14:30:00Z"
}
```

**Response** (201): Session record (frontend format).

#### `PATCH /api/sessions/:id/end`
End a session.

**Request**:
```json
{
  "status": "COMPLETED",
  "timerState": {
    "actualDuration": 47,
    "pomodoroRoundsCompleted": 2,
    "breaks": 1
  },
  "endedAt": "2026-01-20T15:17:00Z",
  "nfcTagUid": "04C4AB57842080"
}
```

**Response** (200): Updated session record.

---

### Analytics Endpoints (Requires Auth)

#### `GET /api/analytics/summary?period=week`
Fetch analytics summary for period.

**Query Params**:
- `period`: `day` | `week` | `month` (default: `week`)

**Response** (200):
```json
{
  "period": "week",
  "totalFocusMinutes": 540,
  "sessionsCount": 12,
  "completedCount": 11,
  "abandonedCount": 1,
  "completionRate": 92,
  "averageFocusScore": 78,
  "bestHour": 14,
  "healthScore": 86,
  "healthBreakdown": {
    "consistency": 35,
    "completion": 28,
    "volume": 23
  },
  "currentStreak": 5,
  "longestStreak": 12,
  "barData": [
    { "label": "S", "minutes": 75 },
    { "label": "M", "minutes": 85 },
    ...
  ]
}
```

#### `GET /api/analytics/statistics?from=2026-01-10&to=2026-01-20`
Fetch raw daily statistics.

**Response** (200): Array of Statistics documents.

#### `GET /api/analytics/ai-insight`
Fetch latest AI insight (returns 204 if none exists).

**Response** (200 or 204):
```json
{
  "bestProductiveHour": 14,
  "optimalDuration": 50,
  "suggestedSchedule": [
    {
      "day": "Monday",
      "startHour": 14,
      "durationMinutes": 45,
      "confidence": 0.92
    }
  ],
  "distractionRisk": {
    "score": 42,
    "level": "medium",
    "factors": ["Evening sessions less focused", "Social media is top distraction"]
  },
  "insightText": "You're most productive in early afternoon (2–3 PM). Consider scheduling important work then.",
  "generatedAt": "2026-01-20T10:00:00Z"
}
```

---

### AI Endpoints (Requires Auth)

#### `GET /api/ai/insights`
Fetch cached or generate new AI insights.

**Response** (200 or 204):
```json
{
  "insight": { ... },
  "cached": false,
  "stale": false
}
```

#### `POST /api/ai/insights/generate`
Force regenerate insights (ignoring cache).

**Response** (200): Same as GET.

#### `GET /api/ai/suggestion`
Fetch lightweight productivity suggestion.

**Response** (200 or 204):
```json
{
  "suggestion": "You're most productive on Tuesday afternoons. Try scheduling your deep work then.",
  "cached": true
}
```

---

## Database Structure

### Users Collection

```javascript
{
  _id: ObjectId,
  email: String (unique, lowercase),
  passwordHash: String (bcrypt),
  name: String,
  settings: {
    defaultSessionType: String (enum: STUDY, WORK, CUSTOM),
    defaultTimerMode: String (enum: COUNTDOWN, POMODORO, STOPWATCH),
    defaultDuration: Number (1–480 min),
    pomodoroWork: Number (1–60 min),
    pomodoroBreak: Number (1–60 min),
    dailyGoalMinutes: Number (0–1440),
    weeklyGoalMinutes: Number (0–10080),
    notificationsEnabled: Boolean,
    timezone: String (IANA format, e.g., "UTC", "America/New_York")
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Sessions Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  type: String (enum: STUDY, WORK, CUSTOM),
  status: String (enum: PENDING, ACTIVE, COMPLETED, ABANDONED),
  timerMode: String (enum: COUNTDOWN, POMODORO, STOPWATCH),
  timerConfig: {
    plannedDuration: Number,
    pomodoroWork: Number,
    pomodoroBreak: Number,
    pomodoroRounds: Number
  },
  timerState: {
    actualDuration: Number,
    pomodoroRoundsCompleted: Number,
    breaks: Number
  },
  blockedApps: [String],
  focusScore: Number (0–100, null if abandoned),
  dateStr: String ("YYYY-MM-DD", local time),
  startedAt: Date,
  endedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `{ userId: 1, dateStr: -1 }`
- `{ userId: 1, status: 1, dateStr: 1 }`

### FocusLog Collection

```javascript
{
  _id: ObjectId,
  sessionId: ObjectId (ref: Session),
  userId: ObjectId (ref: User),
  event: String (enum: SESSION_STARTED, SESSION_ENDED, APP_BLOCKED, BREAK_STARTED, BREAK_ENDED, NFC_VERIFIED, NFC_REJECTED),
  timestamp: Date,
  metadata: {
    appName: String,
    packageName: String,
    reason: String,
    uid: String (for NFC)
  }
}
```

**Indexes**:
- `{ sessionId: 1, timestamp: 1 }`
- `{ userId: 1, event: 1, timestamp: -1 }`

### Statistics Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  date: Date,
  dateStr: String ("YYYY-MM-DD"),
  totalFocusMinutes: Number,
  sessionsCompleted: Number,
  sessionsAbandoned: Number,
  currentStreak: Number,
  longestStreak: Number,
  mostProductiveHour: Number (0–23, null if no data),
  topBlockedApp: String,
  dailyFocusScore: Number (0–100),
  weeklyFocusScore: Number (0–100),
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `{ userId: 1, dateStr: 1 }` (unique)
- `{ userId: 1, date: -1 }`

### AIInsight Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User, unique),
  bestProductiveHour: Number (0–23),
  optimalDuration: Number,
  suggestedSchedule: [{
    day: String,
    startHour: Number (0–23),
    durationMinutes: Number,
    confidence: Number (0–1)
  }],
  distractionRisk: {
    score: Number (0–100),
    level: String (enum: Low, Medium, High),
    factors: [String]
  },
  insightText: String,
  modelVersion: String,
  trainingSize: Number,
  generatedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### NFCTag Collection

```javascript
{
  _id: ObjectId,
  uid: String (unique, uppercase),
  createdAt: Date
}
```

### UserTag Collection (Join Table)

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  tagId: ObjectId (ref: NFCTag),
  label: String,
  registeredAt: Date
}
```

### RefreshToken Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  tokenHash: String,
  expiresAt: Date,
  revokedAt: Date (null if active),
  replacedBy: String (tokenHash of replacement token),
  userAgent: String,
  ip: String,
  createdAt: Date
}
```

---

## Security Features

### Authentication & Authorization

1. **JWT Strategy**:
   - Access tokens: Short-lived (7 days default)
   - Refresh tokens: Long-lived (30 days), stored in DB with hash only
   - Token rotation on every refresh
   - Reuse detection: Multiple refresh attempts with same token triggers full logout

2. **Password Security**:
   - bcrypt hashing with 12 rounds
   - Timing attack mitigation: Dummy hash comparison for non-existent users
   - Minimum 8-character password requirement (enforced frontend + backend)

3. **Rate Limiting**:
   - Login: 5 attempts per minute per IP
   - Registration: 10 accounts per hour per IP
   - Protects against brute force and account enumeration

### Data Protection

1. **Encryption**:
   - HTTPS required for all API communication (via helmet + deployment config)
   - Refresh tokens hashed with SHA-256 before storage
   - No plaintext secrets in code or logs

2. **Access Control**:
   - All protected endpoints require Bearer JWT
   - User can only access their own data (userId check on all queries)
   - NFC tags globally shared; per-user registration prevents unauthorized use

3. **Input Validation**:
   - Request body size capped at 100KB
   - All inputs validated against schema (string length, numeric ranges, enums)
   - SQL injection N/A (using MongoDB + Mongoose); nosql injection mitigated via schema validation

### Infrastructure Security

1. **HTTP Security Headers** (via Helmet):
   - X-Frame-Options: DENY (clickjacking protection)
   - X-Content-Type-Options: nosniff
   - Strict-Transport-Security (HSTS)
   - Content-Security-Policy (CSP)

2. **CORS**:
   - Origins whitelist from `CORS_ORIGINS` env var
   - Credentials: false (tokens passed in Authorization header, not cookies)

3. **Error Handling**:
   - Generic error messages to clients (no stack traces or internal details)
   - Detailed logging server-side for debugging

4. **Session Management**:
   - Refresh token revocation on logout
   - Multi-token reuse detection prevents session hijacking
   - Token metadata (user-agent, IP) logged for audit trail

### NFC Verification

- **Tamper Resistance**: NFC tag UID verification at session end; server maintains global NFCTag registry
- **Per-User Registration**: UserTag join table ensures only registered tags are valid
- **No Reverse Mapping**: Opaque tag metadata (no app can deduce which tag was scanned)
- **Audit Trail**: NFC_VERIFIED events logged with timestamp and UID

---
