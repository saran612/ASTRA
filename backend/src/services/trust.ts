import { PrismaClient } from '@prisma/client';
import { TrustSource } from '@fdr-vault/shared';

export const CRITICAL_FDR_FIELDS = [
  'fdrNo',
  'bank',
  'branch',
  'ifsc',
  'amount',
  'issueDate',
  'maturityDate',
  'lienMarked',
] as const;

export type CriticalFdrField = (typeof CRITICAL_FDR_FIELDS)[number];

export class FieldTrustService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initialize or overwrite field trust entries with source claimed by institution.
   */
  async initializeTrust(fdrId: string, fields: Record<CriticalFdrField, string | number | boolean | Date>) {
    const operations = CRITICAL_FDR_FIELDS.map((field) => {
      let stringVal = '';
      const rawVal = fields[field];
      if (rawVal instanceof Date) {
        stringVal = rawVal.toISOString();
      } else if (typeof rawVal === 'boolean') {
        stringVal = rawVal ? 'true' : 'false';
      } else if (rawVal !== undefined && rawVal !== null) {
        stringVal = String(rawVal);
      }

      return this.prisma.fdrFieldTrust.upsert({
        where: {
          fdrId_field: {
            fdrId,
            field,
          },
        },
        create: {
          fdrId,
          field,
          value: stringVal,
          source: 'INSTITUTION',
        },
        update: {
          value: stringVal,
          source: 'INSTITUTION',
          confirmedBy: null,
          confirmedAt: null,
        },
      });
    });

    return Promise.all(operations);
  }

  /**
   * Promote field trust to BANK_CONFIRMED (or OFFICER_ENTERED) upon scrutiny/verification.
   */
  async confirmField(
    fdrId: string,
    field: CriticalFdrField,
    confirmedValue: string,
    source: TrustSource,
    officerId: string,
    now: Date
  ) {
    return this.prisma.fdrFieldTrust.upsert({
      where: {
        fdrId_field: {
          fdrId,
          field,
        },
      },
      create: {
        fdrId,
        field,
        value: confirmedValue,
        source,
        confirmedBy: officerId,
        confirmedAt: now,
      },
      update: {
        value: confirmedValue,
        source,
        confirmedBy: officerId,
        confirmedAt: now,
      },
    });
  }
}
