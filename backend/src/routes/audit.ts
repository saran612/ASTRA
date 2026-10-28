import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { FdrLifecycleService } from '../services/fdr-lifecycle.js';

export function createAuditRouter(prisma: PrismaClient) {
  const router = Router();
  const lifecycle = new FdrLifecycleService(prisma);

  // GET /api/audit/verify: Verify full cryptographic SHA-256 hash chain
  router.get(
    '/verify',
    requireAuth,
    requireRole(['ADMIN', 'AUTHORITY', 'OFFICER']),
    async (_req: AuthenticatedRequest, res: Response) => {
      const report = await lifecycle.verifyAuditChain();
      return res.json(report);
    }
  );

  // GET /api/audit/logs: Paginated audit explorer records
  router.get(
    '/logs',
    requireAuth,
    requireRole(['ADMIN', 'AUTHORITY', 'OFFICER']),
    async (req: AuthenticatedRequest, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const cursor = req.query.cursor as string | undefined;
      const entityId = req.query.entityId as string | undefined;

      const whereClause = entityId ? { entityId } : {};

      const logs = await prisma.auditLog.findMany({
        take: limit,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        where: whereClause,
        orderBy: { ts: 'desc' },
      });

      return res.json({
        logs,
        nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
      });
    }
  );

  return router;
}
