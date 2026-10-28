import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';
import { GENESIS_HASH, computeAuditHash } from '../src/services/audit.js';

describe('Milestone 2: Cryptographic Audit Hash Chain & Tamper Detection', () => {
  const prisma = new PrismaClient();
  const lifecycle = new FdrLifecycleService(prisma);

  let testUserId: string;
  let testOfficerId: string;
  let testInstitutionId: string;
  let testFdrId: string;

  beforeAll(async () => {
    // Clean test fixture
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: {
        name: 'Audit Tamper Verification College',
        aicteId: '1-TAMPER-TEST',
        region: 'SOUTH',
      },
    });
    testInstitutionId = inst.id;

    const user = await prisma.user.create({
      data: {
        email: 'inst.tamper@example.com',
        passwordHash: 'dummy',
        role: 'INSTITUTION',
        institutionId: inst.id,
      },
    });
    testUserId = user.id;

    const officer = await prisma.user.create({
      data: {
        email: 'officer.tamper@example.com',
        passwordHash: 'dummy',
        role: 'OFFICER',
      },
    });
    testOfficerId = officer.id;

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: testInstitutionId,
        fdrNo: 'FDR-TAMPER-001',
        bank: 'Canara Bank',
        branch: 'MG Road',
        ifsc: 'CNRB0001234',
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

  it('builds a verified cryptographic hash chain across sequential state transitions', async () => {
    // Transition 1: SUBMITTED -> UNDER_SCRUTINY
    await lifecycle.transition({
      fdrId: testFdrId,
      toStatus: 'UNDER_SCRUTINY',
      actor: { id: testUserId, role: 'INSTITUTION' },
      remarks: 'Submitted for scrutiny',
    });

    // Transition 2: UNDER_SCRUTINY -> DISCREPANCY
    await lifecycle.transition({
      fdrId: testFdrId,
      toStatus: 'DISCREPANCY',
      actor: { id: testOfficerId, role: 'OFFICER' },
      remarks: 'Requires clearer bank acknowledgement letter',
    });

    // Transition 3: DISCREPANCY -> UNDER_SCRUTINY
    await lifecycle.transition({
      fdrId: testFdrId,
      toStatus: 'UNDER_SCRUTINY',
      actor: { id: testUserId, role: 'INSTITUTION' },
      remarks: 'Uploaded refreshed bank acknowledgement',
    });

    // Transition 4: UNDER_SCRUTINY -> VERIFIED
    await lifecycle.transition({
      fdrId: testFdrId,
      toStatus: 'VERIFIED',
      actor: { id: testOfficerId, role: 'OFFICER' },
      remarks: 'Verified against bank response',
    });

    // Verify pristine chain
    const verifyResult = await lifecycle.verifyAuditChain();
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.totalRows).toBe(4);
    expect(verifyResult.corruptedAtId).toBeUndefined();
  });

  it('detects tampering when an attacker mutates an audit payload directly in the database', async () => {
    const logs = await prisma.auditLog.findMany({ orderBy: { ts: 'asc' } });
    expect(logs.length).toBeGreaterThanOrEqual(3);

    // Pick the second row in the chain
    const targetRow = logs[1];

    // Attacker modifies the payload (e.g. alters remarks to conceal a defect)
    await prisma.auditLog.update({
      where: { id: targetRow.id },
      data: {
        payload: {
          fromStatus: 'UNDER_SCRUTINY',
          toStatus: 'DISCREPANCY',
          remarks: 'TAMPERED: All documents look clean',
          eventId: 'tampered-event-id',
        },
      },
    });

    // Chain verification must FAIL and pinpoint targetRow.id
    const report = await lifecycle.verifyAuditChain();
    expect(report.valid).toBe(false);
    expect(report.corruptedAtId).toBe(targetRow.id);

    // Restore original payload to restore chain health for subsequent tests
    await prisma.auditLog.update({
      where: { id: targetRow.id },
      data: { payload: targetRow.payload as object },
    });

    const restoredReport = await lifecycle.verifyAuditChain();
    expect(restoredReport.valid).toBe(true);
  });

  it('detects tampering when an attacker deletes an intermediate audit record', async () => {
    const logs = await prisma.auditLog.findMany({ orderBy: { ts: 'asc' } });
    const rowToDelete = logs[2];
    const followingRow = logs[3];

    // Delete row 2
    await prisma.auditLog.delete({ where: { id: rowToDelete.id } });

    // The following row's prevHash will now fail to match row 1's hash
    const report = await lifecycle.verifyAuditChain();
    expect(report.valid).toBe(false);
    expect(report.corruptedAtId).toBe(followingRow.id);
  });
});
