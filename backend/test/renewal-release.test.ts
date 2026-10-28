import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ReleaseWorkflowService } from '../src/services/release-workflow.js';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';

describe('Milestone 8: Renewal Chains and Release/Refund Workflow', () => {
  const prisma = new PrismaClient();
  const lifecycle = new FdrLifecycleService(prisma);
  const releaseService = new ReleaseWorkflowService(prisma);

  let instId: string;
  let institutionUserId: string;
  let officerId: string;
  let authorityId: string;

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.releaseRequest.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: { name: 'Renewal Institute', aicteId: '1-RNW-01', region: 'WEST' },
    });
    instId = inst.id;

    const instUser = await prisma.user.create({
      data: { email: 'user.rnw@example.com', passwordHash: 'hash', role: 'INSTITUTION', institutionId: instId },
    });
    institutionUserId = instUser.id;

    const officer = await prisma.user.create({
      data: { email: 'officer.rnw@example.com', passwordHash: 'hash', role: 'OFFICER' },
    });
    officerId = officer.id;

    const authUser = await prisma.user.create({
      data: { email: 'authority.rnw@example.com', passwordHash: 'hash', role: 'AUTHORITY' },
    });
    authorityId = authUser.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Renewal chain: transitioning successor FDR to ACTIVE marks predecessor as RENEWED', async () => {
    // 1. Predecessor FDR in EXPIRING state
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

    // 2. Successor replacement FDR linked to oldFdr
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

    // 3. Move new FDR to ACTIVE
    await lifecycle.transition({
      fdrId: newFdr.id,
      toStatus: 'ACTIVE',
      actor: { id: officerId, role: 'OFFICER' },
      remarks: 'Replacement renewal accepted',
    });

    // Verify old FDR is now automatically RENEWED
    const updatedOld = await prisma.fdr.findUnique({ where: { id: oldFdr.id } });
    expect(updatedOld?.status).toBe('RENEWED');

    // Verify event written
    const renewalEvent = await prisma.fdrEvent.findFirst({
      where: { fdrId: oldFdr.id, toStatus: 'RENEWED' },
    });
    expect(renewalEvent).toBeDefined();
  });

  it('Release / Refund workflow: runs full 2-level approval with regulatory checklist', async () => {
    // 1. Create an active FDR to release
    const fdrToRelease = await prisma.fdr.create({
      data: {
        institutionId: instId,
        fdrNo: 'FDR-RELEASE-001',
        bank: 'HDFC Bank',
        branch: 'Bandra',
        ifsc: 'HDFC0000123',
        amount: 3500000,
        issueDate: new Date('2020-01-01'),
        maturityDate: new Date('2024-01-01'),
        status: 'ACTIVE',
      },
    });

    // 2. Institution initiates release
    const req = await releaseService.createReleaseRequest(
      fdrToRelease.id,
      'Permanent closure of technical institution completed',
      { id: institutionUserId, role: 'INSTITUTION' }
    );
    expect(req.status).toBe('PENDING_OFFICER');

    const fdrAfterReq = await prisma.fdr.findUnique({ where: { id: fdrToRelease.id } });
    expect(fdrAfterReq?.status).toBe('RELEASE_REQUESTED');

    // 3. Officer completes checklist and gives 1st-level approval
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
      'All regulatory clearances verified'
    );
    expect(officerRes.status).toBe('PENDING_AUTHORITY');

    const fdrAfterOfficer = await prisma.fdr.findUnique({ where: { id: fdrToRelease.id } });
    expect(fdrAfterOfficer?.status).toBe('RELEASE_APPROVED');

    // 4. Authority final sign-off
    const authorityRes = await releaseService.authorityApprove(
      req.id,
      authorityId,
      'Final approval granted by Member Secretary'
    );
    expect(authorityRes.status).toBe('APPROVED');

    const fdrAfterAuth = await prisma.fdr.findUnique({ where: { id: fdrToRelease.id } });
    expect(fdrAfterAuth?.status).toBe('RELEASED');
  });
});
