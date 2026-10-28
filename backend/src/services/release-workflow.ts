import { PrismaClient, ReleaseRequestStatus, Role } from '@prisma/client';
import { FdrLifecycleService } from './fdr-lifecycle.js';
import { Clock } from './clock.js';

export interface ReleaseChecklist {
  courseClosureApproved: boolean;
  noPendingAuditQueries: boolean;
  noStudentGrievancePending: boolean;
  originalFdReceiptSurrendered: boolean;
  officerRecommendationSigned: boolean;
}

export class ReleaseWorkflowService {
  private lifecycleService: FdrLifecycleService;

  constructor(private prisma: PrismaClient) {
    this.lifecycleService = new FdrLifecycleService(prisma);
  }

  /**
   * Institution initiates a release/refund request.
   */
  async createReleaseRequest(fdrId: string, reason: string, actor: { id: string; role: Role }) {
    const fdr = await this.prisma.fdr.findUnique({
      where: { id: fdrId },
      include: {
        discrepancies: { where: { status: 'OPEN' } },
      },
    });

    if (!fdr) throw new Error('FDR not found');

    if (fdr.discrepancies.length > 0) {
      throw new Error('Cannot request release: FDR has open discrepancies that must be resolved first.');
    }

    if (!['ACTIVE', 'EXPIRING', 'RENEWED'].includes(fdr.status)) {
      throw new Error(`Cannot request release for FDR in status ${fdr.status}`);
    }

    // Create ReleaseRequest row
    const releaseReq = await this.prisma.releaseRequest.create({
      data: {
        fdrId,
        reason,
        status: 'PENDING_OFFICER',
        checklist: {
          courseClosureApproved: false,
          noPendingAuditQueries: false,
          noStudentGrievancePending: false,
          originalFdReceiptSurrendered: false,
          officerRecommendationSigned: false,
        },
        ts: Clock.now(),
      },
    });

    // Transition state
    await this.lifecycleService.transition({
      fdrId,
      toStatus: 'RELEASE_REQUESTED',
      actor,
      remarks: `Release requested by institution: ${reason}`,
    });

    return releaseReq;
  }

  /**
   * Officer completes compliance checklist and gives first-level sign-off.
   */
  async officerApprove(
    requestId: string,
    checklist: ReleaseChecklist,
    officerId: string,
    remarks?: string
  ) {
    const req = await this.prisma.releaseRequest.findUnique({
      where: { id: requestId },
      include: { fdr: true },
    });

    if (!req) throw new Error('Release request not found');
    if (req.status !== 'PENDING_OFFICER') {
      throw new Error(`Request is in status ${req.status}, officer sign-off not applicable`);
    }

    // Verify all checklist items are ticked
    const allChecked = Object.values(checklist).every((v) => v === true);
    if (!allChecked) {
      throw new Error('Cannot recommend release: All regulatory checklist items must be verified and checked.');
    }

    // Verify no open discrepancies exist
    const fdrWithDisc = await this.prisma.fdr.findUnique({
      where: { id: req.fdrId },
      include: { discrepancies: { where: { status: 'OPEN' } } },
    });
    if (fdrWithDisc && fdrWithDisc.discrepancies.length > 0) {
      throw new Error('Cannot recommend release: FDR has open discrepancies that must be resolved first.');
    }

    const updated = await this.prisma.releaseRequest.update({
      where: { id: requestId },
      data: {
        status: 'PENDING_AUTHORITY',
        checklist: checklist as any,
        officerApprovedBy: officerId,
        officerRemarks: remarks || 'All compliance checks satisfied; recommended for release.',
      },
    });

    await this.lifecycleService.transition({
      fdrId: req.fdrId,
      toStatus: 'RELEASE_APPROVED',
      actor: { id: officerId, role: 'OFFICER' },
      remarks: remarks || 'Officer first-level approval granted.',
    });

    return updated;
  }

  /**
   * Final approval by Competent Authority (Member Secretary / Bureau Head).
   */
  async authorityApprove(
    requestId: string,
    authority: { id: string; role?: Role } | string,
    remarks?: string
  ) {
    const authorityId = typeof authority === 'string' ? authority : authority.id;
    const authorityRole = (typeof authority === 'object' && authority.role) ? authority.role : 'BUREAU';

    const req = await this.prisma.releaseRequest.findUnique({
      where: { id: requestId },
      include: { fdr: true },
    });

    if (!req) throw new Error('Release request not found');
    if (req.status !== 'PENDING_AUTHORITY') {
      throw new Error(`Request is in status ${req.status}, awaiting officer review first`);
    }

    const updated = await this.prisma.releaseRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        authorityApprovedBy: authorityId,
        authorityRemarks: remarks || 'Final approval granted for FDR release/refund.',
      },
    });

    await this.lifecycleService.transition({
      fdrId: req.fdrId,
      toStatus: 'RELEASED',
      actor: { id: authorityId, role: authorityRole as Role },
      remarks: remarks || 'Competent Authority final sign-off recorded. FDR released.',
      meta: {
        disclaimer: 'SYSTEM RECORDS AND ROUTES APPROVALS ONLY. DOES NOT DISBURSE FUNDS OR MOVE MONEY.',
      },
    });

    return updated;
  }

  /**
   * Reject release request (restores FDR to ACTIVE).
   */
  async rejectRequest(
    requestId: string,
    actor: { id: string; role: Role },
    rejectionReason: string
  ) {
    const req = await this.prisma.releaseRequest.findUnique({
      where: { id: requestId },
      include: { fdr: true },
    });

    if (!req) throw new Error('Release request not found');

    const updated = await this.prisma.releaseRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        officerRemarks: rejectionReason,
      },
    });

    await this.lifecycleService.transition({
      fdrId: req.fdrId,
      toStatus: 'ACTIVE',
      actor,
      remarks: `Release request rejected: ${rejectionReason}`,
    });

    return updated;
  }
}
