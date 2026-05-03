import Session from '../models/Session.js';
import { generate, isGeminiConfigured } from '../config/gemini.js';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map(); // userId -> { suggestion, expiresAt }

const MIN_SESSIONS = 3;

export function invalidateSuggestion(userId) {
  cache.delete(String(userId));
}

function buildSuggestionPrompt(stats) {
  return `You are a friendly productivity coach. Based on this user's recent focus data, give them ONE short, actionable tip for their next session.

Recent stats:
- Sessions in last 7 days: ${stats.recentSessions}
- Average session length: ${stats.avgMinutes} minutes
- Average focus score: ${stats.avgScore}/100
- Best hour of day: ${stats.bestHour}:00
- Current hour: ${stats.currentHour}:00

Respond with 1-2 sentences only. Be encouraging and specific. No greetings, no markdown, just the tip.`;
}

async function buildLightStats(userId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const sessions = await Session.find({
    userId,
    status: 'COMPLETED',
    startedAt: { $gte: sevenDaysAgo },
  }).lean();

  if (sessions.length < MIN_SESSIONS) {
    return { enoughData: false, sessionCount: sessions.length };
  }

  let totalMinutes = 0;
  let totalScore = 0;
  let scoreCount = 0;
  const hourly = Array(24).fill(0);

  for (const s of sessions) {
    const mins = s.timerState?.actualDuration || s.timerConfig?.plannedDuration || 0;
    totalMinutes += mins;
    if (typeof s.focusScore === 'number') {
      totalScore += s.focusScore;
      scoreCount++;
    }
    const h = new Date(s.startedAt).getHours();
    hourly[h] += mins;
  }

  let bestHour = 9;
  let bestMins = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h] > bestMins) {
      bestMins = hourly[h];
      bestHour = h;
    }
  }

  return {
    enoughData: true,
    recentSessions: sessions.length,
    avgMinutes: Math.round(totalMinutes / sessions.length),
    avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    bestHour,
    currentHour: new Date().getHours(),
  };
}

export async function getSuggestion(userId) {
  if (!isGeminiConfigured()) {
    const err = new Error('AI service not configured');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const key = String(userId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { suggestion: cached.suggestion, cached: true };
  }

  const stats = await buildLightStats(userId);
  if (!stats.enoughData) {
    const err = new Error(`Need at least ${MIN_SESSIONS} sessions (have ${stats.sessionCount})`);
    err.code = 'NOT_ENOUGH_DATA';
    err.sessionCount = stats.sessionCount;
    throw err;
  }

  const prompt = buildSuggestionPrompt(stats);
  const raw = await generate(prompt);
  const suggestion = raw.trim().replace(/^["']|["']$/g, '').slice(0, 280);

  cache.set(key, {
    suggestion,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { suggestion, cached: false };
}