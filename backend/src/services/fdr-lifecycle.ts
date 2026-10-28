import { PrismaClient, Prisma } from '@prisma/client';
import { FdrStatus, Role, validateTransition, TransitionContext } from '@fdr-vault/shared';
import { Clock } from './clock.js';
import { computeAuditHash, GENESIS_HASH } from './audit.js';

export interface TransitionParams {
  fdrId: string;
  toStatus: FdrStatus;
  actor: {
    id: string;
    role: Role;
  };
  remarks?: string;
  meta?: Record<string, unknown>;
}

export class FdrLifecycleService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Execute state transition in a single DB transaction.
   * Updates status, writes FdrEvent row, and appends to AuditLog hash-chain.
   */
  async transition(params: TransitionParams) {
    const { fdrId, toStatus, actor, remarks, meta = {} } = params;
    const now = Clock.now();

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch current FDR record with discrepancies
      const fdr = await tx.fdr.findUnique({
        where: { id: fdrId },
        include: {
          discrepancies: {
            where: { status: 'OPEN' },
          },
        },
      });

      if (!fdr) {
        throw new Error(`FDR record not found with id ${fdrId}`);
      }

      const fromStatus = fdr.status as FdrStatus;
      if (fromStatus === toStatus) {
        throw new Error(`FDR ${fdrId} is already in status ${toStatus}`);
      }

      // 2. Build context and validate transition
      const ctx: TransitionContext = {
        actorRole: actor.role,
        hasOpenDiscrepancies: fdr.discrepancies.length > 0,
      };

      const validation = validateTransition(fromStatus, toStatus, ctx);
      if (!validation.allowed) {
        throw new Error(`Invalid transition: ${validation.reason}`);
      }

      // 3. Update FDR status
      const updatedFdr = await tx.fdr.update({
        where: { id: fdrId },
        data: {
          status: toStatus,
        },
      });

      // If replacement FDR reaches ACTIVE and has supersedesFdrId, transition old FDR to RENEWED
      if (toStatus === 'ACTIVE' && fdr.supersedesFdrId) {
        const oldFdr = await tx.fdr.findUnique({ where: { id: fdr.supersedesFdrId } });
        if (oldFdr && ['EXPIRING', 'ACTIVE'].includes(oldFdr.status)) {
          await tx.fdr.update({
            where: { id: oldFdr.id },
            data: { status: 'RENEWED' },
          });

          await tx.fdrEvent.create({
            data: {
              fdrId: oldFdr.id,
              actorId: actor.id,
              fromStatus: oldFdr.status,
              toStatus: 'RENEWED',
              remarks: `Automatically marked RENEWED: superseded by new active FDR ${fdr.fdrNo}`,
              meta: { successorFdrId: fdr.id } as Prisma.InputJsonValue,
              ts: now,
            },
          });
        }
      }

      // 4. Write insert-only FdrEvent row
      const event = await tx.fdrEvent.create({
        data: {
          fdrId,
          actorId: actor.id,
          fromStatus,
          toStatus,
          remarks,
          meta: meta as Prisma.InputJsonValue,
          ts: now,
        },
      });

      // 5. Append to AuditLog hash chain
      const lastAudit = await tx.auditLog.findFirst({
        orderBy: { ts: 'desc' },
      });
      const prevHash = lastAudit ? lastAudit.hash : GENESIS_HASH;

      const payload = {
        fromStatus,
        toStatus,
        remarks,
        meta,
        eventId: event.id,
      };

      const hash = computeAuditHash(prevHash, {
        actorId: actor.id,
        action: `FDR_STATUS_TRANSITION_${toStatus}`,
        entity: 'Fdr',
        entityId: fdrId,
        payload,
        ts: now,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: `FDR_STATUS_TRANSITION_${toStatus}`,
          entity: 'Fdr',
          entityId: fdrId,
          payload: payload as Prisma.InputJsonValue,
          prevHash,
          hash,
          ts: now,
        },
      });

      return {
        fdr: updatedFdr,
        event,
        newStatus: toStatus,
      };
    });
  }

  /**
   * Verify the cryptographic integrity of the entire audit log chain.
   */
  async verifyAuditChain(): Promise<{ valid: boolean; totalRows: number; corruptedAtId?: string }> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { ts: 'asc' },
    });

    let currentExpectedPrevHash = GENESIS_HASH;

    for (const log of logs) {
      if (log.prevHash !== currentExpectedPrevHash) {
        return {
          valid: false,
          totalRows: logs.length,
          corruptedAtId: log.id,
        };
      }

      const recalculatedHash = computeAuditHash(log.prevHash, {
        actorId: log.actorId,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        payload: log.payload,
        ts: log.ts,
      });

      if (recalculatedHash !== log.hash) {
        return {
          valid: false,
          totalRows: logs.length,
          corruptedAtId: log.id,
        };
      }

      currentExpectedPrevHash = log.hash;
    }

    return {
      valid: true,
      totalRows: logs.length,
    };
  }
}
