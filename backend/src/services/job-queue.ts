import { PrismaClient } from '@prisma/client';
import { Clock } from './clock.js';
import { sendDevEmail, StubSmsGateway } from './notifier.js';

export interface ProcessJobsResult {
  claimedJobs: number;
  completedJobs: number;
  dispatchesCount: number;
  errors: string[];
}

export class PostgresJobQueue {
  private smsGateway: StubSmsGateway;

  constructor(private prisma: PrismaClient) {
    this.smsGateway = new StubSmsGateway();
  }

  /**
   * Acquire and process pending jobs using PostgreSQL 'FOR UPDATE SKIP LOCKED'.
   * Highly resilient: Safe to run concurrently across multiple workers.
   */
  async processBatch(batchSize: number = 20, workerId: string = 'worker-1'): Promise<ProcessJobsResult> {
    const now = Clock.now();
    const result: ProcessJobsResult = {
      claimedJobs: 0,
      completedJobs: 0,
      dispatchesCount: 0,
      errors: [],
    };

    // 1. Transactionally lock pending jobs using FOR UPDATE SKIP LOCKED
    const claimedJobIds = await this.prisma.$transaction(async (tx) => {
      const rawRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "SchedulerJob"
         WHERE status = 'PENDING' AND "runAfter" <= $1
         ORDER BY "runAfter" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        now,
        batchSize
      );

      if (rawRows.length === 0) return [];

      const ids = rawRows.map((r) => r.id);

      await tx.schedulerJob.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          lockedBy: workerId,
        },
      });

      return ids;
    });

    result.claimedJobs = claimedJobIds.length;
    if (claimedJobIds.length === 0) return result;

    // 2. Process each claimed job
    for (const jobId of claimedJobIds) {
      try {
        const job = await this.prisma.schedulerJob.findUnique({
          where: { id: jobId },
          include: {
            obligation: {
              include: { institution: true, fdr: true },
            },
          },
        });

        if (!job) continue;

        const recipientEmail = `${job.targetRole.toLowerCase()}@aicte-demo.gov.in`;
        const alertContent = `Regulatory Obligation Alert [${job.ruleKey}]: ${job.obligation.title} for ${job.obligation.institution.name} is due on ${job.obligation.dueDate.toISOString().slice(0, 10)}.`;

        // Idempotent dispatch insertion: unique on (obligationId, ruleKey, threshold, channel)
        await this.prisma.alertDispatch.upsert({
          where: {
            obligationId_ruleKey_threshold_channel: {
              obligationId: job.obligationId,
              ruleKey: job.ruleKey,
              threshold: job.threshold,
              channel: job.channel,
            },
          },
          update: {},
          create: {
            obligationId: job.obligationId,
            jobId: job.id,
            ruleKey: job.ruleKey,
            threshold: job.threshold,
            channel: job.channel,
            recipient: recipientEmail,
            level: job.threshold <= 7 ? 'CRITICAL' : job.threshold <= 30 ? 'WARNING' : 'INFO',
            content: alertContent,
            dispatchedAt: Clock.now(),
          },
        });
        result.dispatchesCount++;

        // If obligation is linked to an FDR and channel is IN_APP, write to legacy Alert table for compatibility
        if (job.obligation.fdrId && job.channel === 'IN_APP') {
          await this.prisma.alert.upsert({
            where: {
              fdrId_ruleKey_recipientRole: {
                fdrId: job.obligation.fdrId,
                ruleKey: job.ruleKey,
                recipientRole: job.targetRole,
              },
            },
            update: {},
            create: {
              fdrId: job.obligation.fdrId,
              ruleKey: job.ruleKey,
              level: job.threshold <= 7 ? 'CRITICAL' : job.threshold <= 30 ? 'WARNING' : 'INFO',
              recipientRole: job.targetRole,
              dueDate: job.obligation.dueDate,
              firedAt: Clock.now(),
            },
          });
        }

        // Fire channel integrations
        if (job.channel === 'SMTP') {
          await sendDevEmail({
            to: recipientEmail,
            subject: `AICTE Alert: ${job.ruleKey} - ${job.obligation.title}`,
            body: alertContent,
          });
        } else if (job.channel === 'SMS') {
          await this.smsGateway.sendSms({
            toPhoneNumber: '+919876543210',
            messageBody: alertContent,
          });
        }

        // Mark completed
        await this.prisma.schedulerJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            lockedAt: null,
            lockedBy: null,
          },
        });
        result.completedJobs++;
      } catch (err: any) {
        result.errors.push(`Job ${jobId} failed: ${err.message}`);
        await this.prisma.schedulerJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            lastError: err.message,
            attempts: { increment: 1 },
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
    }

    return result;
  }

  /**
   * Recovers any orphaned jobs stuck in PROCESSING state due to simulated crashes or worker death.
   */
  async recoverOrphanedJobs(staleThresholdMinutes: number = 5): Promise<number> {
    const cutoff = new Date(Clock.now().getTime() - staleThresholdMinutes * 60 * 1000);
    const res = await this.prisma.schedulerJob.updateMany({
      where: {
        status: 'PROCESSING',
        lockedAt: { lt: cutoff },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
      },
    });
    return res.count;
  }
}
