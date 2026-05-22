  # Anchor — Current State (as of 2026-05-22)

  ## What works today
  - Auth (register/login, JWT)
  - Session create/start/end with focus score calculation
  - NFC tag scanning on iOS + Android (react-native-nfc-manager)
  - NFC tag registration (NFCSetupScreen)
  - Per-day Statistics aggregation via syncStats()
  - Gemini AI insights (writes to AIInsight via PUT /api/analytics/ai-insight)  - 12 screens, all routed through App.tsx switch
  - iOS dev-client builds via EAS (eas dev profile recently added)

  ## What's mid-flight
  - iOS Screen Time / app-blocking feature: planned but no code yet.
  - Family Controls Distribution entitlement: REQUESTED from Apple
    via the developer.apple.com form. Awaiting reply. Team ID:
    "Nourin Awad - SGMRDRZ92B" (verify this is the paid team, not a
    personal team, before relying on approval).
  - iOS deployment target needs to bump to 16.0 in app.json before
    the Expo module is added.

  ## What's next (in order)
  1. Scaffold local Expo Module:
     `cd frontend && npx create-expo-module@latest --local
  expo-screen-time-shield`
  2. Add entitlements + NSFamilyControlsUsageDescription to app.json.
  3. Bump deploymentTarget to 16.0 via expo-build-properties plugin.
  4. Implement Swift module: requestAuthorization, presentPicker,
     startBlocking, stopBlocking, isBlocking.
  5. Wire into ActiveSession flow + add "Focus Profile" settings screen.
  6. Test on physical iPhone via EAS dev client (simulator can't run
     Screen Time APIs).
  7. When entitlement granted → TestFlight → defense demo.

  ## Key files
  - `backend/server.js` — entry point, route mounting
  - `backend/routes/sessions.js` — focus score formula lives here
  - `backend/routes/analytics.js` — AI insight endpoint
  - `backend/models/*.js` — User, Session, NFCTag, UserTag, FocusLog,
    Statistics, AIInsight
  - `frontend/App.tsx` — global state + navigation switch
  - `frontend/api/client.ts` — apiFetch wrapper, base URL config
  - `frontend/screens/NFCScreen.tsx` — working NFC scan flow
  - `frontend/screens/NFCSetupScreen.tsx` — tag registration
  - `frontend/store/sessions.ts` — date/time helpers
  - `frontend/app.json` — Expo config, will need entitlement additions
  - `frontend/ios/Anchor/Anchor.entitlements` — modified locally,
    ready for family-controls key

  ## Architectural rules (from CLAUDE.md, do not break)
  - Statistics is always rebuilt via syncStats() after session writes —
    never mutate directly.
  - All dates use dateStr "YYYY-MM-DD" in local time. No UTC conversion.
  - Session.toFrontendRecord() is the canonical serializer.
  - Backend uses ES modules (import/export), not CommonJS.

  ## Constraints
  - Lead dev on Windows; iOS native work only on teammate's Mac.
  - Personal Apple Developer team can develop FamilyControls but cannot
    distribute. Paid team distribution gated on entitlement approval.
  - FamilyActivityPicker returns opaque tokens — the app can never know
    which specific apps the user picked, only counts. UI must reflect this.
  - Tokens are device-bound and must not be sent to the server.