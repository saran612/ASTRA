import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createAuthRouter } from './routes/auth.js';

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

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
