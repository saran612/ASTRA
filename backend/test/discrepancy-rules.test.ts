import { describe, it, expect } from 'vitest';
import {
  checkDateInvalid,
  checkValidityTooShort,
  checkAmountBelowSlab,
  checkDuplicateFdrNo,
  checkDuplicateDocHash,
  checkIfscBankMismatch,
  checkLienNotMarked,
  checkMissingDocuments,
  evaluateAllRules,
} from '../src/services/discrepancy-rules.js';

describe('Milestone 5: Discrepancy Rule Engine (Pure Unit Tests)', () => {
  describe('Rule: DATE_INVALID', () => {
    it('catches invalid date when maturity <= issueDate (positive case)', () => {
      const res = checkDateInvalid({
        issueDate: new Date('2024-05-01'),
        maturityDate: new Date('2024-05-01'),
      });
      expect(res).not.toBeNull();
      expect(res?.code).toBe('DATE_INVALID');
      expect(res?.severity).toBe('HIGH');
    });

    it('passes when maturity is strictly greater than issueDate (negative case)', () => {
      const res = checkDateInvalid({
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
      });
      expect(res).toBeNull();
    });
  });

  describe('Rule: VALIDITY_TOO_SHORT', () => {
    it('flags validity under the configured 3-year minimum (positive case)', () => {
      const res = checkValidityTooShort({
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2025-01-01'), // only 1 year
      }, 365 * 3);
      expect(res).not.toBeNull();
      expect(res?.code).toBe('VALIDITY_TOO_SHORT');
    });

    it('passes when validity meets or exceeds minimum (negative case)', () => {
      const res = checkValidityTooShort({
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-02'),
      }, 365 * 3);
      expect(res).toBeNull();
    });
  });

  describe('Rule: AMOUNT_BELOW_SLAB', () => {
    it('flags amount below slab for institution category (positive case)', () => {
      const res = checkAmountBelowSlab(1500000, 'ENGINEERING_UG', { ENGINEERING_UG: 3500000 });
      expect(res).not.toBeNull();
      expect(res?.code).toBe('AMOUNT_BELOW_SLAB');
      expect(res?.severity).toBe('HIGH');
    });

    it('passes when amount meets slab (negative case)', () => {
      const res = checkAmountBelowSlab(3500000, 'ENGINEERING_UG', { ENGINEERING_UG: 3500000 });
      expect(res).toBeNull();
    });
  });

  describe('Rule: DUPLICATE_FDR_NO (Double pledge)', () => {
    it('detects duplicate bank + fdrNo across different institution (positive case)', () => {
      const res = checkDuplicateFdrNo(
        { id: 'fdr-1', institutionId: 'inst-1', fdrNo: 'FDR999', bank: 'State Bank of India' },
        [{ id: 'fdr-2', institutionId: 'inst-2', fdrNo: 'FDR999', bank: 'State Bank of India' }]
      );
      expect(res).not.toBeNull();
      expect(res?.code).toBe('DUPLICATE_FDR_NO');
      expect(res?.severity).toBe('HIGH');
    });

    it('ignores same FDR on same institution or different bank (negative case)', () => {
      const res = checkDuplicateFdrNo(
        { id: 'fdr-1', institutionId: 'inst-1', fdrNo: 'FDR999', bank: 'State Bank of India' },
        [{ id: 'fdr-2', institutionId: 'inst-2', fdrNo: 'FDR999', bank: 'Punjab National Bank' }]
      );
      expect(res).toBeNull();
    });
  });

  describe('Rule: DUPLICATE_DOCUMENT_HASH', () => {
    it('detects reused document hash from another institution (positive case)', () => {
      const res = checkDuplicateDocHash(
        [{ sha256: 'abc123hash' }],
        'fdr-1',
        'inst-1',
        [{ id: 'doc-x', fdrId: 'fdr-2', sha256: 'abc123hash', institutionId: 'inst-2' }]
      );
      expect(res).not.toBeNull();
      expect(res?.code).toBe('DUPLICATE_DOCUMENT_HASH');
      expect(res?.severity).toBe('HIGH');
    });

    it('passes when hash is unique (negative case)', () => {
      const res = checkDuplicateDocHash(
        [{ sha256: 'unique_hash_xyz' }],
        'fdr-1',
        'inst-1',
        [{ id: 'doc-x', fdrId: 'fdr-2', sha256: 'other_hash', institutionId: 'inst-2' }]
      );
      expect(res).toBeNull();
    });
  });

  describe('Rule: IFSC_BANK_MISMATCH', () => {
    it('flags when IFSC prefix does not match the bank (positive case)', () => {
      const res = checkIfscBankMismatch('State Bank of India', 'HDFC0001234');
      expect(res).not.toBeNull();
      expect(res?.code).toBe('IFSC_BANK_MISMATCH');
    });

    it('passes when IFSC prefix matches bank (negative case)', () => {
      const res = checkIfscBankMismatch('State Bank of India', 'SBIN0001234');
      expect(res).toBeNull();
    });
  });

  describe('Rule: LIEN_NOT_MARKED', () => {
    it('flags when lien is not marked (positive case)', () => {
      const res = checkLienNotMarked(false);
      expect(res).not.toBeNull();
      expect(res?.code).toBe('LIEN_NOT_MARKED');
    });

    it('passes when lien is marked (negative case)', () => {
      const res = checkLienNotMarked(true);
      expect(res).toBeNull();
    });
  });

  describe('Rule: MISSING_DOCUMENT', () => {
    it('flags missing required documents (positive case)', () => {
      const res = checkMissingDocuments(['FDR_RECEIPT'], ['FDR_RECEIPT', 'JOINT_LIEN_LETTER']);
      expect(res).not.toBeNull();
      expect(res?.code).toBe('MISSING_DOCUMENT');
      expect(res?.detail).toContain('JOINT_LIEN_LETTER');
    });

    it('passes when all required documents are provided (negative case)', () => {
      const res = checkMissingDocuments(['FDR_RECEIPT', 'JOINT_LIEN_LETTER'], [
        'FDR_RECEIPT',
        'JOINT_LIEN_LETTER',
      ]);
      expect(res).toBeNull();
    });
  });
});
