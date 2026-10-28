import { PrismaClient } from '@prisma/client';
import { evaluateAllRules, DiscrepancyResult } from './discrepancy-rules.js';
import { FdrLifecycleService } from './fdr-lifecycle.js';
import { Clock } from './clock.js';

export class DiscrepancyService {
  private lifecycleService: FdrLifecycleService;

  constructor(private prisma: PrismaClient) {
    this.lifecycleService = new FdrLifecycleService(prisma);
  }

  /**
   * Run discrepancy rules against an FDR and record open discrepancies.
   * If any discrepancies are found, transitions FDR status to DISCREPANCY.
   */
  async runDiscrepancyScan(fdrId: string, actorId: string = 'SYSTEM') {
    const fdr = await this.prisma.fdr.findUnique({
      where: { id: fdrId },
      include: {
        documents: true,
      },
    });

    if (!fdr) throw new Error(`FDR ${fdrId} not found`);

    // Fetch rules config
    const ruleConfigs = await this.prisma.ruleConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const r of ruleConfigs) {
      configMap[r.key] = r.value;
    }

    const minValidityDays = configMap['aicte.min_validity_days']?.minDays ?? 365 * 3;
    const depositSlabs = configMap['aicte.deposit_slabs'] ?? { DEFAULT: 1000000 };
    const requiredDocTypes = configMap['aicte.required_document_types']?.types ?? [
      'FDR_RECEIPT',
      'JOINT_LIEN_LETTER',
    ];

    // Fetch existing FDRs for duplicate check
    const existingFdrs = await this.prisma.fdr.findMany({
      select: { id: true, institutionId: true, fdrNo: true, bank: true },
    });

    // Fetch all documents for hash reuse check
    const allDocs = await this.prisma.document.findMany({
      select: {
        id: true,
        fdrId: true,
        sha256: true,
        fdr: { select: { institutionId: true } },
      },
    });

    const formattedAllDocs = allDocs.map((d) => ({
      id: d.id,
      fdrId: d.fdrId,
      sha256: d.sha256,
      institutionId: d.fdr.institutionId,
    }));

    const results = evaluateAllRules({
      fdr: {
        id: fdr.id,
        institutionId: fdr.institutionId,
        fdrNo: fdr.fdrNo,
        bank: fdr.bank,
        branch: fdr.branch,
        ifsc: fdr.ifsc,
        amount: Number(fdr.amount),
        issueDate: fdr.issueDate,
        maturityDate: fdr.maturityDate,
        lienMarked: fdr.lienMarked,
      },
      documents: fdr.documents,
      existingFdrs,
      allDocuments: formattedAllDocs,
      rulesConfig: {
        minValidityDays,
        depositSlabs,
        requiredDocTypes,
      },
      institutionCategory: 'DEFAULT',
    });

    // Sync findings with DB
    const createdDiscrepancies = [];
    const now = Clock.now();

    for (const res of results) {
      const existing = await this.prisma.discrepancy.findFirst({
        where: {
          fdrId: fdr.id,
          code: res.code,
          status: 'OPEN',
        },
      });

      if (!existing) {
        const disc = await this.prisma.discrepancy.create({
          data: {
            fdrId: fdr.id,
            code: res.code,
            severity: res.severity,
            detail: res.detail,
            status: 'OPEN',
            raisedBy: actorId,
            ts: now,
          },
        });
        createdDiscrepancies.push(disc);
      }
    }

    // Auto transition to DISCREPANCY if there are open discrepancies and current state allows it
    if (results.length > 0 && fdr.status === 'UNDER_SCRUTINY') {
      try {
        let realActorId = actorId;
        const userExists = await this.prisma.user.findUnique({ where: { id: actorId } });
        if (!userExists) {
          realActorId = await this.getSystemUserId();
        }
        await this.lifecycleService.transition({
          fdrId: fdr.id,
          toStatus: 'DISCREPANCY',
          actor: { id: realActorId, role: 'OFFICER' },
          remarks: `Automated discrepancy engine detected ${results.length} issue(s)`,
        });
      } catch (err: any) {
        console.warn('Transition to DISCREPANCY skipped or disallowed:', err.message);
      }
    }

    return {
      totalFound: results.length,
      discrepancies: results,
    };
  }

  private async getSystemUserId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return admin.id;
    const user = await this.prisma.user.findFirst();
    return user?.id || 'system-actor';
  }

  /**
   * Resolve a discrepancy (HIGH severity requires remarks).
   */
  async resolveDiscrepancy(
    discrepancyId: string,
    resolvedBy: string,
    remarks?: string
  ) {
    const disc = await this.prisma.discrepancy.findUnique({ where: { id: discrepancyId } });
    if (!disc) throw new Error('Discrepancy not found');

    if (disc.severity === 'HIGH' && (!remarks || remarks.trim().length === 0)) {
      throw new Error('Resolving a HIGH severity discrepancy strictly requires officer remarks.');
    }

    return this.prisma.discrepancy.update({
      where: { id: discrepancyId },
      data: {
        status: 'RESOLVED',
        resolvedBy,
        remarks: remarks || null,
      },
    });
  }

  /**
   * Waive a discrepancy with officer justification.
   */
  async waiveDiscrepancy(
    discrepancyId: string,
    officerId: string,
    remarks: string
  ) {
    if (!remarks || remarks.trim().length === 0) {
      throw new Error('Waiving a discrepancy requires justification remarks.');
    }

    return this.prisma.discrepancy.update({
      where: { id: discrepancyId },
      data: {
        status: 'WAIVED',
        resolvedBy: officerId,
        remarks,
      },
    });
  }
}
