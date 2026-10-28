import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { validateTransition } from '@fdr-vault/shared';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';
import { computeAuditHash, GENESIS_HASH } from '../src/services/audit.js';

describe('Milestone 2: State Machine, Lifecycle & Audit Hash Chain', () => {
  const prisma = new PrismaClient();
  const lifecycle = new FdrLifecycleService(prisma);

  let testUserId: string;
  let testOfficerId: string;
  let testInstitutionId: string;
  let testFdrId: string;

  beforeAll(async () => {
    // Setup clean test fixture
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: {
        name: 'State Tech University',
        aicteId: '1-TEST-M2',
        region: 'NORTH',
      },
    });
    testInstitutionId = inst.id;

    const userInst = await prisma.user.create({
      data: {
        email: 'inst.m2@example.com',
        passwordHash: 'dummy',
        role: 'INSTITUTION',
        institutionId: inst.id,
      },
    });
    testUserId = userInst.id;

    const officer = await prisma.user.create({
      data: {
        email: 'officer.m2@example.com',
        passwordHash: 'dummy',
        role: 'OFFICER',
      },
    });
    testOfficerId = officer.id;

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: testInstitutionId,
        fdrNo: 'FDR-M2-001',
        bank: 'State Bank of India',
        branch: 'Main Branch',
        ifsc: 'SBIN0001234',
        amount: 2500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'SUBMITTED',
      },
    });
    testFdrId = fdr.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Pure State Machine Transition Validation', () => {
    it('allows valid transition SUBMITTED -> UNDER_SCRUTINY for INSTITUTION', () => {
      const res = validateTransition('SUBMITTED', 'UNDER_SCRUTINY', { actorRole: 'INSTITUTION' });
      expect(res.allowed).toBe(true);
    });

    it('rejects invalid jump SUBMITTED -> ACTIVE directly', () => {
      const res = validateTransition('SUBMITTED', 'ACTIVE', { actorRole: 'OFFICER' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Illegal state transition');
    });

    it('rejects transitions attempted by unauthorized roles', () => {
      const res = validateTransition('UNDER_SCRUTINY', 'DISCREPANCY', { actorRole: 'INSTITUTION' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('not authorized');
    });

    it('enforces guard condition: blocks VERIFIED when discrepancies are open', () => {
      const res = validateTransition('UNDER_SCRUTINY', 'VERIFIED', {
        actorRole: 'OFFICER',
        hasOpenDiscrepancies: true,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Cannot verify FDR with open discrepancies');
    });
  });

  describe('FdrLifecycleService.transition() execution', () => {
    it('transitions SUBMITTED -> UNDER_SCRUTINY and writes FdrEvent and AuditLog', async () => {
      const result = await lifecycle.transition({
        fdrId: testFdrId,
        toStatus: 'UNDER_SCRUTINY',
        actor: { id: testOfficerId, role: 'OFFICER' },
        remarks: 'Beginning scrutiny of FDR documents',
      });

      expect(result.newStatus).toBe('UNDER_SCRUTINY');

      // Verify event was recorded
      const event = await prisma.fdrEvent.findFirst({
        where: { fdrId: testFdrId, toStatus: 'UNDER_SCRUTINY' },
      });
      expect(event).toBeDefined();
      expect(event?.fromStatus).toBe('SUBMITTED');

      // Verify audit log has genesis prevHash for the first log
      const audit = await prisma.auditLog.findFirst({
        orderBy: { ts: 'asc' },
      });
      expect(audit).toBeDefined();
      expect(audit?.prevHash).toBe(GENESIS_HASH);
    });

    it('transitions UNDER_SCRUTINY -> DISCREPANCY with remarks', async () => {
      const result = await lifecycle.transition({
        fdrId: testFdrId,
        toStatus: 'DISCREPANCY',
        actor: { id: testOfficerId, role: 'OFFICER' },
        remarks: 'Joint lien clause wording incomplete',
      });

      expect(result.newStatus).toBe('DISCREPANCY');
    });

    it('transitions DISCREPANCY -> UNDER_SCRUTINY when institution responds', async () => {
      const result = await lifecycle.transition({
        fdrId: testFdrId,
        toStatus: 'UNDER_SCRUTINY',
        actor: { id: testUserId, role: 'INSTITUTION' },
        remarks: 'Re-uploaded revised bank confirmation letter',
      });

      expect(result.newStatus).toBe('UNDER_SCRUTINY');
    });

    it('transitions UNDER_SCRUTINY -> VERIFIED -> ACTIVE', async () => {
      await lifecycle.transition({
        fdrId: testFdrId,
        toStatus: 'VERIFIED',
        actor: { id: testOfficerId, role: 'OFFICER' },
        remarks: 'Verified against bank response',
      });

      const activeRes = await lifecycle.transition({
        fdrId: testFdrId,
        toStatus: 'ACTIVE',
        actor: { id: testOfficerId, role: 'OFFICER' },
        remarks: 'Approved security deposit active',
      });

      expect(activeRes.newStatus).toBe('ACTIVE');
    });

    it('verifies the cryptographic hash-chain across all transitions', async () => {
      const verification = await lifecycle.verifyAuditChain();
      expect(verification.valid).toBe(true);
      expect(verification.totalRows).toBeGreaterThanOrEqual(4);
    });
  });
});
