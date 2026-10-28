import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest, getScopedInstitutionFilter } from '../middlewares/auth.js';
import { withRlsContext } from '../services/rls.js';
import { documentStore } from '../services/storage.js';
import { FieldTrustService, CriticalFdrField } from '../services/trust.js';
import { FdrLifecycleService } from '../services/fdr-lifecycle.js';
import { Clock } from '../services/clock.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

export function createFdrRouter(prisma: PrismaClient) {
  const router = Router();
  const trustService = new FieldTrustService(prisma);
  const lifecycleService = new FdrLifecycleService(prisma);

  const createFdrSchema = z.object({
    fdrNo: z.string().min(1),
    bank: z.string().min(1),
    branch: z.string().min(1),
    ifsc: z.string().min(1),
    amount: z.coerce.number().positive(),
    issueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    maturityDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    lienMarked: z.preprocess((val) => val === true || val === 'true', z.boolean()).default(false),
    supersedesFdrId: z.string().uuid().optional().nullable(),
  });

  // GET /api/fdrs (scoped)
  router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const scope = getScopedInstitutionFilter(req.user!);
    const { status, bank, search } = req.query;

    const where: any = { ...scope };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (bank && typeof bank === 'string') {
      where.bank = bank;
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { fdrNo: { contains: search, mode: 'insensitive' } },
        { bank: { contains: search, mode: 'insensitive' } },
        { ifsc: { contains: search, mode: 'insensitive' } },
        { institution: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const user = req.user!;
    const fdrs = await withRlsContext(
      prisma,
      {
        id: user.userId,
        role: user.role,
        region: user.region,
        institutionId: user.institutionId,
      },
      async (tx) => {
        return tx.fdr.findMany({
          where,
          include: {
            institution: { select: { id: true, name: true, aicteId: true, region: true } },
            discrepancies: { where: { status: 'OPEN' } },
            fieldTrusts: true,
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    );

    return res.json(fdrs);
  });

  // GET /api/fdrs/:id (scoped)
  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const scope = getScopedInstitutionFilter(req.user!);
    const user = req.user!;

    const fdr = await withRlsContext(
      prisma,
      {
        id: user.userId,
        role: user.role,
        region: user.region,
        institutionId: user.institutionId,
      },
      async (tx) => {
        return tx.fdr.findFirst({
          where: { id, ...scope },
          include: {
            institution: true,
            fieldTrusts: true,
            documents: {
              orderBy: { version: 'desc' },
            },
            discrepancies: {
              orderBy: { ts: 'desc' },
            },
            events: {
              orderBy: { ts: 'desc' },
              include: { actor: { select: { id: true, email: true, role: true } } },
            },
            supersedesFdr: true,
            supersededBy: true,
            bankRequests: {
              orderBy: { sentAt: 'desc' },
            },
          },
        });
      }
    );

    if (!fdr) {
      return res.status(404).json({ error: 'FDR not found or unauthorized' });
    }

    return res.json(fdr);
  });

  // POST /api/fdrs (submit FDR + initial trust rows)
  router.post(
    '/',
    requireAuth,
    upload.single('document'),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      let institutionId = user.institutionId;

      // Officers or admins can create on behalf if institutionId is passed in body
      if (user.role !== 'INSTITUTION' && req.body.institutionId) {
        institutionId = req.body.institutionId;
      }

      if (!institutionId) {
        return res.status(400).json({ error: 'FDR must be associated with an institution' });
      }

      const parseResult = createFdrSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Invalid FDR data', details: parseResult.error.errors });
      }

      const data = parseResult.data;
      const issueDate = new Date(data.issueDate);
      const maturityDate = new Date(data.maturityDate);

      // Check unique (bank, fdrNo)
      const existing = await prisma.fdr.findFirst({
        where: { bank: data.bank, fdrNo: data.fdrNo },
      });
      if (existing) {
        return res.status(409).json({ error: `FDR ${data.fdrNo} from bank ${data.bank} is already recorded` });
      }

      const fdr = await prisma.fdr.create({
        data: {
          institutionId,
          fdrNo: data.fdrNo,
          bank: data.bank,
          branch: data.branch,
          ifsc: data.ifsc,
          amount: data.amount,
          issueDate,
          maturityDate,
          lienMarked: data.lienMarked,
          supersedesFdrId: data.supersedesFdrId || null,
          status: 'SUBMITTED',
        },
      });

      // Initialize field trust rows
      await trustService.initializeTrust(fdr.id, {
        fdrNo: data.fdrNo,
        bank: data.bank,
        branch: data.branch,
        ifsc: data.ifsc,
        amount: data.amount,
        issueDate,
        maturityDate,
        lienMarked: data.lienMarked,
      });

      // Handle file upload if present
      if (req.file) {
        const storedMeta = await documentStore.save(req.file.buffer, req.file.originalname);
        await prisma.document.create({
          data: {
            fdrId: fdr.id,
            type: req.body.documentType || 'FDR_RECEIPT',
            storageKey: storedMeta.storageKey,
            sha256: storedMeta.sha256,
            version: 1,
            uploadedBy: user.userId,
            uploadedAt: Clock.now(),
          },
        });
      }

      // Transition SUBMITTED -> UNDER_SCRUTINY
      await lifecycleService.transition({
        fdrId: fdr.id,
        toStatus: 'UNDER_SCRUTINY',
        actor: { id: user.userId, role: user.role },
        remarks: 'Initial submission of FDR',
      });

      const fullFdr = await prisma.fdr.findUnique({
        where: { id: fdr.id },
        include: { fieldTrusts: true, documents: true },
      });

      return res.status(201).json(fullFdr);
    }
  );

  // POST /api/fdrs/:id/documents (upload document version)
  router.post(
    '/:id/documents',
    requireAuth,
    upload.single('document'),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const scope = getScopedInstitutionFilter(req.user!);

      const fdr = await prisma.fdr.findFirst({ where: { id, ...scope } });
      if (!fdr) {
        return res.status(404).json({ error: 'FDR not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const docType = req.body.type || 'FDR_RECEIPT';
      const lastDoc = await prisma.document.findFirst({
        where: { fdrId: id, type: docType },
        orderBy: { version: 'desc' },
      });

      const nextVersion = (lastDoc?.version || 0) + 1;
      const stored = await documentStore.save(req.file.buffer, req.file.originalname);

      const doc = await prisma.document.create({
        data: {
          fdrId: id,
          type: docType,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          version: nextVersion,
          uploadedBy: req.user!.userId,
          uploadedAt: Clock.now(),
        },
      });

      return res.status(201).json(doc);
    }
  );

  // GET /api/documents/:id/signed-url
  router.get('/documents/:docId/signed-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { docId } = req.params;
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      include: { fdr: true },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify row-level access for institution
    if (req.user!.role === 'INSTITUTION' && doc.fdr.institutionId !== req.user!.institutionId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const token = documentStore.generateSignedDownloadToken(doc.id, 15);
    const downloadUrl = `/api/documents/${doc.id}/download?token=${token}`;

    return res.json({ downloadUrl, expiresInSeconds: 15 * 60 });
  });

  // PATCH /api/fdrs/:id/field-trust (officer updates/scrutinizes a specific field)
  router.patch(
    '/:id/field-trust',
    requireAuth,
    requireRole(['OFFICER', 'REGIONAL_OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const { field, value } = req.body;
      if (!field || value === undefined) {
        return res.status(400).json({ error: 'field and value are required' });
      }

      const fdr = await prisma.fdr.findUnique({ where: { id } });
      if (!fdr) {
        return res.status(404).json({ error: 'FDR not found' });
      }

      const updated = await trustService.confirmField(
        id,
        field as CriticalFdrField,
        String(value),
        'OFFICER_ENTERED',
        req.user!.userId,
        Clock.now()
      );

      return res.json(updated);
    }
  );

  return router;
}

export function createDocumentDownloadRouter(prisma: PrismaClient) {
  const router = Router();

  // GET /api/documents/:id/download (decrypt & serve via signed token or bearer header)
  router.get('/:id/download', async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const token = req.query.token as string | undefined;

    if (!token) {
      return res.status(401).json({ error: 'Signed download token required' });
    }

    const valid = documentStore.verifySignedDownloadToken(id, token);
    if (!valid) {
      return res.status(403).json({ error: 'Download token invalid or expired' });
    }

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      return res.status(404).json({ error: 'Document record not found' });
    }

    try {
      const decrypted = await documentStore.read(doc.storageKey);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="document-${doc.id}.pdf"`);
      return res.send(decrypted);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to decrypt document', detail: err.message });
    }
  });

  return router;
}
