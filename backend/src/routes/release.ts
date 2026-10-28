import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest, getScopedInstitutionFilter } from '../middlewares/auth.js';
import { ReleaseWorkflowService } from '../services/release-workflow.js';

export function createReleaseRouter(prisma: PrismaClient) {
  const router = Router();
  const service = new ReleaseWorkflowService(prisma);

  // POST /api/release/fdrs/:fdrId/request
  const requestSchema = z.object({
    reason: z.string().min(5, 'A clear reason for release is required'),
  });

  router.post(
    '/fdrs/:fdrId/request',
    requireAuth,
    requireRole(['INSTITUTION', 'OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { fdrId } = req.params;
      const parse = requestSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

      try {
        const result = await service.createReleaseRequest(fdrId, parse.data.reason, {
          id: req.user!.userId,
          role: req.user!.role,
        });
        return res.status(201).json(result);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
  );

  // POST /api/release/requests/:id/officer-approve
  const officerSchema = z.object({
    checklist: z.object({
      courseClosureApproved: z.boolean(),
      noPendingAuditQueries: z.boolean(),
      noStudentGrievancePending: z.boolean(),
      originalFdReceiptSurrendered: z.boolean(),
      officerRecommendationSigned: z.boolean(),
    }),
    remarks: z.string().optional(),
  });

  router.post(
    '/requests/:id/officer-approve',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const parse = officerSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: 'Checklist incomplete or invalid' });

      try {
        const result = await service.officerApprove(
          id,
          parse.data.checklist,
          req.user!.userId,
          parse.data.remarks
        );
        return res.json(result);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
  );

  // POST /api/release/requests/:id/authority-approve
  const authoritySchema = z.object({
    remarks: z.string().optional(),
  });

  router.post(
    '/requests/:id/authority-approve',
    requireAuth,
    requireRole(['AUTHORITY', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const parse = authoritySchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: 'Invalid payload' });

      try {
        const result = await service.authorityApprove(id, req.user!.userId, parse.data.remarks);
        return res.json({
          ...result,
          notice: 'Note: FDR Vault records and validates authorizations only. It does not disburse funds.',
        });
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
  );

  // POST /api/release/requests/:id/reject
  const rejectSchema = z.object({
    rejectionReason: z.string().min(3, 'Rejection reason is required'),
  });

  router.post(
    '/requests/:id/reject',
    requireAuth,
    requireRole(['OFFICER', 'AUTHORITY', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const parse = rejectSchema.safeParse(req.body);
      if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

      try {
        const result = await service.rejectRequest(
          id,
          { id: req.user!.userId, role: req.user!.role },
          parse.data.rejectionReason
        );
        return res.json(result);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
  );

  // GET /api/release/requests (scoped list)
  router.get('/requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const scope = getScopedInstitutionFilter(req.user!);
    const where: any = {};
    if (scope.institutionId) {
      where.fdr = { institutionId: scope.institutionId };
    }

    const requests = await prisma.releaseRequest.findMany({
      where,
      include: {
        fdr: {
          include: { institution: true },
        },
      },
      orderBy: { ts: 'desc' },
    });

    return res.json(requests);
  });

  return router;
}
