import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { Clock } from './services/clock.js';
import { createAuthRouter } from './routes/auth.js';
import { createFdrRouter, createDocumentDownloadRouter } from './routes/fdr.js';
import { createDiscrepancyRouter } from './routes/discrepancies.js';
import { createBankVerificationRouter } from './routes/bank-verification.js';
import { createAdminRouter, createAlertRouter } from './routes/admin.js';
import { createReleaseRouter } from './routes/release.js';
import { createAuditRouter } from './routes/audit.js';
import { createAiRouter } from './routes/ai.js';

export function createApp(prisma: PrismaClient) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Rate limiter on authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  app.use('/api/auth', authLimiter, createAuthRouter(prisma));
  app.use('/api/fdrs', createFdrRouter(prisma));
  app.use('/api/documents', createDocumentDownloadRouter(prisma));
  app.use('/api/discrepancies', createDiscrepancyRouter(prisma));
  app.use('/api/bank-verification', createBankVerificationRouter(prisma));
  app.use('/api/admin', createAdminRouter(prisma));
  app.use('/api/alerts', createAlertRouter(prisma));
  app.use('/api/release', createReleaseRouter(prisma));
  app.use('/api/audit', createAuditRouter(prisma));
  app.use('/api/ai', createAiRouter(prisma));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Clock.now().toISOString() });
  });

  return app;
}
