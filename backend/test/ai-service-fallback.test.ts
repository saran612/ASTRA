import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { AiClient } from '../src/services/ai-client.js';
import { generateAccessToken } from '../src/services/auth.js';

describe('Milestone 7: AI Service Integration & Graceful Degradation', () => {
  let app: any;
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;
  let officerToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = createApp(prisma);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    officerToken = generateAccessToken({
      userId: 'ai-officer-test-uuid',
      email: 'officer@aicte.gov.in',
      role: 'REGIONAL_OFFICER',
      region: 'NORTH',
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  describe('AiClient Offline Fallback (3-second timeout & resilience)', () => {
    it('returns graceful fallback when AI service is down without throwing errors', async () => {
      // Connect to unreachable port to guarantee connection refused / timeout
      const offlineClient = new AiClient('http://127.0.0.1:59999', 500);

      const isUp = await offlineClient.isHealthy();
      expect(isUp).toBe(false);

      const ocrResult = await offlineClient.extractOcr('MOCK RECEIPT TEXT');
      expect(ocrResult.isOfflineFallback).toBe(true);
      expect(ocrResult.needsHumanReview).toBe(true);
      expect(ocrResult.notice).toContain('AI assistance unavailable; manual scrutiny required');

      const ragResult = await offlineClient.queryHandbook('What is the minimum lock-in period?');
      expect(ragResult.isOfflineFallback).toBe(true);
      expect(ragResult.found).toBe(false);
      expect(ragResult.answer).toContain('consult physical Approval Process Handbook');

      const riskResult = await offlineClient.predictSlaRisk({ daysRemaining: 10 });
      expect(riskResult.isOfflineFallback).toBe(true);
      expect(riskResult.riskCategory).toBe('UNKNOWN');
      expect(riskResult.disclaimer).toContain('Synthetic training data, demo only');
    });
  });

  describe('API Endpoints Graceful Degradation under Authentication', () => {
    it('GET /api/ai/health reports offline status gracefully when service is not running', async () => {
      const res = await fetch(`${baseUrl}/api/ai/health`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(['online', 'offline']).toContain(data.status);
    });

    it('POST /api/ai/ocr returns fallback object and does not 500 when offline', async () => {
      const res = await fetch(`${baseUrl}/api/ai/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          textContent: 'STATE BANK OF INDIA FDR NO: SBI-123456 AMOUNT: RS. 10,00,000',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.needsHumanReview).toBe(true);
    });

    it('POST /api/ai/rag returns fallback without crashing when AI backend is unreachable', async () => {
      const res = await fetch(`${baseUrl}/api/ai/rag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({ query: 'What is the refund clearance checklist?' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.answer).toBeDefined();
    });

    it('POST /api/ai/risk returns synthetic risk predictions or fallback with disclaimer', async () => {
      const res = await fetch(`${baseUrl}/api/ai/risk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          daysRemaining: 12,
          revertCount: 1,
          discrepancyCount: 1,
          daysInScrutiny: 10,
          amount: 1500000,
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.disclaimer).toContain('Synthetic training data, demo only');
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).toContain(data.riskCategory);
    });
  });
});
