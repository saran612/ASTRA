import { DiscrepancySeverity } from '@fdr-vault/shared';

export interface DiscrepancyResult {
  code: string;
  severity: DiscrepancySeverity;
  detail: string;
}

export interface RuleEngineInput {
  fdr: {
    id?: string;
    institutionId: string;
    fdrNo: string;
    bank: string;
    branch: string;
    ifsc: string;
    amount: number;
    issueDate: Date;
    maturityDate: Date;
    lienMarked: boolean;
  };
  documents: Array<{ type: string; sha256: string; fdrId: string; institutionId?: string }>;
  existingFdrs: Array<{ id: string; institutionId: string; fdrNo: string; bank: string }>;
  allDocuments: Array<{ id: string; fdrId: string; sha256: string; institutionId: string }>;
  rulesConfig: {
    minValidityDays?: number;
    depositSlabs?: Record<string, number>;
    requiredDocTypes?: string[];
  };
  institutionCategory?: string;
}

// Known bank to IFSC prefix mappings
export const BANK_IFSC_MAP: Record<string, string> = {
  'STATE BANK OF INDIA': 'SBIN',
  'PUNJAB NATIONAL BANK': 'PUNB',
  'BANK OF BARODA': 'BARB',
  'CANARA BANK': 'CNRB',
  'UNION BANK OF INDIA': 'UBIN',
  'HDFC BANK': 'HDFC',
  'ICICI BANK': 'ICIC',
  'AXIS BANK': 'UTIB',
  'INDIAN BANK': 'IDIB',
  'CENTRAL BANK OF INDIA': 'CBIN',
};

export function checkDateInvalid(fdr: { issueDate: Date; maturityDate: Date }): DiscrepancyResult | null {
  if (fdr.maturityDate <= fdr.issueDate) {
    return {
      code: 'DATE_INVALID',
      severity: 'HIGH',
      detail: `Maturity date (${fdr.maturityDate.toISOString().slice(0, 10)}) must be strictly later than issue date (${fdr.issueDate.toISOString().slice(0, 10)}).`,
    };
  }
  return null;
}

export function checkValidityTooShort(
  fdr: { issueDate: Date; maturityDate: Date },
  minValidityDays: number = 365 * 3
): DiscrepancyResult | null {
  const diffMs = fdr.maturityDate.getTime() - fdr.issueDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < minValidityDays) {
    return {
      code: 'VALIDITY_TOO_SHORT',
      severity: 'MEDIUM',
      detail: `FDR validity period (${diffDays} days) is less than the mandatory minimum (${minValidityDays} days).`,
    };
  }
  return null;
}

export function checkAmountBelowSlab(
  amount: number,
  category: string = 'DEFAULT',
  slabs: Record<string, number> = { DEFAULT: 1000000 }
): DiscrepancyResult | null {
  const minRequired = slabs[category] ?? slabs['DEFAULT'] ?? 1000000;
  if (amount < minRequired) {
    return {
      code: 'AMOUNT_BELOW_SLAB',
      severity: 'HIGH',
      detail: `FDR amount (₹${amount.toLocaleString('en-IN')}) is below the required deposit slab (₹${minRequired.toLocaleString('en-IN')}) for category '${category}'.`,
    };
  }
  return null;
}

export function checkDuplicateFdrNo(
  fdr: { id?: string; institutionId: string; fdrNo: string; bank: string },
  existingFdrs: Array<{ id: string; institutionId: string; fdrNo: string; bank: string }>
): DiscrepancyResult | null {
  const cleanFdrNo = fdr.fdrNo.trim().toUpperCase();
  const cleanBank = fdr.bank.trim().toUpperCase();

  const match = existingFdrs.find(
    (other) =>
      other.id !== fdr.id &&
      other.institutionId !== fdr.institutionId &&
      other.fdrNo.trim().toUpperCase() === cleanFdrNo &&
      other.bank.trim().toUpperCase() === cleanBank
  );

  if (match) {
    return {
      code: 'DUPLICATE_FDR_NO',
      severity: 'HIGH',
      detail: `Possible double pledge detected: FDR No '${fdr.fdrNo}' at bank '${fdr.bank}' is already pledged by another institution.`,
    };
  }
  return null;
}

export function checkDuplicateDocHash(
  currentDocs: Array<{ sha256: string }>,
  fdrId?: string,
  institutionId?: string,
  allDocs: Array<{ fdrId: string; sha256: string; institutionId: string }> = []
): DiscrepancyResult | null {
  for (const doc of currentDocs) {
    const match = allDocs.find(
      (other) =>
        other.sha256 === doc.sha256 &&
        other.fdrId !== fdrId &&
        other.institutionId !== institutionId
    );
    if (match) {
      return {
        code: 'DUPLICATE_DOCUMENT_HASH',
        severity: 'HIGH',
        detail: `Security alert: Document hash ${doc.sha256.slice(0, 10)}... was previously submitted by another institution.`,
      };
    }
  }
  return null;
}

export function checkIfscBankMismatch(bank: string, ifsc: string): DiscrepancyResult | null {
  const upperBank = bank.trim().toUpperCase();
  const upperIfsc = ifsc.trim().toUpperCase();

  for (const [knownBank, prefix] of Object.entries(BANK_IFSC_MAP)) {
    if (upperBank.includes(knownBank) || knownBank.includes(upperBank)) {
      if (!upperIfsc.startsWith(prefix)) {
        return {
          code: 'IFSC_BANK_MISMATCH',
          severity: 'MEDIUM',
          detail: `IFSC '${ifsc}' does not start with expected prefix '${prefix}' for '${bank}'.`,
        };
      }
    }
  }
  return null;
}

export function checkLienNotMarked(lienMarked: boolean): DiscrepancyResult | null {
  if (!lienMarked) {
    return {
      code: 'LIEN_NOT_MARKED',
      severity: 'HIGH',
      detail: 'FDR is not flagged as lien marked in favour of AICTE.',
    };
  }
  return null;
}

export function checkMissingDocuments(
  uploadedDocTypes: string[],
  requiredTypes: string[] = ['FDR_RECEIPT', 'JOINT_LIEN_LETTER']
): DiscrepancyResult | null {
  const missing = requiredTypes.filter((req) => !uploadedDocTypes.includes(req));
  if (missing.length > 0) {
    return {
      code: 'MISSING_DOCUMENT',
      severity: 'MEDIUM',
      detail: `Missing required compliance documents: ${missing.join(', ')}.`,
    };
  }
  return null;
}

/**
 * Pure evaluation function running all discrepancy checks.
 */
export function evaluateAllRules(input: RuleEngineInput): DiscrepancyResult[] {
  const results: DiscrepancyResult[] = [];

  const dateCheck = checkDateInvalid(input.fdr);
  if (dateCheck) results.push(dateCheck);

  const validityCheck = checkValidityTooShort(input.fdr, input.rulesConfig.minValidityDays);
  if (validityCheck) results.push(validityCheck);

  const amountCheck = checkAmountBelowSlab(
    input.fdr.amount,
    input.institutionCategory,
    input.rulesConfig.depositSlabs
  );
  if (amountCheck) results.push(amountCheck);

  const duplicateFdr = checkDuplicateFdrNo(input.fdr, input.existingFdrs);
  if (duplicateFdr) results.push(duplicateFdr);

  const duplicateHash = checkDuplicateDocHash(
    input.documents,
    input.fdr.id,
    input.fdr.institutionId,
    input.allDocuments
  );
  if (duplicateHash) results.push(duplicateHash);

  const ifscCheck = checkIfscBankMismatch(input.fdr.bank, input.fdr.ifsc);
  if (ifscCheck) results.push(ifscCheck);

  const lienCheck = checkLienNotMarked(input.fdr.lienMarked);
  if (lienCheck) results.push(lienCheck);

  const docTypes = input.documents.map((d) => d.type);
  const missingDocs = checkMissingDocuments(docTypes, input.rulesConfig.requiredDocTypes);
  if (missingDocs) results.push(missingDocs);

  return results;
}
