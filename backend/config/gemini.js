import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'; // added SchemaType

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let client = null;
if (apiKey) {
    client = new GoogleGenerativeAI(apiKey);
}

export function isGeminiConfigured() {
    return Boolean(client);
}

// ─── Plain text (e.g. suggestion tips) ───────────────────────────────────────
export async function generate(prompt, { maxRetries = 2, timeoutMs = 30000 } = {}) {
    if (!client) {
        const err = new Error('Gemini API key not configured');
        err.code = 'NO_API_KEY';
        throw err;
    }

    // FIX 1: set temperature — default ~1.0 causes random/hallucinated values
    const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: 512,
        },
    });

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

// ─── JSON generation ──────────────────────────────────────────────────────────
// FIX 2: responseMimeType forces pure JSON output — no markdown fences, no
//         commentary, no "Here is the JSON:" preamble.
// FIX 3: optional responseSchema lets Gemini validate the shape server-side,
//         so fields are never missing or mis-typed before your code sees them.
export async function generateJSON(prompt, schema = null, { maxRetries = 2, timeoutMs = 30000 } = {}) {
    if (!client) {
        const err = new Error('Gemini API key not configured');
        err.code = 'NO_API_KEY';
        throw err;
    }

    const generationConfig = {
        temperature: 0.1,               // low = deterministic numbers
        topP: 0.8,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json', // ← the most important fix
    };

    if (schema) generationConfig.responseSchema = schema;

    const model = client.getGenerativeModel({ model: modelName, generationConfig });

    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const result = await model.generateContent(prompt);
                const raw = result.response.text().trim();

                if (!raw) throw Object.assign(new Error('Empty response'), { code: 'BAD_JSON' });

                // Defensive strip — shouldn't fire in JSON mode but kept as safety net
                const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

                try {
                    return JSON.parse(clean);
                } catch {
                    const first = clean.indexOf('{');
                    const last = clean.lastIndexOf('}');
                    if (first !== -1 && last > first) {
                        try { return JSON.parse(clean.slice(first, last + 1)); } catch { }
                    }
                    const err = new Error('Gemini returned invalid JSON');
                    err.code = 'BAD_JSON';
                    err.raw = raw;
                    throw err;
                }
            } finally {
                clearTimeout(timer);
            }
        } catch (err) {
            lastErr = err;
            if (err.code === 'BAD_JSON') throw err; // don't retry parse failures
            const status = err.status || err.statusCode;
            const transient = !status || status >= 500 || err.name === 'AbortError';
            if (!transient || attempt === maxRetries) throw err;
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
    }
    throw lastErr;
}

// ─── Schema for AI Insights (used in aiInsightsService.js) ───────────────────
// Pass as second arg to generateJSON() for server-side shape validation.
//
//   import { generateJSON, INSIGHT_SCHEMA } from '../config/gemini.js';
//   const aiResponse = await generateJSON(prompt, INSIGHT_SCHEMA);
//
export const INSIGHT_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        bestProductiveHour: { type: SchemaType.INTEGER },
        optimalDuration: { type: SchemaType.INTEGER },
        suggestedSchedule: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    day: { type: SchemaType.STRING },
                    startHour: { type: SchemaType.INTEGER },
                    durationMinutes: { type: SchemaType.INTEGER },
                    confidence: { type: SchemaType.NUMBER },
                },
                required: ['day', 'startHour', 'durationMinutes', 'confidence'],
            },
        },
        distractionRisk: {
            type: SchemaType.OBJECT,
            properties: {
                score: { type: SchemaType.INTEGER },
                level: { type: SchemaType.STRING },
                factors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            },
            required: ['score', 'level', 'factors'],
        },
        insightText: { type: SchemaType.STRING },
    },
    required: ['bestProductiveHour', 'optimalDuration', 'suggestedSchedule', 'distractionRisk', 'insightText'],
};