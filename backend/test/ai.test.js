import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock the LLM wrapper so AI tests never touch the network or need a key.
// We control configuration + responses per test. Hoisted above the imports.
vi.mock('../config/llm.js', () => ({
  isLLMConfigured: vi.fn(() => true),
  generate:        vi.fn(),
  generateJSON:    vi.fn(),
  INSIGHT_SCHEMA:  {},
}));

import { createApp } from '../app.js';
import { isLLMConfigured, generate, generateJSON } from '../config/llm.js';
import AIInsight from '../models/AIInsight.js';

const app = createApp();

let seq = 0;
async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'AI User', email: `ai-${seq++}@example.test`, password: 'sup3rsecret' });
  return { token: reg.body.accessToken, userId: reg.body.user.id };
}

// Create N completed sessions today so buildUserProfile has enough data.
async function seedCompleted(token, n) {
  const today = new Date().toISOString().slice(0, 10);
  const cats = await request(app).get('/api/user/categories')
    .set('Authorization', `Bearer ${token}`);
  const categoryId = cats.body[0].id;
  for (let i = 0; i < n; i++) {
    const created = await request(app).post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId, timerMode: 'COUNTDOWN', timerConfig: { plannedDuration: 25 },
              dateStr: today, startedAt: new Date().toISOString() });
    await request(app).patch(`/api/sessions/${created.body.id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', timerState: { actualDuration: 25 } });
  }
}

const VALID_AI = {
  bestProductiveHour: 9,
  optimalDuration:    30,
  suggestedSchedule:  Array.from({ length: 7 }, (_, i) => ({
    day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i],
    startHour: 9, durationMinutes: 30, confidence: 0.8, task: 'General Focus',
  })),
  distractionRisk: { score: 20, level: 'low', factors: ['evening scrolling'] },
  insightText:     'You focus best in the morning — protect your 9am block.',
};

beforeEach(() => {
  vi.clearAllMocks();
  isLLMConfigured.mockReturnValue(true);
});

describe('GET /api/ai/insights', () => {
  it('returns a fresh (<6h) cached insight without calling the LLM', async () => {
    const { token, userId } = await makeUser();
    await AIInsight.create({ userId, insightText: 'fresh', bestProductiveHour: 8, generatedAt: new Date() });

    const res = await request(app).get('/api/ai/insights').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.insight.insightText).toBe('fresh');
    expect(generateJSON).not.toHaveBeenCalled();
  });

  it('falls back to a stale insight when there is not enough data to regenerate', async () => {
    const { token, userId } = await makeUser();
    await AIInsight.create({
      userId, insightText: 'old', bestProductiveHour: 8,
      generatedAt: new Date(Date.now() - 7 * 3600 * 1000),   // 7h → stale
    });

    const res = await request(app).get('/api/ai/insights').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.insight.insightText).toBe('old');
  });

  it('reports progress when there is no insight and not enough data', async () => {
    const { token } = await makeUser();
    const res = await request(app).get('/api/ai/insights').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.insight).toBe(null);
    expect(res.body.needsMoreData).toBe(true);
    expect(res.body.sessionCount).toBe(0);
    expect(res.body.sessionsNeeded).toBe(3);
  });

  it('returns 503 when the AI service is not configured', async () => {
    isLLMConfigured.mockReturnValue(false);
    const { token } = await makeUser();
    const res = await request(app).get('/api/ai/insights').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });
});

describe('POST /api/ai/insights/generate', () => {
  it('force-generates and persists an insight from session data', async () => {
    const { token } = await makeUser();
    await seedCompleted(token, 3);
    generateJSON.mockResolvedValue(VALID_AI);

    const res = await request(app).post('/api/ai/insights/generate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(generateJSON).toHaveBeenCalledOnce();
    expect(res.body.insight.bestProductiveHour).toBe(9);
    expect(res.body.insight.insightText).toContain('morning');
  });

  it('returns 400 with sessionCount when there is not enough data', async () => {
    const { token } = await makeUser();
    await seedCompleted(token, 1);   // below the 3-session minimum
    const res = await request(app).post('/api/ai/insights/generate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_ENOUGH_DATA');
    expect(res.body.sessionCount).toBe(1);
  });
});

describe('GET /api/ai/suggestion', () => {
  it('returns a tip when there is enough recent data', async () => {
    const { token } = await makeUser();
    await seedCompleted(token, 3);
    generate.mockResolvedValue('Try a 25-minute morning block before email.');

    const res = await request(app).get('/api/ai/suggestion').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toContain('morning');
  });

  it('returns 204 when there is not enough data', async () => {
    const { token } = await makeUser();
    const res = await request(app).get('/api/ai/suggestion').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
