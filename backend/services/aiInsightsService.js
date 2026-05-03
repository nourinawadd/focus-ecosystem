import Session from '../models/Session.js';
import FocusLog from '../models/FocusLog.js';
import AIInsight from '../models/AIInsight.js';
import { generateJSON, isGeminiConfigured } from '../config/gemini.js';

const CACHE_HOURS = 6;
const MIN_SESSIONS = 3;

function clampNumber(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function clampString(s, max, fallback = '') {
  if (typeof s !== 'string') return fallback;
  return s.slice(0, max);
}

async function buildUserProfile(userId) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sessions = await Session.find({
    userId,
    status: 'COMPLETED',
    startedAt: { $gte: since },
  }).lean();

  if (sessions.length < MIN_SESSIONS) {
    return { enoughData: false, sessionCount: sessions.length };
  }

  // Hourly distribution (0-23)
  const hourly = Array(24).fill(0);
  const weekday = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat minutes

  let totalMinutes = 0;
  let totalScore = 0;
  let scoreCount = 0;
  let pomodoroCount = 0;
  let countdownCount = 0;

  for (const s of sessions) {
    const start = new Date(s.startedAt);
    const h = start.getHours();
    const dow = start.getDay();
    const mins = s.timerState?.actualDuration || s.timerConfig?.plannedDuration || 0;

    hourly[h] += mins;
    weekday[dow] += mins;
    totalMinutes += mins;

    if (typeof s.focusScore === 'number') {
      totalScore += s.focusScore;
      scoreCount++;
    }

    if (s.timerMode === 'POMODORO') pomodoroCount++;
    else countdownCount++;
  }

  // Top distractions from focus logs
  const logs = await FocusLog.find({
    userId,
    event: { $in: ['APP_BLOCKED', 'DISTRACTION'] },
    timestamp: { $gte: since },
  }).lean();

  const distractionMap = {};
  for (const l of logs) {
    const app = l.metadata?.appName || l.metadata?.packageName || 'unknown';
    distractionMap[app] = (distractionMap[app] || 0) + 1;
  }
  const topDistractions = Object.entries(distractionMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    enoughData: true,
    sessionCount: sessions.length,
    totalMinutes,
    avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : null,
    hourly,
    weekday,
    pomodoroCount,
    countdownCount,
    topDistractions,
  };
}

function buildPrompt(profile) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `You are a productivity coach AI analyzing a user's focus session data from the last 30 days.

USER PROFILE:
- Total completed sessions: ${profile.sessionCount}
- Total focused minutes: ${profile.totalMinutes}
- Average focus score: ${profile.avgScore ?? 'N/A'}/100
- Pomodoro sessions: ${profile.pomodoroCount}
- Countdown sessions: ${profile.countdownCount}

HOURLY ACTIVITY (minutes focused per hour of day, 0-23):
${profile.hourly.map((m, h) => `  ${String(h).padStart(2, '0')}:00 -> ${m} min`).join('\n')}

WEEKDAY ACTIVITY (minutes focused per day):
${profile.weekday.map((m, i) => `  ${dayNames[i]}: ${m} min`).join('\n')}

TOP DISTRACTIONS:
${profile.topDistractions.length > 0
  ? profile.topDistractions.map(d => `  - ${d.name}: ${d.count} times`).join('\n')
  : '  (none recorded)'}

Based on this data, return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "bestProductiveHour": <integer 0-23>,
  "optimalDuration": <integer minutes, 15-120>,
  "suggestedSchedule": [
    { "day": "<day name>", "startHour": <0-23>, "durationMinutes": <integer>, "confidence": <0-1 float> }
  ],
  "distractionRisk": {
    "score": <integer 0-100>,
    "level": "<low|medium|high>",
    "factors": ["<short factor 1>", "<short factor 2>"]
  },
  "insightText": "<2-3 sentence personalized insight>"
}

Return between 2 and 5 schedule entries. Keep insightText under 280 characters.`;
}

function validateAndClamp(ai) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const bestProductiveHour = clampNumber(ai.bestProductiveHour, 0, 23, 9);
  const optimalDuration = clampNumber(ai.optimalDuration, 15, 120, 25);

  let schedule = [];
  if (Array.isArray(ai.suggestedSchedule)) {
    schedule = ai.suggestedSchedule.slice(0, 5).map(s => ({
      day: dayNames.includes(s.day) ? s.day : 'Monday',
      startHour: clampNumber(s.startHour, 0, 23, 9),
      durationMinutes: clampNumber(s.durationMinutes, 15, 120, 25),
      confidence: clampNumber(s.confidence, 0, 1, 0.5),
    }));
  }

  const risk = ai.distractionRisk || {};
  const validLevels = ['low', 'medium', 'high'];
  const distractionRisk = {
    score: clampNumber(risk.score, 0, 100, 50),
    level: validLevels.includes(risk.level) ? risk.level : 'medium',
    factors: Array.isArray(risk.factors)
      ? risk.factors.slice(0, 5).map(f => clampString(f, 100))
      : [],
  };

  const insightText = clampString(ai.insightText, 500, 'Keep up the focus work!');

  return { bestProductiveHour, optimalDuration, suggestedSchedule: schedule, distractionRisk, insightText };
}

export async function getOrGenerateInsight(userId, { force = false } = {}) {
  if (!isGeminiConfigured()) {
    const err = new Error('AI service not configured');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // Check cache
  if (!force) {
    const existing = await AIInsight.findOne({ userId }).sort({ generatedAt: -1 });
    if (existing) {
      const ageHours = (Date.now() - new Date(existing.generatedAt).getTime()) / 3600000;
      if (ageHours < CACHE_HOURS) {
        return { insight: existing, cached: true };
      }
    }
  }

  const profile = await buildUserProfile(userId);
  if (!profile.enoughData) {
    const err = new Error(`Need at least ${MIN_SESSIONS} completed sessions (have ${profile.sessionCount})`);
    err.code = 'NOT_ENOUGH_DATA';
    err.sessionCount = profile.sessionCount;
    throw err;
  }

  const prompt = buildPrompt(profile);
  const aiResponse = await generateJSON(prompt);
  const validated = validateAndClamp(aiResponse);

  const insight = await AIInsight.create({
    userId,
    ...validated,
    generatedAt: new Date(),
  });

  return { insight, cached: false };
}