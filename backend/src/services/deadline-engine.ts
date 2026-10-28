import { PrismaClient, Role } from '@prisma/client';
import { Clock } from './clock.js';
import { FdrLifecycleService } from './fdr-lifecycle.js';

export interface AlertNotification {
  fdrId: string;
  ruleKey: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  recipientRole: Role;
  recipientId?: string;
  dueDate: Date;
  message: string;
}

export interface Notifier {
  send(notification: AlertNotification): Promise<void>;
}

export class ConsoleAndInboxNotifier implements Notifier {
  constructor(private prisma: PrismaClient) {}

  async send(n: AlertNotification): Promise<void> {
    // 1. In-app Alert record (idempotent upsert via unique compound index)
    await this.prisma.alert.upsert({
      where: {
        fdrId_ruleKey_recipientRole: {
          fdrId: n.fdrId,
          ruleKey: n.ruleKey,
          recipientRole: n.recipientRole,
        },
      },
      create: {
        fdrId: n.fdrId,
        ruleKey: n.ruleKey,
        level: n.level,
        recipientRole: n.recipientRole,
        recipientId: n.recipientId,
        dueDate: n.dueDate,
        firedAt: Clock.now(),
      },
      update: {
        // Idempotent: don't overwrite if already created
      },
    });

    // 2. Prototype stub log (substituting real SMTP)
    console.log(
      `[ALERT DISPATCHED] To: ${n.recipientRole} | Level: ${n.level} | Key: ${n.ruleKey} | FDR: ${n.fdrId} | Due: ${n.dueDate.toISOString().slice(0, 10)}`
    );
  }
}

export class DeadlineScanEngine {
  private lifecycleService: FdrLifecycleService;
  private notifier: Notifier;

  constructor(private prisma: PrismaClient) {
    this.lifecycleService = new FdrLifecycleService(prisma);
    this.notifier = new ConsoleAndInboxNotifier(prisma);
  }

  /**
   * Run deadline scan using Clock.now()
   */
  async runScan() {
    const now = Clock.now();
    const systemUser = await this.getSystemActor();

    // 1. Fetch config thresholds
    const ruleConfigs = await this.prisma.ruleConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const r of ruleConfigs) configMap[r.key] = r.value;

    const thresholds: number[] = configMap['aicte.reminder_days']?.thresholds ?? [90, 60, 30, 7, 0];
    const escalation = configMap['aicte.escalation_unacked_days'] ?? { regionalOfficerDays: 7, bureauHeadDays: 14 };

    // 2. Fetch candidate FDRs (ACTIVE, EXPIRING)
    const fdrs = await this.prisma.fdr.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
      },
      include: {
        institution: {
          include: { users: { where: { role: 'INSTITUTION' } } },
        },
        supersededBy: true,
      },
    });

    let alertsFired = 0;
    let autoTransitions = 0;

    for (const fdr of fdrs) {
      const maturityTime = new Date(fdr.maturityDate).getTime();
      const diffMs = maturityTime - now.getTime();
      const daysUntilMaturity = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Auto transition: ACTIVE -> EXPIRING at T-90
      if (fdr.status === 'ACTIVE' && daysUntilMaturity <= 90) {
        try {
          await this.lifecycleService.transition({
            fdrId: fdr.id,
            toStatus: 'EXPIRING',
            actor: { id: systemUser.id, role: 'ADMIN' },
            remarks: `Automated scan: FDR reached T-90 expiry horizon (${daysUntilMaturity} days to maturity)`,
          });
          autoTransitions++;
        } catch (e: any) {
          console.warn(`Could not transition FDR ${fdr.id} to EXPIRING:`, e.message);
        }
      }

      // Auto transition: EXPIRING -> LAPSED if overdue and no active renewal
      if (fdr.status === 'EXPIRING' && daysUntilMaturity < 0) {
        const hasActiveRenewal = fdr.supersededBy && fdr.supersededBy.status === 'ACTIVE';
        if (!hasActiveRenewal) {
          try {
            await this.lifecycleService.transition({
              fdrId: fdr.id,
              toStatus: 'LAPSED',
              actor: { id: systemUser.id, role: 'ADMIN' },
              remarks: `Automated scan: FDR matured on ${fdr.maturityDate.toISOString().slice(0, 10)} without active renewal`,
            });
            autoTransitions++;
          } catch (e: any) {
            console.warn(`Could not transition FDR ${fdr.id} to LAPSED:`, e.message);
          }
        }
      }

      // Check and fire alerts per threshold
      for (const t of thresholds) {
        if (daysUntilMaturity <= t) {
          const ruleKey = t === 0 ? 'OVERDUE' : `EXPIRING_T${t}`;
          const level = t <= 7 ? 'CRITICAL' : t <= 30 ? 'WARNING' : 'INFO';

          // Base alert to institution
          await this.notifier.send({
            fdrId: fdr.id,
            ruleKey,
            level,
            recipientRole: 'INSTITUTION',
            recipientId: fdr.institution.users[0]?.id,
            dueDate: fdr.maturityDate,
            message: `FDR ${fdr.fdrNo} is ${t === 0 ? 'overdue' : `due in ${t} days`}. Submit renewal or release.`,
          });
          alertsFired++;

          // Escalation ladder check:
          const existingInstAlert = await this.prisma.alert.findUnique({
            where: {
              fdrId_ruleKey_recipientRole: {
                fdrId: fdr.id,
                ruleKey,
                recipientRole: 'INSTITUTION',
              },
            },
          });

          if (existingInstAlert && !existingInstAlert.ackedAt) {
            const ageMs = now.getTime() - existingInstAlert.firedAt.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);

            // Escalate to Regional Officer
            if (ageDays >= escalation.regionalOfficerDays) {
              await this.notifier.send({
                fdrId: fdr.id,
                ruleKey: `${ruleKey}_ESC_OFFICER`,
                level: 'WARNING',
                recipientRole: 'OFFICER',
                dueDate: fdr.maturityDate,
                message: `Escalated alert: Institution unacknowledged for FDR ${fdr.fdrNo} for >${escalation.regionalOfficerDays} days.`,
              });
              alertsFired++;
            }

            // Escalate to Bureau Head (ADMIN/AUTHORITY)
            if (ageDays >= escalation.bureauHeadDays) {
              await this.notifier.send({
                fdrId: fdr.id,
                ruleKey: `${ruleKey}_ESC_HEAD`,
                level: 'CRITICAL',
                recipientRole: 'AUTHORITY',
                dueDate: fdr.maturityDate,
                message: `Bureau Escalation: FDR ${fdr.fdrNo} unacknowledged for >${escalation.bureauHeadDays} days.`,
              });
              alertsFired++;
            }
          }
        }
      }
    }

    return {
      scanDate: now,
      evaluatedFdrs: fdrs.length,
      alertsFired,
      autoTransitions,
    };
  }

  private async getSystemActor(): Promise<{ id: string; role: Role }> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return { id: admin.id, role: 'ADMIN' };
    const user = await this.prisma.user.findFirst();
    return { id: user?.id || 'system-actor', role: 'ADMIN' };
  }
}
