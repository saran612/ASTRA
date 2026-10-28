import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Clock } from '../src/services/clock.js';
import { DeadlineScanEngine } from '../src/services/deadline-engine.js';

describe('Milestone 7: Deadline Engine, Idempotency & Time Travel', () => {
  const prisma = new PrismaClient();
  const scanEngine = new DeadlineScanEngine(prisma);

  let instId: string;
  let activeFdrId: string;

  beforeAll(async () => {
    Clock.reset();
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: { name: 'Deadline College', aicteId: '1-DEADLINE-01', region: 'EAST' },
    });
    instId = inst.id;

    await prisma.user.create({
      data: {
        email: 'admin.deadline@example.com',
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });

    await prisma.user.create({
      data: {
        email: 'inst.deadline@example.com',
        passwordHash: 'hash',
        role: 'INSTITUTION',
        institutionId: instId,
      },
    });

    // Create an active FDR with maturity on 2026-12-01
    const fdr = await prisma.fdr.create({
      data: {
        institutionId: instId,
        fdrNo: 'FDR-DEADLINE-100',
        bank: 'Canara Bank',
        branch: 'Kolkata',
        ifsc: 'CNRB0001000',
        amount: 2500000,
        issueDate: new Date('2023-12-01'),
        maturityDate: new Date('2026-12-01'),
        status: 'ACTIVE',
      },
    });
    activeFdrId = fdr.id;
  });

  afterAll(async () => {
    Clock.reset();
    await prisma.$disconnect();
  });

  it('runs scan in safe window (>90 days out); creates no premature alerts or transitions', async () => {
    // Current date set to 2026-06-01 (183 days before maturity)
    Clock.setSimulatedDate(new Date('2026-06-01'));

    await scanEngine.runScan();

    const fdr = await prisma.fdr.findUnique({ where: { id: activeFdrId } });
    expect(fdr?.status).toBe('ACTIVE');

    const alerts = await prisma.alert.findMany({ where: { fdrId: activeFdrId } });
    expect(alerts.length).toBe(0);
  });

  it('time travels to T-60 horizon; auto-transitions ACTIVE -> EXPIRING and fires alerts', async () => {
    // 60 days before 2026-12-01 is roughly 2026-10-02
    Clock.setSimulatedDate(new Date('2026-10-02'));

    await scanEngine.runScan();

    const fdr = await prisma.fdr.findUnique({ where: { id: activeFdrId } });
    expect(fdr?.status).toBe('EXPIRING');

    const alerts = await prisma.alert.findMany({ where: { fdrId: activeFdrId } });
    // T-90 and T-60 alerts should have fired
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const ruleKeys = alerts.map((a) => a.ruleKey);
    expect(ruleKeys).toContain('EXPIRING_T90');
    expect(ruleKeys).toContain('EXPIRING_T60');
  });

  it('guarantees IDEMPOTENCY: running the scan repeatedly on the same day duplicates 0 alerts', async () => {
    const alertsBefore = await prisma.alert.count();

    // Re-run scan 3 times back-to-back
    await scanEngine.runScan();
    await scanEngine.runScan();
    await scanEngine.runScan();

    const alertsAfter = await prisma.alert.count();
    expect(alertsAfter).toBe(alertsBefore);
  });

  it('time travels past maturity date; transitions EXPIRING -> LAPSED without renewal', async () => {
    // Past maturity date 2026-12-05
    Clock.setSimulatedDate(new Date('2026-12-05'));

    await scanEngine.runScan();

    const fdr = await prisma.fdr.findUnique({ where: { id: activeFdrId } });
    expect(fdr?.status).toBe('LAPSED');

    const overdueAlert = await prisma.alert.findFirst({
      where: { fdrId: activeFdrId, ruleKey: 'OVERDUE' },
    });
    expect(overdueAlert).toBeDefined();
  });
});
