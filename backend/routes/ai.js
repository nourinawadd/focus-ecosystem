import express from 'express';
import auth from '../middleware/auth.js';
import AIInsight from '../models/AIInsight.js';
import { getOrGenerateInsight } from '../services/aiInsightsService.js';
import { getSuggestion } from '../services/aiSuggestionService.js';

const router = express.Router();

router.use(auth);

function handleAIError(err, res) {
  if (err.code === 'NO_API_KEY') {
    return res.status(503).json({ message: 'AI service not configured', code: err.code });
  }
  if (err.code === 'NOT_ENOUGH_DATA') {
    return res.status(400).json({
      message: err.message,
      code: err.code,
      sessionCount: err.sessionCount,
    });
  }
  if (err.code === 'BAD_JSON') {
    return res.status(502).json({ message: 'AI returned malformed response', code: err.code });
  }
  console.error('AI route error:', err);
  return res.status(500).json({ message: err.message || 'AI service error' });
}

// POST /api/ai/insights/generate - force regenerate
router.post('/insights/generate', async (req, res) => {
  try {
    const { insight, cached } = await getOrGenerateInsight(req.user._id, { force: true });
    res.json({ insight, cached });
  } catch (err) {
    handleAIError(err, res);
  }
});

// GET /api/ai/insights - return latest cached or generate
router.get('/insights', async (req, res) => {
  try {
    // Try to return existing first without forcing generation
    const existing = await AIInsight.findOne({ userId: req.user._id }).sort({ generatedAt: -1 });

    if (existing) {
      // Check if it's still fresh (under 6 hours) — if so, return as-is
      const ageHours = (Date.now() - new Date(existing.generatedAt).getTime()) / 3600000;
      if (ageHours < 6) {
        return res.json({ insight: existing, cached: true });
      }
    }

    // No existing or stale — try to generate new one
    try {
      const { insight, cached } = await getOrGenerateInsight(req.user._id);
      res.json({ insight, cached });
    } catch (genErr) {
      // If can't generate (not enough data) but we have an old one, return the old one
      if (genErr.code === 'NOT_ENOUGH_DATA' && existing) {
        return res.json({ insight: existing, cached: true, stale: true });
      }
      // If no insight exists at all and can't generate, return 204
      if (genErr.code === 'NOT_ENOUGH_DATA' && !existing) {
        return res.status(204).end();
      }
      throw genErr;
    }
  } catch (err) {
    handleAIError(err, res);
  }
});

// GET /api/ai/suggestion - lightweight Dashboard tip
router.get('/suggestion', async (req, res) => {
  try {
    const { suggestion, cached } = await getSuggestion(req.user._id);
    res.json({ suggestion, cached });
  } catch (err) {
    if (err.code === 'NOT_ENOUGH_DATA') {
      return res.status(204).end();
    }
    handleAIError(err, res);
  }
});

export default router;