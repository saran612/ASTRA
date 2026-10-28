import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { Clock } from '../services/clock.js';
import { DeadlineScanEngine } from '../services/deadline-engine.js';
import { FdrLifecycleService } from '../services/fdr-lifecycle.js';

export function createAdminRouter(prisma: PrismaClient) {
  const router = Router();
  const scanEngine = new DeadlineScanEngine(prisma);
  const lifecycle = new FdrLifecycleService(prisma);

  // POST /api/admin/clock/time-travel (shift simulated clock)
  const timeTravelSchema = z.object({
    targetDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  });

  router.post(
    '/clock/time-travel',
    requireAuth,
    requireRole(['ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const parse = timeTravelSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: 'Invalid date format' });

      const target = new Date(parse.data.targetDate);
      Clock.setSimulatedDate(target);

      return res.json({
        simulatedDate: Clock.now(),
        offsetMs: Clock.getOffsetMs(),
        isSimulated: Clock.isSimulated(),
      });
    }
  );

  // POST /api/admin/clock/reset
  router.post(
    '/clock/reset',
    requireAuth,
    requireRole(['ADMIN']),
    async (_req: AuthenticatedRequest, res: Response) => {
      Clock.reset();
      return res.json({
        simulatedDate: Clock.now(),
        isSimulated: false,
      });
    }
  );

  // GET /api/admin/clock/status
  router.get('/clock/status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    return res.json({
      currentClock: Clock.now(),
      offsetMs: Clock.getOffsetMs(),
      isSimulated: Clock.isSimulated(),
    });
  });

  // POST /api/admin/jobs/scan-now (manually trigger scan)
  router.post(
    '/jobs/scan-now',
    requireAuth,
    requireRole(['ADMIN']),
    async (_req: AuthenticatedRequest, res: Response) => {
      const result = await scanEngine.runScan();
      return res.json(result);
    }
  );

  // POST /api/admin/audit/verify-chain
  router.post(
    '/audit/verify-chain',
    requireAuth,
    requireRole(['ADMIN', 'AUTHORITY']),
    async (_req: AuthenticatedRequest, res: Response) => {
      const report = await lifecycle.verifyAuditChain();
      return res.json(report);
    }
  );

  // GET /api/admin/rules
  router.get('/rules', requireAuth, requireRole(['ADMIN']), async (_req: AuthenticatedRequest, res: Response) => {
    const rules = await prisma.ruleConfig.findMany();
    return res.json(rules);
  });

  // PUT /api/admin/rules/:key
  router.put('/rules/:key', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
    const { key } = req.params;
    const { value, note } = req.body;

    const updated = await prisma.ruleConfig.update({
      where: { key },
      data: {
        value,
        note: note || undefined,
      },
    });

    return res.json(updated);
  });

  return router;
}

export function createAlertRouter(prisma: PrismaClient) {
  const router = Router();

  // GET /api/alerts (inbox filtered by user role)
  router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const where: any = {};

    if (user.role === 'INSTITUTION') {
      where.fdr = { institutionId: user.institutionId };
      where.recipientRole = 'INSTITUTION';
    } else {
      where.recipientRole = user.role;
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        fdr: {
          select: {
            id: true,
            fdrNo: true,
            bank: true,
            amount: true,
            maturityDate: true,
            status: true,
          },
        },
      },
      orderBy: { firedAt: 'desc' },
    });

    return res.json(alerts);
  });

  // POST /api/alerts/:id/ack
  router.post('/:id/ack', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const alert = await prisma.alert.update({
      where: { id },
      data: { ackedAt: Clock.now() },
    });
    return res.json(alert);
  });

  return router;
}
