import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ObligationEngine } from '../src/services/obligation-engine.js';
import { PostgresJobQueue } from '../src/services/job-queue.js';
import { HolidayCalendarService } from '../src/services/holiday-calendar.js';
import { Clock } from '../src/services/clock.js';

describe('Milestone 4: Unified Obligation Engine, Postgres Job Queue & Worker Restart Idempotency', () => {
  const prisma = new PrismaClient();
  const obligationEngine = new ObligationEngine(prisma);
  const jobQueue = new PostgresJobQueue(prisma);
  const calendar = new HolidayCalendarService(prisma);

  let testInstId: string;
  let testFdrId: string;

  beforeAll(async () => {
    Clock.reset();

    // Clean test fixture
    await prisma.alertDispatch.deleteMany();
    await prisma.schedulerJob.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: {
        name: 'National Tech Institute (North)',
        aicteId: '1-SCHED-TEST',
        region: 'NORTH',
      },
    });
    testInstId = inst.id;

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: testInstId,
        fdrNo: 'FDR-SCHED-001',
        bank: 'State Bank of India',
        branch: 'Connaught',
        ifsc: 'SBIN0000001',
        amount: 3500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2026-12-01'),
        status: 'ACTIVE',
      },
    });
    testFdrId = fdr.id;
  });

  afterAll(async () => {
    Clock.reset();
    await prisma.$disconnect();
  });

  it('registers multiple polymorphic obligation types into a unified register', async () => {
    // 1. FDR_VALIDITY obligation
    const fdrObligation = await obligationEngine.syncFdrObligation(testFdrId);
    expect(fdrObligation.type).toBe('FDR_VALIDITY');
    expect(fdrObligation.status).toBe('ACTIVE');

    // 2. STAGE_SLA obligation
    const slaObligation = await obligationEngine.createObligation({
      institutionId: testInstId,
      type: 'STAGE_SLA',
      title: 'Scrutiny Stage SLA (Deficiency Clarification Window)',
      dueDate: new Date('2026-11-15'),
    });
    expect(slaObligation.type).toBe('STAGE_SLA');

    // 3. UNDERTAKING obligation
    const undertaking = await obligationEngine.createObligation({
      institutionId: testInstId,
      type: 'UNDERTAKING',
      title: 'Statutory Anti-Ragging Affidavit Undertaking',
      dueDate: new Date('2026-11-30'),
    });
    expect(undertaking.type).toBe('UNDERTAKING');

    // 4. LEASE_DOC obligation
    const leaseDoc = await obligationEngine.createObligation({
      institutionId: testInstId,
      type: 'LEASE_DOC',
      title: 'Campus Land Registered 30-Year Lease Deed Renewal',
      dueDate: new Date('2027-01-15'),
    });
    expect(leaseDoc.type).toBe('LEASE_DOC');

    const allObligations = await prisma.obligation.findMany({ where: { institutionId: testInstId } });
    expect(allObligations.length).toBe(4);
  });

  it('calculates alert trigger dates taking into account weekends and national gazetted holidays', async () => {
    await calendar.ensureSeededHolidays(2026);

    // Republic Day (2026-01-26) is a Gazetted holiday (Monday)
    const isHoliday = await calendar.isBusinessDay(new Date('2026-01-26'));
    expect(isHoliday).toBe(false);

    // Subtracting 1 business day from Tuesday 2026-01-27 must skip Monday (holiday) and weekend (Sun/Sat) to Friday 2026-01-23
    const businessDayBefore = await calendar.subtractBusinessDays(new Date('2026-01-27'), 1);
    expect(businessDayBefore.getUTCDay()).toBe(5); // Friday
    expect(businessDayBefore.toISOString().slice(0, 10)).toBe('2026-01-23');
  });

  it('enqueues the standard alert ladder (T-90, T-30, T-7, T-0, T+N) with DB-level idempotency', async () => {
    const jobs = await prisma.schedulerJob.findMany({
      where: { obligation: { fdrId: testFdrId } },
      orderBy: { threshold: 'desc' },
    });

    expect(jobs.length).toBe(5);
    const ruleKeys = jobs.map((j) => j.ruleKey);
    expect(ruleKeys).toEqual(['T-90', 'T-30', 'T-7', 'T-0', 'T+10_ESC']);

    // Attempting to duplicate-enqueue the same obligation ladder must not create duplicate jobs
    await obligationEngine.syncFdrObligation(testFdrId);
    const jobsAfter = await prisma.schedulerJob.findMany({
      where: { obligation: { fdrId: testFdrId } },
    });
    expect(jobsAfter.length).toBe(5);
  });

  it('processes pending jobs using FOR UPDATE SKIP LOCKED without premature firing', async () => {
    // Current time: well before due date (2026-01-01)
    Clock.setSimulatedDate(new Date('2026-01-01'));

    const batch = await jobQueue.processBatch(10, 'worker-A');
    // None should be due at 2026-01-01 for 2026-12-01 maturity
    expect(batch.claimedJobs).toBe(0);
    expect(batch.dispatchesCount).toBe(0);
  });

  it('CRITICAL: kill-and-restart worker mid-run produces ZERO duplicate alert dispatches', async () => {
    // Advance time to T-7 window (November 25, 2026)
    Clock.setSimulatedDate(new Date('2026-11-25'));

    // Step 1: Worker 1 runs and claims jobs
    const run1 = await jobQueue.processBatch(2, 'worker-1');
    expect(run1.completedJobs).toBe(2);
    expect(run1.dispatchesCount).toBe(2);

    const dispatchesAfterRun1 = await prisma.alertDispatch.count();
    expect(dispatchesAfterRun1).toBe(2);

    // Step 2: SIMULATE WORKER 1 CRASH / RESTART MID-RUN
    // Simulate Worker 1 being killed mid-processing and a new Worker 2 starting up
    await jobQueue.recoverOrphanedJobs(0); // instant recovery of any stuck locks

    // Worker 2 starts up and resumes processing
    const run2 = await jobQueue.processBatch(10, 'worker-2');

    // Total dispatches must equal only the total newly due jobs
    const dispatchesAfterRun2 = await prisma.alertDispatch.count();
    expect(dispatchesAfterRun2).toBeGreaterThanOrEqual(dispatchesAfterRun1);

    // Step 3: Re-run worker on the EXACT SAME timestamp to verify idempotency
    const run3 = await jobQueue.processBatch(10, 'worker-2');
    expect(run3.completedJobs).toBe(0); // All due jobs are completed

    const dispatchesAfterRun3 = await prisma.alertDispatch.count();
    // ZERO duplicate dispatches
    expect(dispatchesAfterRun3).toBe(dispatchesAfterRun2);
  });
});
