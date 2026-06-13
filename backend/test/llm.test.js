import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Gemini layer so we can observe fallback behavior without a network.
vi.mock('../config/gemini.js', () => ({
  isGeminiConfigured: vi.fn(() => true),
  generate:           vi.fn(),
  generateJSON:       vi.fn(),
  INSIGHT_SCHEMA:     { mocked: 'gemini-schema' },
}));

import {
  generate, generateJSON, isLLMConfigured, getLLMStatus, INSIGHT_SCHEMA,
} from '../config/llm.js';
import {
  isGeminiConfigured,
  generate as geminiGenerate,
  generateJSON as geminiGenerateJSON,
} from '../config/gemini.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const okResponse = (content) => ({
  ok: true, status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
});
const errResponse = (status, message = 'nope') => ({
  ok: false, status,
  json: async () => ({ error: { message } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  isGeminiConfigured.mockReturnValue(true);
  process.env.LLM_API_KEY = 'test-pat';
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
});

afterEach(() => {
  delete process.env.LLM_API_KEY;
});

describe('isLLMConfigured', () => {
  it('is true with only the primary key, only Gemini, or both', () => {
    expect(isLLMConfigured()).toBe(true);            // both
    delete process.env.LLM_API_KEY;
    expect(isLLMConfigured()).toBe(true);            // Gemini only
    isGeminiConfigured.mockReturnValue(false);
    expect(isLLMConfigured()).toBe(false);           // neither
    process.env.LLM_API_KEY = 'test-pat';
    expect(isLLMConfigured()).toBe(true);            // primary only
  });
});

describe('generate', () => {
  it('uses the primary provider and never touches Gemini on success', async () => {
    fetchMock.mockResolvedValue(okResponse('a tip'));

    const out = await generate('prompt here');
    expect(out).toBe('a tip');
    expect(geminiGenerate).not.toHaveBeenCalled();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://models.github.ai/inference/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer test-pat');
    expect(JSON.parse(opts.body).model).toBe('openai/gpt-4.1-mini');
  });

  it('honors LLM_BASE_URL (trailing slash stripped) and LLM_MODEL overrides', async () => {
    process.env.LLM_BASE_URL = 'https://example.test/v1/';
    process.env.LLM_MODEL    = 'some/other-model';
    fetchMock.mockResolvedValue(okResponse('x'));

    await generate('p');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(JSON.parse(opts.body).model).toBe('some/other-model');
  });

  it('falls back to Gemini when the primary is rate-limited (429)', async () => {
    fetchMock.mockResolvedValue(errResponse(429, 'rate limited'));
    geminiGenerate.mockResolvedValue('gemini tip');

    const out = await generate('prompt here');
    expect(out).toBe('gemini tip');
    expect(geminiGenerate).toHaveBeenCalledWith('prompt here', expect.anything());
  });

  it('falls back to Gemini on network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    geminiGenerate.mockResolvedValue('gemini tip');

    await expect(generate('p')).resolves.toBe('gemini tip');
  });

  it('rethrows the primary error when Gemini is not configured', async () => {
    isGeminiConfigured.mockReturnValue(false);
    fetchMock.mockResolvedValue(errResponse(500));

    await expect(generate('p')).rejects.toMatchObject({ status: 500 });
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it('goes straight to Gemini when LLM_API_KEY is unset', async () => {
    delete process.env.LLM_API_KEY;
    geminiGenerate.mockResolvedValue('gemini tip');

    await expect(generate('p')).resolves.toBe('gemini tip');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generateJSON', () => {
  it('sends a strict json_schema response_format and parses the reply', async () => {
    fetchMock.mockResolvedValue(okResponse('{"bestProductiveHour":9}'));

    const out = await generateJSON('p', INSIGHT_SCHEMA);
    expect(out).toEqual({ bestProductiveHour: 9 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('focus_insight');
    expect(body.response_format.json_schema.schema).toEqual(INSIGHT_SCHEMA.openai);
  });

  it('falls back to Gemini (with the Gemini schema) when the primary returns invalid JSON', async () => {
    fetchMock.mockResolvedValue(okResponse('not json at all'));
    geminiGenerateJSON.mockResolvedValue({ from: 'gemini' });

    const out = await generateJSON('p', INSIGHT_SCHEMA);
    expect(out).toEqual({ from: 'gemini' });
    expect(geminiGenerateJSON).toHaveBeenCalledWith('p', INSIGHT_SCHEMA.gemini, expect.anything());
  });

  it('falls back to Gemini on HTTP errors', async () => {
    fetchMock.mockResolvedValue(errResponse(503));
    geminiGenerateJSON.mockResolvedValue({ from: 'gemini' });

    await expect(generateJSON('p', INSIGHT_SCHEMA)).resolves.toEqual({ from: 'gemini' });
  });

  it('goes straight to Gemini when LLM_API_KEY is unset', async () => {
    delete process.env.LLM_API_KEY;
    geminiGenerateJSON.mockResolvedValue({ from: 'gemini' });

    await expect(generateJSON('p', INSIGHT_SCHEMA)).resolves.toEqual({ from: 'gemini' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getLLMStatus', () => {
  it('reports unconfigured without a primary key', () => {
    delete process.env.LLM_API_KEY;
    expect(getLLMStatus().primary).toBe('unconfigured');
  });

  it('flips failing after a fallback and recovers to ok after a success', async () => {
    // Failure → fallback recorded
    fetchMock.mockResolvedValue(errResponse(429));
    geminiGenerate.mockResolvedValue('tip');
    await generate('p');

    let status = getLLMStatus();
    expect(status.primary).toBe('failing');
    expect(status.lastFallbackReason).toBe('429');
    expect(status.lastFallbackAt).toBeInstanceOf(Date);
    const countAfterFailure = status.fallbackCount;
    expect(countAfterFailure).toBeGreaterThan(0);

    // Recovery → ok again, count unchanged
    fetchMock.mockResolvedValue(okResponse('fine'));
    await generate('p');

    status = getLLMStatus();
    expect(status.primary).toBe('ok');
    expect(status.fallbackCount).toBe(countAfterFailure);
    expect(status.lastPrimarySuccessAt).toBeInstanceOf(Date);
  });
});
