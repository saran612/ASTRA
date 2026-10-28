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

      // Find the true tip of the cryptographic audit chain
      const tipResult = await tx.$queryRaw<Array<{ hash: string }>>`
        SELECT hash FROM "AuditLog"
        WHERE hash NOT IN (SELECT "prevHash" FROM "AuditLog")
        LIMIT 1
      `;
      let runningPrevHash = tipResult.length > 0 ? tipResult[0].hash : GENESIS_HASH;

      // If replacement FDR reaches ACTIVE and has supersedesFdrId, transition old FDR to RENEWED
      if (toStatus === 'ACTIVE' && fdr.supersedesFdrId) {
        const oldFdr = await tx.fdr.findUnique({ where: { id: fdr.supersedesFdrId } });
        if (oldFdr && ['EXPIRING', 'ACTIVE', 'LAPSED'].includes(oldFdr.status)) {
          await tx.fdr.update({
            where: { id: oldFdr.id },
            data: { status: 'RENEWED' },
          });

          const renewalEvent = await tx.fdrEvent.create({
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

          const oldPayload = {
            fromStatus: oldFdr.status,
            toStatus: 'RENEWED',
            remarks: `Automatically marked RENEWED: superseded by new active FDR ${fdr.fdrNo}`,
            meta: { successorFdrId: fdr.id },
            eventId: renewalEvent.id,
          };

          const oldHash = computeAuditHash(runningPrevHash, {
            actorId: actor.id,
            action: 'FDR_STATUS_TRANSITION_RENEWED',
            entity: 'Fdr',
            entityId: oldFdr.id,
            payload: oldPayload,
            ts: now,
          });

          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: 'FDR_STATUS_TRANSITION_RENEWED',
              entity: 'Fdr',
              entityId: oldFdr.id,
              payload: oldPayload as Prisma.InputJsonValue,
              prevHash: runningPrevHash,
              hash: oldHash,
              ts: now,
            },
          });

          runningPrevHash = oldHash;
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

      const payload = {
        fromStatus,
        toStatus,
        remarks,
        meta,
        eventId: event.id,
      };

      const hash = computeAuditHash(runningPrevHash, {
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
          prevHash: runningPrevHash,
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
    const logs = await this.prisma.auditLog.findMany();

    if (logs.length === 0) {
      return { valid: true, totalRows: 0 };
    }

    const byPrevHash = new Map<string, (typeof logs)[0]>();
    for (const log of logs) {
      if (byPrevHash.has(log.prevHash)) {
        return { valid: false, totalRows: logs.length, corruptedAtId: log.id };
      }
      byPrevHash.set(log.prevHash, log);
    }

    let currentExpectedPrevHash = GENESIS_HASH;
    let visitedCount = 0;
    const visitedIds = new Set<string>();

    while (byPrevHash.has(currentExpectedPrevHash)) {
      const log = byPrevHash.get(currentExpectedPrevHash)!;
      visitedCount++;
      visitedIds.add(log.id);

      const recalculatedHash = computeAuditHash(log.prevHash, {
        actorId: log.actorId,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        payload: log.payload,
        ts: log.ts,
      });

      if (recalculatedHash !== log.hash) {
        return { valid: false, totalRows: logs.length, corruptedAtId: log.id };
      }

      currentExpectedPrevHash = log.hash;
    }

    if (visitedCount !== logs.length) {
      // Find the first unvisited row in chronological order
      const unvisited = logs
        .filter((l) => !visitedIds.has(l.id))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime());

      return {
        valid: false,
        totalRows: logs.length,
        corruptedAtId: unvisited[0]?.id,
      };
    }

    return {
      valid: true,
      totalRows: logs.length,
    };
  }
}
