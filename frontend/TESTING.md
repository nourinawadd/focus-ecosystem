# Frontend Manual QA Checklist — Anchor (Focus Ecosystem)

The backend is covered by an automated Vitest suite (`backend/test/`, run with `npm --prefix backend test`).
The React Native app uses a **custom dev client** with native modules (`anchor-screen-time`, NFC, Screen
Time / Family Controls), so it is verified **manually** against a development build — **never Expo Go**.

## Setup

1. Start the backend: `npm --prefix backend run dev` (needs a populated `.env`; see `backend/.env.example`).
2. Point the app at your backend: set `EXPO_PUBLIC_API_URL` in `frontend/.env`
   (or edit the base URL in `frontend/api/client.ts`) to your machine's LAN IP,
   e.g. `http://192.168.1.95:5000/api`, so the iPhone can reach it over Wi-Fi.
3. Launch Metro against the installed dev build: `npx expo start --dev-client`, then open the app.
4. To exercise social sign-in, configure Google/Apple client IDs (see `backend/.env.example`).

## How to use this checklist

Run every section **once per account type** and record the result in the table at the bottom:

- **Password** — email + password sign-up
- **Google** — native Google sign-in
- **Apple** — native Apple sign-in
- **Email-linked** — sign up with password, then sign in with Google/Apple using the **same email**
  (should land on the *same* account, not a duplicate)

Mark each row ✅ pass / ❌ fail / — n/a, and note anything surprising.

---

## 1. Authentication (`LoginScreen`, `SignUpScreen`)
- [ ] Sign up / sign in succeeds and lands on the Dashboard.
- [ ] Email-linked: signing in with a social provider using an existing password email reuses the same
      account (same data, same history — no duplicate/empty account).
- [ ] Kill and relaunch the app → session is restored (token refresh), no re-login required.
- [ ] Log out → returns to Login; protected screens are no longer reachable.

## 2. Session loop (`CreateSessionScreen`, `ActiveSessionScreen`, `SessionCompleteScreen`)
- [ ] Create a session in each timer mode: **Countdown**, **Pomodoro**, **Stopwatch**.
- [ ] Blocked-app / distraction events register during the session.
- [ ] NFC tag scan verifies presence (where a tag is registered).
- [ ] Complete a session → `SessionCompleteScreen` focus score matches the backend
      (cross-check `PATCH /api/sessions/:id/end` response).
- [ ] Abandon a session → it is recorded as abandoned with **no** focus score.
- [ ] Pomodoro completion shows the higher score (the +8 bonus is visible vs an equivalent countdown).

## 3. Dashboard & streaks (`DashboardScreen`)
- [ ] Completing a session today shows/increments the streak.
- [ ] **Grace period:** on a day where you haven't started a session yet, the streak from previous days
      still shows (it is NOT reset to 0 just because today is idle so far).
- [ ] After a fully skipped day, the next completed session resets the current streak to 1.
- [ ] Longest streak never decreases.

## 4. Analytics (`AnalyticsScreen`)
- [ ] Day / Week / Month filter cards switch the data and the bar chart.
- [ ] Total focus minutes, completion rate, average focus score, and best hour look correct.
- [ ] Bar chart minutes reflect **completed** sessions only (abandoned sessions don't add bars).
- [ ] Health score and its breakdown (consistency / completion / volume) respond to your goals.
- [ ] Spot-check the screen against `GET /api/analytics/summary?period=week` for the same account.

## 5. History (`HistoryScreen`)
- [ ] Past sessions list newest-first.
- [ ] Filters (status / date) narrow the list correctly.
- [ ] Opening a past session shows its details and score.

## 6. AI insights (`AIInsightsScreen`)
- [ ] With < 3 completed sessions: a friendly "not enough data" empty state (no crash).
- [ ] With ≥ 3 sessions and AI configured: an insight/schedule renders.
- [ ] With AI not configured: a clean "AI unavailable" state (no crash).

## 7. Settings & NFC (`SettingsScreen`, `ProfileScreen`, `NFCScreen`, `NFCSetupScreen`)
- [ ] Change daily/weekly goals → Analytics health-score targets shift accordingly.
- [ ] Change timezone → "today"/streak boundaries follow the new zone.
- [ ] Change default timer mode/duration → reflected on the next Create Session.
- [ ] Register an NFC tag, see it listed, delete it.
- [ ] Verify a registered tag → valid; an unknown tag → invalid.

## 8. Cross-cutting
- [ ] No console/red-box errors during any flow.
- [ ] Screen transitions (fade animations) and the drawer overlay behave on all listed screens.
- [ ] Backgrounding the app mid-session and returning keeps the timer state sane.

---

## Results

| Feature area            | Password | Google | Apple | Email-linked | Notes |
|-------------------------|:--------:|:------:|:-----:|:------------:|-------|
| 1. Authentication       |          |        |       |              |       |
| 2. Session loop         |          |        |       |              |       |
| 3. Dashboard & streaks  |          |        |       |              |       |
| 4. Analytics            |          |        |       |              |       |
| 5. History              |          |        |       |              |       |
| 6. AI insights          |          |        |       |              |       |
| 7. Settings & NFC       |          |        |       |              |       |
| 8. Cross-cutting        |          |        |       |              |       |

_Tester: _______  Device / OS: _______  Build: _______  Date: ________
