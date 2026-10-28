import { PrismaClient, Role, ObligationType, ObligationStatus } from '@prisma/client';
import { Clock } from './clock.js';
import { HolidayCalendarService } from './holiday-calendar.js';

export interface CreateObligationInput {
  institutionId: string;
  fdrId?: string;
  type: ObligationType;
  title: string;
  dueDate: Date;
  meta?: Record<string, unknown>;
}

export interface LadderThresholdConfig {
  ruleKey: string;
  thresholdDays: number; // positive = before due date, 0 = due date, negative = after due date
  targetRole: Role;
  channel: 'IN_APP' | 'SMTP' | 'SMS';
  level: 'INFO' | 'WARNING' | 'CRITICAL';
}

export const DEFAULT_LADDER_CONFIG: LadderThresholdConfig[] = [
  { ruleKey: 'T-90', thresholdDays: 90, targetRole: 'INSTITUTION', channel: 'IN_APP', level: 'INFO' },
  { ruleKey: 'T-30', thresholdDays: 30, targetRole: 'INSTITUTION', channel: 'IN_APP', level: 'WARNING' },
  { ruleKey: 'T-7', thresholdDays: 7, targetRole: 'REGIONAL_OFFICER', channel: 'IN_APP', level: 'CRITICAL' },
  { ruleKey: 'T-0', thresholdDays: 0, targetRole: 'INSTITUTION', channel: 'IN_APP', level: 'CRITICAL' },
  { ruleKey: 'T+10_ESC', thresholdDays: -10, targetRole: 'BUREAU', channel: 'IN_APP', level: 'CRITICAL' },
];

export class ObligationEngine {
  private calendar: HolidayCalendarService;

  constructor(private prisma: PrismaClient) {
    this.calendar = new HolidayCalendarService(prisma);
  }

  /**
   * Register a new obligation and plan its alert ladder jobs.
   */
  async createObligation(input: CreateObligationInput, ladder = DEFAULT_LADDER_CONFIG) {
    await this.calendar.ensureSeededHolidays(input.dueDate.getUTCFullYear());

    const obligation = await this.prisma.obligation.create({
      data: {
        institutionId: input.institutionId,
        fdrId: input.fdrId,
        type: input.type,
        title: input.title,
        dueDate: input.dueDate,
        status: 'ACTIVE',
        meta: input.meta || {},
        createdAt: Clock.now(),
      },
    });

    // Schedule ladder jobs based on business-day aware thresholds
    for (const step of ladder) {
      let runAfter: Date;
      if (step.thresholdDays > 0) {
        runAfter = await this.calendar.subtractBusinessDays(input.dueDate, step.thresholdDays);
      } else if (step.thresholdDays === 0) {
        runAfter = new Date(input.dueDate);
      } else {
        // T+N overdue days
        runAfter = new Date(input.dueDate.getTime() + Math.abs(step.thresholdDays) * 24 * 60 * 60 * 1000);
      }

      await this.prisma.schedulerJob.upsert({
        where: {
          obligationId_ruleKey_threshold: {
            obligationId: obligation.id,
            ruleKey: step.ruleKey,
            threshold: step.thresholdDays,
          },
        },
        update: {},
        create: {
          obligationId: obligation.id,
          ruleKey: step.ruleKey,
          threshold: step.thresholdDays,
          targetRole: step.targetRole,
          channel: step.channel,
          status: 'PENDING',
          runAfter,
          createdAt: Clock.now(),
        },
      });
    }

    return obligation;
  }

  /**
   * Synchronize an FDR instrument into the unified obligation register.
   */
  async syncFdrObligation(fdrId: string) {
    const fdr = await this.prisma.fdr.findUnique({
      where: { id: fdrId },
      include: { institution: true },
    });
    if (!fdr) throw new Error(`FDR ${fdrId} not found`);

    let obligation = await this.prisma.obligation.findFirst({
      where: { fdrId: fdr.id, type: 'FDR_VALIDITY' },
    });

    if (!obligation) {
      obligation = await this.createObligation({
        institutionId: fdr.institutionId,
        fdrId: fdr.id,
        type: 'FDR_VALIDITY',
        title: `Fixed Deposit Guarantee Validity (${fdr.bank} - ${fdr.fdrNo})`,
        dueDate: fdr.maturityDate,
        meta: {
          bank: fdr.bank,
          fdrNo: fdr.fdrNo,
          amount: Number(fdr.amount),
        },
      });
    }

    return obligation;
  }
}
