import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import {
  generateBankInquiryLetter,
  ManualConfirmationVerifier,
  MockBankVerifier,
} from '../services/bank-verifier.js';
import { FieldTrustService } from '../services/trust.js';
import { FdrLifecycleService } from '../services/fdr-lifecycle.js';
import { documentStore } from '../services/storage.js';
import { Clock } from '../services/clock.js';

const upload = multer({ storage: multer.memoryStorage() });

export function createBankVerificationRouter(prisma: PrismaClient) {
  const router = Router();
  const trustService = new FieldTrustService(prisma);
  const lifecycleService = new FdrLifecycleService(prisma);
  const manualVerifier = new ManualConfirmationVerifier(prisma, trustService, lifecycleService);
  const mockVerifier = new MockBankVerifier(prisma, trustService, lifecycleService);

  // POST /api/bank-verification/request/:fdrId (officer requests verification)
  router.post(
    '/request/:fdrId',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { fdrId } = req.params;
      const isMock = req.query.mock === 'true';

      const verifier = isMock ? mockVerifier : manualVerifier;
      try {
        const requestId = await verifier.requestVerification(fdrId, req.user!.userId);
        return res.status(201).json({ requestId, verifierName: verifier.name, isMock: verifier.isMock });
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
  );

  // GET /api/bank-verification/:id/template (downloadable bank inquiry letter)
  router.get('/:id/template', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const request = await prisma.bankVerificationRequest.findUnique({
      where: { id },
      include: {
        fdr: {
          include: { institution: true },
        },
      },
    });

    if (!request) return res.status(404).json({ error: 'Verification request not found' });

    const fdr = request.fdr;
    const text = generateBankInquiryLetter({
      fdrNo: fdr.fdrNo,
      bank: fdr.bank,
      branch: fdr.branch,
      ifsc: fdr.ifsc,
      amount: Number(fdr.amount),
      issueDate: fdr.issueDate,
      maturityDate: fdr.maturityDate,
      institutionName: fdr.institution.name,
      aicteId: fdr.institution.aicteId,
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="Bank-Inquiry-Letter-${fdr.fdrNo}.txt"`);
    return res.send(text);
  });

  // POST /api/bank-verification/:id/manual-confirm (officer uploads bank reply)
  router.post(
    '/:id/manual-confirm',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN']),
    upload.single('replyDocument'),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const request = await prisma.bankVerificationRequest.findUnique({
        where: { id },
        include: { fdr: true },
      });
      if (!request) return res.status(404).json({ error: 'Request not found' });

      let docId: string | undefined;
      if (req.file) {
        const stored = await documentStore.save(req.file.buffer, req.file.originalname);
        const doc = await prisma.document.create({
          data: {
            fdrId: request.fdrId,
            type: 'BANK_CONFIRMATION',
            storageKey: stored.storageKey,
            sha256: stored.sha256,
            uploadedBy: req.user!.userId,
            uploadedAt: Clock.now(),
          },
        });
        docId = doc.id;
      }

      // Fields confirmed by the bank
      const confirmedFields = {
        fdrNo: request.fdr.fdrNo,
        bank: request.fdr.bank,
        branch: request.fdr.branch,
        ifsc: request.fdr.ifsc,
        amount: String(request.fdr.amount),
        issueDate: request.fdr.issueDate.toISOString(),
        maturityDate: request.fdr.maturityDate.toISOString(),
        lienMarked: 'true',
      };

      await manualVerifier.confirmVerification(
        id,
        {
          status: 'CONFIRMED',
          confirmedFields,
          bankRemarks: req.body.bankRemarks || 'Confirmed in order by bank manager',
        },
        req.user!.userId
      );

      if (docId) {
        await prisma.bankVerificationRequest.update({
          where: { id },
          data: { responseDocId: docId },
        });
      }

      return res.json({ message: 'Bank confirmation recorded. Field trust updated to BANK_CONFIRMED.' });
    }
  );

  // POST /api/bank-verification/:id/mock-confirm (one-click demo confirmation)
  router.post(
    '/:id/mock-confirm',
    requireAuth,
    requireRole(['OFFICER', 'ADMIN']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const request = await prisma.bankVerificationRequest.findUnique({
        where: { id },
        include: { fdr: true },
      });
      if (!request) return res.status(404).json({ error: 'Request not found' });

      await mockVerifier.confirmVerification(
        id,
        {
          status: 'CONFIRMED',
          confirmedFields: {
            fdrNo: request.fdr.fdrNo,
            bank: request.fdr.bank,
            amount: String(request.fdr.amount),
            issueDate: request.fdr.issueDate.toISOString(),
            maturityDate: request.fdr.maturityDate.toISOString(),
            lienMarked: 'true',
          },
          bankRemarks: 'Simulated demo confirmation from bank (DEMO MOCK)',
        },
        req.user!.userId
      );

      return res.json({ message: 'Mock verification completed (DEMO MOCK).' });
    }
  );

  return router;
}
