import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ReleaseWorkflowService } from '../src/services/release-workflow.js';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';

describe('Milestone 6: Renewal Chains and Release/Refund Workflow', () => {
  const prisma = new PrismaClient();
  const lifecycle = new FdrLifecycleService(prisma);
  const releaseService = new ReleaseWorkflowService(prisma);

  let instId: string;
  let institutionUserId: string;
  let officerId: string;
  let authorityId: string;

  beforeAll(async () => {
    await prisma.alertDispatch.deleteMany();
    await prisma.schedulerJob.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.bankVerificationRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.fdrFieldTrust.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.releaseRequest.deleteMany();
    await prisma.document.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: { name: 'Renewal Institute of Technology', aicteId: '1-RNW-01', region: 'WESTERN' },
    });
    instId = inst.id;

    const instUser = await prisma.user.create({
      data: { email: 'user.rnw@example.com', passwordHash: 'hash', role: 'INSTITUTION', institutionId: instId },
    });
    institutionUserId = instUser.id;

    const officer = await prisma.user.create({
      data: { email: 'officer.rnw@example.com', passwordHash: 'hash', role: 'REGIONAL_OFFICER', region: 'WESTERN' },
    });
    officerId = officer.id;

    const authUser = await prisma.user.create({
      data: { email: 'authority.rnw@example.com', passwordHash: 'hash', role: 'BUREAU' },
    });
    authorityId = authUser.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Renewal Chain & Superseding Invariants', () => {
    it('Successor FDR reaching ACTIVE marks predecessor in EXPIRING as RENEWED', async () => {
      // Predecessor in EXPIRING state
      const oldFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-OLD-001',
          bank: 'Bank of Baroda',
          branch: 'Camp',
          ifsc: 'BARB0000001',
          amount: 1500000,
          issueDate: new Date('2021-01-01'),
          maturityDate: new Date('2024-01-01'),
          status: 'EXPIRING',
        },
      });

      // Replacement FDR linked to oldFdr
      const newFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-NEW-002',
          bank: 'Bank of Baroda',
          branch: 'Camp',
          ifsc: 'BARB0000001',
          amount: 1500000,
          issueDate: new Date('2024-01-01'),
          maturityDate: new Date('2027-01-01'),
          status: 'VERIFIED',
          supersedesFdrId: oldFdr.id,
        },
      });

      // Move new FDR to ACTIVE
      await lifecycle.transition({
        fdrId: newFdr.id,
        toStatus: 'ACTIVE',
        actor: { id: officerId, role: 'REGIONAL_OFFICER' },
        remarks: 'Replacement renewal instrument verified and accepted',
      });

      // Verify old FDR is now automatically RENEWED
      const updatedOld = await prisma.fdr.findUnique({ where: { id: oldFdr.id } });
      expect(updatedOld?.status).toBe('RENEWED');

      // Verify cryptographic audit log chain remains intact
      const auditStatus = await lifecycle.verifyAuditChain();
      expect(auditStatus.valid).toBe(true);
    });

    it('Successor FDR reaching ACTIVE also marks predecessor in LAPSED as RENEWED (late renewal)', async () => {
      const lapsedFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-LAPSED-003',
          bank: 'State Bank of India',
          branch: 'Nariman Point',
          ifsc: 'SBIN0000123',
          amount: 2000000,
          issueDate: new Date('2020-01-01'),
          maturityDate: new Date('2023-01-01'),
          status: 'LAPSED',
        },
      });

      const replacementFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-LATE-RENEW-004',
          bank: 'State Bank of India',
          branch: 'Nariman Point',
          ifsc: 'SBIN0000123',
          amount: 2000000,
          issueDate: new Date('2024-06-01'),
          maturityDate: new Date('2027-06-01'),
          status: 'VERIFIED',
          supersedesFdrId: lapsedFdr.id,
        },
      });

      await lifecycle.transition({
        fdrId: replacementFdr.id,
        toStatus: 'ACTIVE',
        actor: { id: officerId, role: 'REGIONAL_OFFICER' },
        remarks: 'Late renewal deposit accepted after regularization',
      });

      const updatedLapsed = await prisma.fdr.findUnique({ where: { id: lapsedFdr.id } });
      expect(updatedLapsed?.status).toBe('RENEWED');

      const auditStatus = await lifecycle.verifyAuditChain();
      expect(auditStatus.valid).toBe(true);
    });

    it('Edge case: unrelated independent FDRs are NOT transitioned', async () => {
      const independentFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-INDEP-005',
          bank: 'Punjab National Bank',
          branch: 'Pune',
          ifsc: 'PUNB0000456',
          amount: 1000000,
          issueDate: new Date('2022-01-01'),
          maturityDate: new Date('2025-01-01'),
          status: 'EXPIRING',
        },
      });

      const unrelatedNewFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-UNRELATED-006',
          bank: 'Canara Bank',
          branch: 'Pune',
          ifsc: 'CNRB0000789',
          amount: 1000000,
          issueDate: new Date('2024-01-01'),
          maturityDate: new Date('2027-01-01'),
          status: 'VERIFIED',
          // supersedesFdrId is null
        },
      });

      await lifecycle.transition({
        fdrId: unrelatedNewFdr.id,
        toStatus: 'ACTIVE',
        actor: { id: officerId, role: 'REGIONAL_OFFICER' },
      });

      const checkIndep = await prisma.fdr.findUnique({ where: { id: independentFdr.id } });
      expect(checkIndep?.status).toBe('EXPIRING'); // Unchanged
    });
  });

  describe('Release & Refund Clearance Workflow', () => {
    it('Blocks release request when FDR has open discrepancies', async () => {
      const fdrWithDiscrepancy = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-DISC-BLOCKED',
          bank: 'HDFC Bank',
          branch: 'Andheri',
          ifsc: 'HDFC0000123',
          amount: 1500000,
          issueDate: new Date('2020-01-01'),
          maturityDate: new Date('2025-01-01'),
          status: 'ACTIVE',
        },
      });

      await prisma.discrepancy.create({
        data: {
          fdrId: fdrWithDiscrepancy.id,
          code: 'LIEN_NOT_MARKED',
          severity: 'HIGH',
          status: 'OPEN',
          detail: 'Lien letter missing from upload records',
          raisedBy: officerId,
        },
      });

      await expect(
        releaseService.createReleaseRequest(
          fdrWithDiscrepancy.id,
          'Closure request',
          { id: institutionUserId, role: 'INSTITUTION' }
        )
      ).rejects.toThrow(/open discrepancies/);
    });

    it('Blocks officer recommendation if any of the 5 checklist items is missing/false', async () => {
      const cleanFdr = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-CHECKLIST-TEST',
          bank: 'HDFC Bank',
          branch: 'Andheri',
          ifsc: 'HDFC0000123',
          amount: 1500000,
          issueDate: new Date('2020-01-01'),
          maturityDate: new Date('2025-01-01'),
          status: 'ACTIVE',
        },
      });

      const req = await releaseService.createReleaseRequest(
        cleanFdr.id,
        'Closure completed',
        { id: institutionUserId, role: 'INSTITUTION' }
      );

      // Incomplete checklist (one false)
      await expect(
        releaseService.officerApprove(
          req.id,
          {
            courseClosureApproved: true,
            noPendingAuditQueries: true,
            noStudentGrievancePending: false, // Incomplete!
            originalFdReceiptSurrendered: true,
            officerRecommendationSigned: true,
          },
          officerId
        )
      ).rejects.toThrow(/All regulatory checklist items must be verified/);
    });

    it('Officer rejection reverts FDR from RELEASE_REQUESTED back to ACTIVE', async () => {
      const fdrToReject = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-OFFICER-REJECT',
          bank: 'ICICI Bank',
          branch: 'Bandra',
          ifsc: 'ICIC0000123',
          amount: 2000000,
          issueDate: new Date('2020-01-01'),
          maturityDate: new Date('2025-01-01'),
          status: 'ACTIVE',
        },
      });

      const req = await releaseService.createReleaseRequest(
        fdrToReject.id,
        'Closure request',
        { id: institutionUserId, role: 'INSTITUTION' }
      );
      expect(req.status).toBe('PENDING_OFFICER');

      // Officer rejects
      const rejected = await releaseService.rejectRequest(
        req.id,
        { id: officerId, role: 'REGIONAL_OFFICER' },
        'Pending student fee dispute reported to Regional Directorate'
      );
      expect(rejected.status).toBe('REJECTED');

      const restoredFdr = await prisma.fdr.findUnique({ where: { id: fdrToReject.id } });
      expect(restoredFdr?.status).toBe('ACTIVE');
    });

    it('Authority rejection reverts FDR from RELEASE_APPROVED back to ACTIVE', async () => {
      const fdrForAuthReject = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-AUTH-REJECT',
          bank: 'Axis Bank',
          branch: 'Colaba',
          ifsc: 'UTIB0000123',
          amount: 2500000,
          issueDate: new Date('2020-01-01'),
          maturityDate: new Date('2025-01-01'),
          status: 'ACTIVE',
        },
      });

      const req = await releaseService.createReleaseRequest(
        fdrForAuthReject.id,
        'Institution closure',
        { id: institutionUserId, role: 'INSTITUTION' }
      );

      // Officer approves
      await releaseService.officerApprove(
        req.id,
        {
          courseClosureApproved: true,
          noPendingAuditQueries: true,
          noStudentGrievancePending: true,
          originalFdReceiptSurrendered: true,
          officerRecommendationSigned: true,
        },
        officerId,
        'Recommended by Regional Scrutiny'
      );

      const fdrApproved = await prisma.fdr.findUnique({ where: { id: fdrForAuthReject.id } });
      expect(fdrApproved?.status).toBe('RELEASE_APPROVED');

      // Authority rejects at 2nd level
      const rejected = await releaseService.rejectRequest(
        req.id,
        { id: authorityId, role: 'BUREAU' },
        'Executive Committee withheld clearance pending land encumbrance inquiry'
      );
      expect(rejected.status).toBe('REJECTED');

      const restoredFdr = await prisma.fdr.findUnique({ where: { id: fdrForAuthReject.id } });
      expect(restoredFdr?.status).toBe('ACTIVE');
    });

    it('Executes full 2-tier release with disclaimer metadata recorded in event log', async () => {
      const fdrFullRelease = await prisma.fdr.create({
        data: {
          institutionId: instId,
          fdrNo: 'FDR-FULL-RELEASE-009',
          bank: 'State Bank of India',
          branch: 'Main Branch',
          ifsc: 'SBIN0000691',
          amount: 3500000,
          issueDate: new Date('2019-01-01'),
          maturityDate: new Date('2024-01-01'),
          status: 'ACTIVE',
        },
      });

      // 1. Institution initiates release
      const req = await releaseService.createReleaseRequest(
        fdrFullRelease.id,
        'Institution converted to autonomous university with fresh endowment',
        { id: institutionUserId, role: 'INSTITUTION' }
      );
      expect(req.status).toBe('PENDING_OFFICER');

      // 2. Regional Officer checklist approval
      const officerRes = await releaseService.officerApprove(
        req.id,
        {
          courseClosureApproved: true,
          noPendingAuditQueries: true,
          noStudentGrievancePending: true,
          originalFdReceiptSurrendered: true,
          officerRecommendationSigned: true,
        },
        officerId,
        'All clearances submitted and validated in Regional office'
      );
      expect(officerRes.status).toBe('PENDING_AUTHORITY');

      // 3. Authority final release sign-off
      const authorityRes = await releaseService.authorityApprove(
        req.id,
        { id: authorityId, role: 'BUREAU' },
        'Approved by Member Secretary, AICTE'
      );
      expect(authorityRes.status).toBe('APPROVED');

      const finalFdr = await prisma.fdr.findUnique({ where: { id: fdrFullRelease.id } });
      expect(finalFdr?.status).toBe('RELEASED');

      // Check event metadata for disclaimer
      const releaseEvent = await prisma.fdrEvent.findFirst({
        where: { fdrId: fdrFullRelease.id, toStatus: 'RELEASED' },
      });
      expect((releaseEvent?.meta as any)?.disclaimer).toContain('DOES NOT DISBURSE FUNDS OR MOVE MONEY');

      // Verify audit trail integrity
      const auditStatus = await lifecycle.verifyAuditChain();
      expect(auditStatus.valid).toBe(true);
    });
  });
});
