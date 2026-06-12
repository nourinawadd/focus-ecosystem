// Live eval for the AI-insights prompt + model: feeds synthetic user profiles
// through the REAL buildPrompt() and the REAL provider, then sanity-checks the
// raw (pre-clamp) answers. Catches model regressions and prompt drift that the
// mocked unit tests can't see, and fails loudly if the key/quota is dead.
//
// Run from backend/:  npm run ai:eval     (≈6 requests of the daily quota)
//
// LLM answers are mildly nondeterministic, so checks assert ranges and
// properties, never exact values.
import { generateJSON, INSIGHT_SCHEMA, getLLMStatus, isLLMConfigured } from '../config/llm.js';
import { buildPrompt } from '../services/aiInsightsService.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Build a profile shaped exactly like buildUserProfile()'s output.
function profile({ hours = {}, weekdays = {}, distractions = [], avgScore = 75,
                   sessionCount = 20, pomodoroCount = 0 }) {
  const hourly = Array(24).fill(0);
  for (const [h, mins] of Object.entries(hours)) hourly[Number(h)] = mins;
  const weekday = Array(7).fill(0);
  for (const [d, mins] of Object.entries(weekdays)) weekday[DAYS.indexOf(d)] = mins;
  return {
    enoughData: true,
    sessionCount,
    totalMinutes: hourly.reduce((a, b) => a + b, 0),
    avgScore,
    hourly,
    weekday,
    pomodoroCount,
    countdownCount: sessionCount - pomodoroCount,
    topDistractions: distractions,
  };
}

const PERSONAS = [
  {
    name: 'morning person (peak 8-10am, weekdays)',
    profile: profile({
      hours:    { 8: 300, 9: 420, 10: 280, 14: 60 },
      weekdays: { Monday: 240, Tuesday: 220, Wednesday: 200, Thursday: 220, Friday: 180 },
      avgScore: 82,
    }),
    checks: (ai) => [
      ['best hour is in the morning (7-11)', ai.bestProductiveHour >= 7 && ai.bestProductiveHour <= 11,
        `got ${ai.bestProductiveHour}`],
      ['risk not high for a clean 82-score user', ai.distractionRisk.level !== 'high',
        `got ${ai.distractionRisk.level}`],
    ],
  },
  {
    name: 'night owl (peak 10pm-1am)',
    profile: profile({
      hours:    { 22: 350, 23: 400, 0: 300, 1: 150 },
      weekdays: { Monday: 200, Wednesday: 300, Friday: 250, Saturday: 450 },
      avgScore: 70,
    }),
    checks: (ai) => [
      ['best hour is in the late-night block (21-02)',
        ai.bestProductiveHour >= 21 || ai.bestProductiveHour <= 2,
        `got ${ai.bestProductiveHour}`],
    ],
  },
  {
    name: 'distraction-heavy user (Instagram 42x, TikTok 28x, score 44)',
    profile: profile({
      hours:        { 15: 200, 16: 250, 20: 180 },
      weekdays:     { Monday: 150, Tuesday: 180, Saturday: 300 },
      distractions: [{ name: 'Instagram', count: 42 }, { name: 'TikTok', count: 28 },
                     { name: 'YouTube', count: 11 }],
      avgScore: 44,
    }),
    checks: (ai) => [
      ['risk level is not low', ai.distractionRisk.level !== 'low', `got ${ai.distractionRisk.level}`],
      ['risk score >= 40', ai.distractionRisk.score >= 40, `got ${ai.distractionRisk.score}`],
      ['at least one risk factor named', ai.distractionRisk.factors.length >= 1,
        `got ${JSON.stringify(ai.distractionRisk.factors)}`],
    ],
  },
  {
    name: 'clean focused user (no distractions, score 93, pomodoro)',
    profile: profile({
      hours:         { 9: 250, 10: 300, 11: 200 },
      weekdays:      { Monday: 150, Tuesday: 150, Wednesday: 150, Thursday: 150, Friday: 150 },
      avgScore:      93,
      pomodoroCount: 18,
    }),
    checks: (ai) => [
      ['risk level is not high', ai.distractionRisk.level !== 'high', `got ${ai.distractionRisk.level}`],
      ['risk score <= 60', ai.distractionRisk.score <= 60, `got ${ai.distractionRisk.score}`],
    ],
  },
  {
    name: 'weekend-only user (all minutes Sat/Sun)',
    profile: profile({
      hours:    { 11: 300, 12: 250, 16: 200 },
      weekdays: { Saturday: 400, Sunday: 350 },
      avgScore: 78,
      sessionCount: 12,
    }),
    checks: (ai) => {
      const weekendSlots = ai.suggestedSchedule.filter(s => s.day === 'Saturday' || s.day === 'Sunday');
      return [
        ['majority of suggested days are Sat/Sun',
          weekendSlots.length * 2 >= ai.suggestedSchedule.length,
          `got days ${JSON.stringify(ai.suggestedSchedule.map(s => s.day))}`],
      ];
    },
  },
  {
    name: 'minimum-data user (exactly 3 sessions, one hour of day)',
    profile: profile({
      hours:    { 19: 75 },
      weekdays: { Tuesday: 50, Thursday: 25 },
      avgScore: 68,
      sessionCount: 3,
    }),
    checks: (ai) => [
      ['best hour tracks the only active hour (17-21)',
        ai.bestProductiveHour >= 17 && ai.bestProductiveHour <= 21,
        `got ${ai.bestProductiveHour}`],
      ['optimal duration is sane (15-120)',
        ai.optimalDuration >= 15 && ai.optimalDuration <= 120,
        `got ${ai.optimalDuration}`],
    ],
  },
];

// Shape/quality checks applied to every persona on top of its specific ones.
function universalChecks(ai) {
  return [
    ['2-5 schedule entries', ai.suggestedSchedule.length >= 2 && ai.suggestedSchedule.length <= 5,
      `got ${ai.suggestedSchedule.length}`],
    ['schedule days are valid day names', ai.suggestedSchedule.every(s => DAYS.includes(s.day)),
      `got ${JSON.stringify(ai.suggestedSchedule.map(s => s.day))}`],
    ['schedule hours within 0-23', ai.suggestedSchedule.every(s => s.startHour >= 0 && s.startHour <= 23),
      `got ${JSON.stringify(ai.suggestedSchedule.map(s => s.startHour))}`],
    ['insightText is substantial (>40 chars)', (ai.insightText ?? '').length > 40,
      `got ${(ai.insightText ?? '').length} chars`],
  ];
}

if (!isLLMConfigured()) {
  console.error('No LLM configured — set LLM_API_KEY (and/or GEMINI_API_KEY) in backend/.env');
  process.exit(1);
}

console.log(`Evaluating ${PERSONAS.length} personas against ${process.env.LLM_MODEL || 'openai/gpt-4.1-mini (default)'}…\n`);

let failures = 0;
for (const persona of PERSONAS) {
  let ai;
  try {
    ai = await generateJSON(buildPrompt(persona.profile), INSIGHT_SCHEMA);
  } catch (err) {
    console.log(`✗ ${persona.name}\n    REQUEST FAILED: ${err.message}\n`);
    failures++;
    continue;
  }

  const results = [...persona.checks(ai), ...universalChecks(ai)];
  const failed = results.filter(([, pass]) => !pass);
  console.log(`${failed.length ? '✗' : '✓'} ${persona.name}`);
  for (const [label, pass, detail] of results) {
    console.log(`    ${pass ? '✓' : '✗ FAIL'} ${label}${pass ? '' : ` — ${detail}`}`);
  }
  if (failed.length) failures++;
  console.log(`    insight: "${ai.insightText}"\n`);
}

const status = getLLMStatus();
if (status.fallbackCount > 0) {
  console.log(`⚠ ${status.fallbackCount} call(s) fell back to Gemini (last reason: ${status.lastFallbackReason}) — results above may not reflect the primary model.\n`);
}

console.log(failures === 0
  ? `All ${PERSONAS.length} personas passed.`
  : `${failures}/${PERSONAS.length} personas had failures.`);
process.exit(failures === 0 ? 0 : 1);
