// ─── Shared session data model & helpers ──────────────────────────────────────
// Single source of truth consumed by HistoryScreen, DashboardScreen,
// ActiveSessionScreen, and SessionCompleteScreen.

// ─── Type ─────────────────────────────────────────────────────────────────────
export type SessionRecord = {
  id: string;
  title: string;        // e.g. "Study Session"
  type: string;         // e.g. "Study" | "Work" | "Custom"
  duration: number;     // actual elapsed minutes
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  focusScore: number | null;
  completed: boolean;
  dateStr: string;      // "YYYY-MM-DD"  (local time, no UTC shift)
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
/** Local YYYY-MM-DD string — avoids toISOString() UTC offset issues */
export function toDateStr(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for n days before today */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

/** Zero-padded "HH:MM" for a given Date */
export function fmtHHMM(d: Date): string {
  return (
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────
/** Consecutive days (from today backwards) that have at least one completed session */
export function computeStreak(sessions: SessionRecord[]): number {
  const done = new Set(sessions.filter(s => s.completed).map(s => s.dateStr));
  const d = new Date();
  let streak = 0;
  while (done.has(toDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Longest ever consecutive-day streak across all completed sessions */
export function computeLongestStreak(sessions: SessionRecord[]): number {
  const sorted = [...new Set(sessions.filter(s => s.completed).map(s => s.dateStr))].sort();
  let max = 0, cur = 0, prev: string | null = null;
  for (const ds of sorted) {
    const diff = prev
      ? Math.round((new Date(ds + 'T12:00:00').getTime() - new Date(prev + 'T12:00:00').getTime()) / 86_400_000)
      : null;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > max) max = cur;
    prev = ds;
  }
  return max;
}

/** Total focus hours from completed sessions, formatted to 1 decimal */
export function computeFocusHours(sessions: SessionRecord[]): string {
  const mins = sessions
    .filter(s => s.completed)
    .reduce((acc, s) => acc + s.duration, 0);
  return (mins / 60).toFixed(1);
}

/** Today's completed focus minutes as a percentage of goalMins (0–100, clamped) */
export function computeDailyProgress(sessions: SessionRecord[], goalMins: number): number {
  const today     = toDateStr(new Date());
  const todayMins = sessions
    .filter(s => s.completed && s.dateStr === today)
    .reduce((acc, s) => acc + s.duration, 0);
  return Math.min(Math.round((todayMins / Math.max(goalMins, 1)) * 100), 100);
}

/** Average focus score of today's completed sessions (0 if none) */
export function computeTodayScore(sessions: SessionRecord[]): number {
  const today = toDateStr(new Date());
  const todayDone = sessions.filter(
    s => s.completed && s.focusScore !== null && s.dateStr === today,
  );
  if (todayDone.length === 0) return 0;
  return Math.round(
    todayDone.reduce((a, s) => a + (s.focusScore ?? 0), 0) / todayDone.length,
  );
}

// ─── Seed data ────────────────────────────────────────────────────────────────
// These are shown on first launch. Real sessions recorded during the current
// app session are prepended to this list via nav.addSession().
export const SEED_SESSIONS: SessionRecord[] = [
  {
    id: 'seed-t1', title: 'Deep Work Block',  type: 'Study',
    duration: 45, startTime: '08:00', endTime: '08:45',
    focusScore: 92, completed: true,  dateStr: daysAgo(0),
  },
  {
    id: 'seed-t2', title: 'Reading Session',  type: 'Study',
    duration: 25, startTime: '10:30', endTime: '10:55',
    focusScore: null, completed: false, dateStr: daysAgo(0),
  },
  {
    id: 'seed-y1', title: 'Project Planning', type: 'Work',
    duration: 60, startTime: '09:00', endTime: '10:00',
    focusScore: 87, completed: true,  dateStr: daysAgo(1),
  },
  {
    id: 'seed-y2', title: 'Research Review',  type: 'Study',
    duration: 30, startTime: '14:00', endTime: '14:30',
    focusScore: 74, completed: true,  dateStr: daysAgo(1),
  },
  {
    id: 'seed-d2', title: 'Morning Focus',    type: 'Work',
    duration: 45, startTime: '07:30', endTime: '08:15',
    focusScore: 89, completed: true,  dateStr: daysAgo(2),
  },
  {
    id: 'seed-d3', title: 'Code Review',      type: 'Work',
    duration: 30, startTime: '11:00', endTime: '11:30',
    focusScore: 81, completed: true,  dateStr: daysAgo(3),
  },
  {
    id: 'seed-d4', title: 'Evening Study',    type: 'Study',
    duration: 50, startTime: '20:00', endTime: '20:50',
    focusScore: 76, completed: true,  dateStr: daysAgo(4),
  },
];
