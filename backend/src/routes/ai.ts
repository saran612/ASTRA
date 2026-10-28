import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { aiClient } from '../services/ai-client.js';
import { requireAuth } from '../middlewares/auth.js';

export function createAiRouter(_prisma: PrismaClient) {
  const router = Router();

  // All AI routes require authenticated session
  router.use(requireAuth);

  // Health check for AI subsystem
  router.get('/health', async (_req, res) => {
    const isUp = await aiClient.isHealthy();
    res.json({
      status: isUp ? 'online' : 'offline',
      notice: isUp ? undefined : 'AI assistance unavailable; manual scrutiny required',
    });
  });

  // Extract OCR metadata from document text
  router.post('/ocr', async (req, res) => {
    const { textContent, filename } = req.body;
    if (!textContent || typeof textContent !== 'string') {
      return res.status(400).json({ error: 'textContent string is required' });
    }
    const result = await aiClient.extractOcr(textContent, filename || '');
    return res.json(result);
  });

  // Query Approval Process Handbook clauses (zero-hallucination RAG)
  router.post('/rag', async (req, res) => {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query string is required' });
    }
    const result = await aiClient.queryHandbook(query);
    return res.json(result);
  });

  // Predict SLA breach risk for FDR
  router.post('/risk', async (req, res) => {
    const { daysRemaining, revertCount, discrepancyCount, daysInScrutiny, amount } = req.body;
    const result = await aiClient.predictSlaRisk({
      daysRemaining: typeof daysRemaining === 'number' ? daysRemaining : undefined,
      revertCount: typeof revertCount === 'number' ? revertCount : undefined,
      discrepancyCount: typeof discrepancyCount === 'number' ? discrepancyCount : undefined,
      daysInScrutiny: typeof daysInScrutiny === 'number' ? daysInScrutiny : undefined,
      amount: typeof amount === 'number' ? amount : undefined,
    });
    return res.json(result);
  });

  return router;
}
