// ─── User profile & preferences ───────────────────────────────────────────────
// Single source of truth for the authenticated user.
// Read from nav.user; update via nav.updateUser() anywhere in the app.

export type UserProfile = {
  name: string;
  email: string;

  // ── Goals (drive progress bars on Dashboard & health score in Analytics) ──
  dailyGoalMinutes: number;    // target focus minutes per day  (default 120 = 2 h)
  weeklyGoalMinutes: number;   // target focus minutes per week (default 600 = 10 h)

  // ── Session defaults (pre-fill CreateSession screen) ─────────────────────
  preferredDuration: number;   // minutes, e.g. 25
  pomodoroEnabled: boolean;    // pre-check the Pomodoro toggle

  // ── Preferences ───────────────────────────────────────────────────────────
  notificationsEnabled: boolean;
};

export const DEFAULT_USER: UserProfile = {
  name: 'User',
  email: '',
  dailyGoalMinutes: 120,
  weeklyGoalMinutes: 600,
  preferredDuration: 25,
  pomodoroEnabled: false,
  notificationsEnabled: true,
};

// ─── Goal chip definitions (used by SettingsScreen) ───────────────────────────
export const DAILY_GOAL_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 h',   minutes: 60  },
  { label: '1.5 h', minutes: 90  },
  { label: '2 h',   minutes: 120 },
  { label: '3 h',   minutes: 180 },
  { label: '4 h',   minutes: 240 },
];

export const WEEKLY_GOAL_OPTIONS: { label: string; minutes: number }[] = [
  { label: '5 h',  minutes: 300 },
  { label: '7 h',  minutes: 420 },
  { label: '10 h', minutes: 600 },
  { label: '15 h', minutes: 900 },
];
