import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let client = null;
if (apiKey) {
  client = new GoogleGenerativeAI(apiKey);
}

export function isGeminiConfigured() {
  return Boolean(client);
}

export async function generate(prompt, { maxRetries = 2, timeoutMs = 30000 } = {}) {
  if (!client) {
    const err = new Error('Gemini API key not configured');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const model = client.getGenerativeModel({ model: modelName });

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      const status = err.status || err.statusCode;
      const transient = !status || status >= 500 || err.name === 'AbortError';
      if (!transient || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function generateJSON(prompt, opts) {
  const raw = await generate(prompt, opts);
  let text = raw.trim();

  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to recover: find first { and last }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {}
    }
    const err = new Error('Gemini returned invalid JSON');
    err.code = 'BAD_JSON';
    err.raw = raw;
    throw err;
  }
}