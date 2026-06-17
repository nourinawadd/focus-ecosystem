// backend/config/llm.js
// Provider-agnostic LLM client. Talks to any OpenAI-compatible chat-completions
// endpoint (GitHub Models, Azure OpenAI, Groq, Mistral, …) selected entirely by
// env, and falls back to Gemini (config/gemini.js) when the primary provider
// fails or is rate-limited — so AI features degrade to the second free quota
// pool instead of erroring.
//
//   LLM_API_KEY    primary provider key (GitHub PAT for GitHub Models).
//                  Unset → all calls go straight to Gemini (legacy behavior).
//   LLM_BASE_URL   default https://models.github.ai/inference
//   LLM_MODEL      default openai/gpt-4.1-mini
//
// Services should import from this module, not from gemini.js.
import {
  generate as geminiGenerate,
  generateJSON as geminiGenerateJSON,
  isGeminiConfigured,
  INSIGHT_SCHEMA as GEMINI_INSIGHT_SCHEMA,
} from './gemini.js';

const DEFAULT_BASE_URL = 'https://models.github.ai/inference';
const DEFAULT_MODEL    = 'openai/gpt-4.1-mini';

// Env is read at call time (not module load) so tests and key rotations on
// Render don't depend on import order.
function primaryConfig() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model:   process.env.LLM_MODEL || DEFAULT_MODEL,
  };
}

export function isLLMConfigured() {
  return Boolean(primaryConfig()) || isGeminiConfigured();
}

// ─── Primary-provider health (surfaced via GET /api/health) ──────────────────
// The Gemini fallback hides primary failures from users, so track them here.
// A monotonic sequence (not timestamps) decides ok/failing: two events in the
// same millisecond would otherwise be ambiguous.
let eventSeq = 0;
let lastSuccess  = null;   // { seq, at }
let lastFallback = null;   // { seq, at, reason }
let fallbackCount = 0;

function recordPrimarySuccess() {
  lastSuccess = { seq: ++eventSeq, at: new Date() };
}

function recordFallback(err) {
  const reason = String(err.status ?? err.code ?? err.name ?? 'error');
  lastFallback = { seq: ++eventSeq, at: new Date(), reason };
  fallbackCount++;
  console.warn(`[llm] primary provider failed (${reason}), falling back to Gemini`);
}

export function getLLMStatus() {
  const primary = !primaryConfig()
    ? 'unconfigured'
    : (lastFallback && (!lastSuccess || lastFallback.seq > lastSuccess.seq))
      ? 'failing'
      : 'ok';
  return {
    primary,
    fallbackCount,
    lastFallbackAt:       lastFallback?.at     ?? null,
    lastFallbackReason:   lastFallback?.reason ?? null,
    lastPrimarySuccessAt: lastSuccess?.at      ?? null,
  };
}

// ─── OpenAI-compatible chat completion ───────────────────────────────────────
async function chatCompletion({ prompt, temperature, maxTokens, responseFormat, timeoutMs }) {
  const cfg = primaryConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model:       cfg.model,
        messages:    [{ role: 'user', content: prompt }],
        temperature,
        max_tokens:  maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message ?? ''; } catch { /* non-JSON body */ }
      const err = new Error(`LLM request failed (${res.status})${detail ? `: ${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw Object.assign(new Error('Empty LLM response'), { code: 'BAD_JSON' });
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Plain text (e.g. suggestion tips) ───────────────────────────────────────
export async function generate(prompt, { timeoutMs = 30000 } = {}) {
  if (!primaryConfig()) return geminiGenerate(prompt, { timeoutMs });

  try {
    const text = await chatCompletion({
      prompt,
      temperature: 0.4,
      maxTokens:   512,
      timeoutMs,
    });
    recordPrimarySuccess();
    return text;
  } catch (err) {
    if (!isGeminiConfigured()) throw err;
    recordFallback(err);
    return geminiGenerate(prompt, { timeoutMs });
  }
}

// ─── JSON generation ──────────────────────────────────────────────────────────
// `schema` is a provider pair (see INSIGHT_SCHEMA below): the OpenAI shape is
// enforced server-side with strict structured outputs, so fields can't be
// missing or mistyped; the Gemini shape is used on the fallback path.
export async function generateJSON(prompt, schema = null, { timeoutMs = 30000 } = {}) {
  if (!primaryConfig()) return geminiGenerateJSON(prompt, schema?.gemini ?? null, { timeoutMs });

  try {
    const raw = await chatCompletion({
      prompt,
      temperature: 0.1,
      maxTokens:   1024,
      timeoutMs,
      responseFormat: schema?.openai
        ? { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.openai } }
        : { type: 'json_object' },
    });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('LLM returned invalid JSON'), { code: 'BAD_JSON', raw });
    }
    recordPrimarySuccess();
    return parsed;
  } catch (err) {
    if (!isGeminiConfigured()) throw err;
    recordFallback(err);
    return geminiGenerateJSON(prompt, schema?.gemini ?? null, { timeoutMs });
  }
}

// ─── Schema for AI Insights (used in aiInsightsService.js) ───────────────────
// OpenAI strict mode only supports a JSON-schema subset: every property must be
// required and every object needs additionalProperties:false. Range clamping
// (hours 0-23 etc.) stays in validateAndClamp.
export const INSIGHT_SCHEMA = {
  name: 'focus_insight',
  openai: {
    type: 'object',
    additionalProperties: false,
    properties: {
      bestProductiveHour: { type: 'integer' },
      optimalDuration:    { type: 'integer' },
      suggestedSchedule: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            day:             { type: 'string' },
            startHour:       { type: 'integer' },
            durationMinutes: { type: 'integer' },
            confidence:      { type: 'number' },
            categoryName:    { type: 'string' },
          },
          required: ['day', 'startHour', 'durationMinutes', 'confidence', 'categoryName'],
        },
      },
      distractionRisk: {
        type: 'object',
        additionalProperties: false,
        properties: {
          score:   { type: 'integer' },
          level:   { type: 'string', enum: ['low', 'medium', 'high'] },
          factors: { type: 'array', items: { type: 'string' } },
        },
        required: ['score', 'level', 'factors'],
      },
      insightText: { type: 'string' },
    },
    required: ['bestProductiveHour', 'optimalDuration', 'suggestedSchedule', 'distractionRisk', 'insightText'],
  },
  gemini: GEMINI_INSIGHT_SCHEMA,
};
