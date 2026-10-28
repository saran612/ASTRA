import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { DiscrepancyService } from '../services/discrepancy-service.js';

export function createDiscrepancyRouter(prisma: PrismaClient) {
  const router = Router();
  const service = new DiscrepancyService(prisma);

  // POST /api/discrepancies/scan/:fdrId (trigger manual scan)
  router.post('/scan/:fdrId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { fdrId } = req.params;
    try {
      const result = await service.runDiscrepancyScan(fdrId, req.user!.userId);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  const resolveSchema = z.object({
    remarks: z.string().optional(),
  });

  // POST /api/discrepancies/:id/resolve
  router.post(
    '/:id/resolve',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN', 'AUTHORITY']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const parse = resolveSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: 'Invalid payload' });

      try {
        const resolved = await service.resolveDiscrepancy(id, req.user!.userId, parse.data.remarks);
        return res.json(resolved);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }
  );

  const waiveSchema = z.object({
    remarks: z.string().min(1, 'Waive justification remarks are required'),
  });

  // POST /api/discrepancies/:id/waive
  router.post(
    '/:id/waive',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN', 'AUTHORITY']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const parse = waiveSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

      try {
        const waived = await service.waiveDiscrepancy(id, req.user!.userId, parse.data.remarks);
        return res.json(waived);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }
  );

  return router;
}
