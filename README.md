<h1><img src="assets/readme/anchor.svg" height="30" alt="" /> Anchor</h1>

> Stay anchored to what matters.

Anchor is a focus and accountability app for people who want their deep work to actually count. You start a timed session, optionally block your most distracting apps, and tap a physical NFC tag to prove you showed up at your focus spot. Over time Anchor builds a picture of when and how you focus best, tracks your streaks and goals, and turns that into clear, personalized insights.

It is currently in beta on iOS through TestFlight, with an App Store release on the way.

<h2><img src="assets/readme/life-buoy.svg" height="22" alt="" /> Features</h2>

**Focus sessions.** Run sessions in Countdown or Pomodoro mode, set your own duration, and organize them with custom categories like Work, Study, or anything you create.

**App blocking.** Shield your most distracting apps during a session using iOS Screen Time, so the temptation stays out of reach until you finish.

**NFC check-in.** Register a physical NFC tag (the small coin or sticker kind) and tap it to confirm you are really at your desk or study spot. This is what makes an Anchor session trustworthy instead of just another timer.

**Progress and goals.** Every session earns a focus score. Anchor tracks daily and weekly goals, current and longest streaks, and an overall health score so you can see your consistency at a glance.

**Analytics.** Review your focus across day, week, and month, including your most productive hours and your completion rate.

**AI insights.** Anchor studies your recent sessions to suggest your best focus hours, an ideal session length, and a weekly schedule, plus a quick daily tip.

**Live session timer.** Keep an eye on the countdown from your Lock Screen and the Dynamic Island without opening the app.

**Accounts.** Sign in with email, Google, or Apple. Email accounts are verified by code and support password reset and change.

<h2><img src="assets/readme/compass.svg" height="22" alt="" /> How it works</h2>

1. Create a session, choose Countdown or Pomodoro, set a duration, and pick any apps to block.
2. Start the timer. Blocked apps are shielded and a live activity appears on your Lock Screen.
3. When the time is up, tap your NFC tag to check in.
4. Anchor saves the session, updates your streak and stats, and refines its insights.

<h2><img src="assets/readme/ship-wheel.svg" height="22" alt="" /> Tech stack</h2>

- **Mobile:** React Native (Expo) and TypeScript, with a custom development build for native features
- **Backend:** Node.js, Express, and MongoDB (Mongoose)
- **Auth:** JWT access and refresh tokens, plus Google and Apple sign-in
- **AI:** GitHub Models as the primary provider, with an automatic Gemini fallback
- **Email:** Brevo for verification and password-reset codes
- **Hosting:** Render for the API, MongoDB Atlas for data

<h2><img src="assets/readme/sailboat.svg" height="22" alt="" /> Getting started</h2>

Anchor uses a custom development build rather than Expo Go, because it relies on native modules for NFC, Screen Time, and Live Activities.

**Backend**
```bash
cd backend
cp .env.example .env   # then fill in the values
npm install
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npx expo start --dev-client
```

The one-time iOS development build setup and the full development workflow live in [CONTRIBUTING.md](./CONTRIBUTING.md). Every environment variable is documented in [`backend/.env.example`](./backend/.env.example).

<h2><img src="assets/readme/waves.svg" height="22" alt="" /> Status</h2>

Anchor is in active development and currently testing on TestFlight. Next up is the public App Store release.
