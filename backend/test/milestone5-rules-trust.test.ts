import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  evaluateAllRules,
  checkDateInvalid,
  checkValidityTooShort,
  checkAmountBelowSlab,
  checkDuplicateFdrNo,
  checkDuplicateDocHash,
  checkIfscBankMismatch,
  checkLienNotMarked,
  checkMissingDocuments,
} from '../src/services/discrepancy-rules.js';
import { FieldTrustService, CRITICAL_FDR_FIELDS } from '../src/services/trust.js';
import {
  ManualConfirmationVerifier,
  MockBankVerifier,
  generateBankInquiryLetter,
} from '../src/services/bank-verifier.js';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';
import { Clock } from '../src/services/clock.js';

const prisma = new PrismaClient();

describe('Milestone 5: Rules Engine, Trust Ledger & Bank Verification', () => {
  let testInstId: string;
  let testOtherInstId: string;
  let officerUser: any;

  beforeAll(async () => {
    // Clean up test data
    await prisma.alertDispatch.deleteMany();
    await prisma.schedulerJob.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.bankVerificationRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.fdrFieldTrust.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.document.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst1 = await prisma.institution.create({
      data: {
        aicteId: 'M5-INST-001',
        name: 'Delhi Institute of Engineering',
        region: 'NORTHERN',
      },
    });
    testInstId = inst1.id;

    const inst2 = await prisma.institution.create({
      data: {
        aicteId: 'M5-INST-002',
        name: 'Mumbai Polytechnic College',
        region: 'WESTERN',
      },
    });
    testOtherInstId = inst2.id;

    officerUser = await prisma.user.create({
      data: {
        email: 'officer.m5@aicte.gov.in',
        passwordHash: 'dummy-hash',
        role: 'REGIONAL_OFFICER',
        region: 'NORTHERN',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Pure Discrepancy Rules Engine', () => {
    const baseFdr = {
      institutionId: 'inst-1',
      fdrNo: 'FDR-M5-12345',
      bank: 'STATE BANK OF INDIA',
      branch: 'Parliament Street, New Delhi',
      ifsc: 'SBIN0000691',
      amount: 1500000,
      issueDate: new Date('2026-01-01'),
      maturityDate: new Date('2029-01-01'), // 3 years
      lienMarked: true,
    };

    it('DATE_INVALID: flags when maturityDate <= issueDate', () => {
      const invalid = checkDateInvalid({
        issueDate: new Date('2026-05-01'),
        maturityDate: new Date('2026-05-01'),
      });
      expect(invalid).not.toBeNull();
      expect(invalid?.code).toBe('DATE_INVALID');
      expect(invalid?.severity).toBe('HIGH');

      const valid = checkDateInvalid({
        issueDate: new Date('2026-01-01'),
        maturityDate: new Date('2027-01-01'),
      });
      expect(valid).toBeNull();
    });

    it('VALIDITY_TOO_SHORT: flags when tenure is less than minValidityDays', () => {
      const shortTenure = checkValidityTooShort({
        issueDate: new Date('2026-01-01'),
        maturityDate: new Date('2027-01-01'), // 1 year < 3 years
      }, 1095);
      expect(shortTenure).not.toBeNull();
      expect(shortTenure?.code).toBe('VALIDITY_TOO_SHORT');
      expect(shortTenure?.severity).toBe('MEDIUM');

      const validTenure = checkValidityTooShort({
        issueDate: new Date('2026-01-01'),
        maturityDate: new Date('2029-01-02'), // > 3 years
      }, 1095);
      expect(validTenure).toBeNull();
    });

    it('AMOUNT_BELOW_SLAB: flags when amount is below configured tier slab', () => {
      const belowSlab = checkAmountBelowSlab(500000, 'ENGINEERING', {
        ENGINEERING: 1500000,
        MANAGEMENT: 1000000,
      });
      expect(belowSlab).not.toBeNull();
      expect(belowSlab?.code).toBe('AMOUNT_BELOW_SLAB');
      expect(belowSlab?.severity).toBe('HIGH');

      const meetingSlab = checkAmountBelowSlab(1500000, 'ENGINEERING', {
        ENGINEERING: 1500000,
      });
      expect(meetingSlab).toBeNull();
    });

    it('DUPLICATE_FDR_NO: detects duplicate across different institutions only', () => {
      const existing = [
        { id: 'fdr-existing-1', institutionId: 'inst-OTHER', fdrNo: 'FDR-M5-12345', bank: 'STATE BANK OF INDIA' },
      ];

      const crossDup = checkDuplicateFdrNo(
        { id: 'fdr-new-1', institutionId: 'inst-CURRENT', fdrNo: 'FDR-M5-12345', bank: 'STATE BANK OF INDIA' },
        existing
      );
      expect(crossDup).not.toBeNull();
      expect(crossDup?.code).toBe('DUPLICATE_FDR_NO');
      expect(crossDup?.severity).toBe('HIGH');

      // Same institution re-submission/amendment is NOT flagged as cross-institution double pledge
      const sameInst = checkDuplicateFdrNo(
        { id: 'fdr-new-1', institutionId: 'inst-OTHER', fdrNo: 'FDR-M5-12345', bank: 'STATE BANK OF INDIA' },
        existing
      );
      expect(sameInst).toBeNull();
    });

    it('DUPLICATE_DOCUMENT_HASH: detects re-used document hash across different institutions', () => {
      const allDocs = [
        { id: 'doc-1', fdrId: 'fdr-old', sha256: 'deadbeef12345678', institutionId: 'inst-OTHER' },
      ];

      const dupDoc = checkDuplicateDocHash(
        [{ sha256: 'deadbeef12345678' }],
        'fdr-new',
        'inst-CURRENT',
        allDocs
      );
      expect(dupDoc).not.toBeNull();
      expect(dupDoc?.code).toBe('DUPLICATE_DOCUMENT_HASH');
      expect(dupDoc?.severity).toBe('HIGH');

      // Same institution re-upload is allowed
      const sameInstDoc = checkDuplicateDocHash(
        [{ sha256: 'deadbeef12345678' }],
        'fdr-new',
        'inst-OTHER',
        allDocs
      );
      expect(sameInstDoc).toBeNull();
    });

    it('IFSC_BANK_MISMATCH: detects mismatched bank and IFSC prefix', () => {
      const mismatch = checkIfscBankMismatch('STATE BANK OF INDIA', 'HDFC0001234');
      expect(mismatch).not.toBeNull();
      expect(mismatch?.code).toBe('IFSC_BANK_MISMATCH');

      const match = checkIfscBankMismatch('STATE BANK OF INDIA', 'SBIN0000691');
      expect(match).toBeNull();
    });

    it('LIEN_NOT_MARKED: flags unencumbered FDR', () => {
      const unencumbered = checkLienNotMarked(false);
      expect(unencumbered).not.toBeNull();
      expect(unencumbered?.code).toBe('LIEN_NOT_MARKED');

      const lienMarked = checkLienNotMarked(true);
      expect(lienMarked).toBeNull();
    });

    it('MISSING_DOCUMENT: flags missing mandatory receipts', () => {
      const missing = checkMissingDocuments(['FDR_RECEIPT'], ['FDR_RECEIPT', 'JOINT_LIEN_LETTER']);
      expect(missing).not.toBeNull();
      expect(missing?.code).toBe('MISSING_DOCUMENT');

      const complete = checkMissingDocuments(
        ['FDR_RECEIPT', 'JOINT_LIEN_LETTER'],
        ['FDR_RECEIPT', 'JOINT_LIEN_LETTER']
      );
      expect(complete).toBeNull();
    });

    it('evaluateAllRules runs full matrix cleanly', () => {
      const cleanInput = {
        fdr: baseFdr,
        documents: [
          { type: 'FDR_RECEIPT', sha256: 'hash1', fdrId: 'f-1' },
          { type: 'JOINT_LIEN_LETTER', sha256: 'hash2', fdrId: 'f-1' },
        ],
        existingFdrs: [],
        allDocuments: [],
        rulesConfig: {
          minValidityDays: 1095,
          depositSlabs: { DEFAULT: 1000000 },
          requiredDocTypes: ['FDR_RECEIPT', 'JOINT_LIEN_LETTER'],
        },
      };

      const results = evaluateAllRules(cleanInput);
      expect(results).toHaveLength(0);
    });
  });

  describe('Field Trust Ledger & Bank Verification Flow', () => {
    let testFdr: any;
    let trustService: FieldTrustService;
    let lifecycleService: FdrLifecycleService;

    beforeAll(async () => {
      trustService = new FieldTrustService(prisma);
      lifecycleService = new FdrLifecycleService(prisma);

      testFdr = await prisma.fdr.create({
        data: {
          institutionId: testInstId,
          fdrNo: 'FDR-M5-777888',
          bank: 'STATE BANK OF INDIA',
          branch: 'Connaught Place',
          ifsc: 'SBIN0000691',
          amount: 2500000,
          issueDate: new Date('2026-01-01'),
          maturityDate: new Date('2031-01-01'),
          lienMarked: true,
          status: 'SUBMITTED',
        },
      });

      // Initialize trust rows
      await trustService.initializeTrust(testFdr.id, {
        fdrNo: testFdr.fdrNo,
        bank: testFdr.bank,
        branch: testFdr.branch,
        ifsc: testFdr.ifsc,
        amount: Number(testFdr.amount),
        issueDate: testFdr.issueDate,
        maturityDate: testFdr.maturityDate,
        lienMarked: testFdr.lienMarked,
      });
    });

    it('initializes all 8 critical fields as INSTITUTION claimed', async () => {
      const trustRows = await prisma.fdrFieldTrust.findMany({
        where: { fdrId: testFdr.id },
      });

      expect(trustRows).toHaveLength(8);
      for (const row of trustRows) {
        expect(row.source).toBe('INSTITUTION');
        expect(row.confirmedBy).toBeNull();
      }
    });

    it('promotes an individual field to OFFICER_ENTERED upon officer scrutiny', async () => {
      const updated = await trustService.confirmField(
        testFdr.id,
        'branch',
        'Connaught Place (Main Branch)',
        'OFFICER_ENTERED',
        officerUser.id,
        Clock.now()
      );

      expect(updated.source).toBe('OFFICER_ENTERED');
      expect(updated.value).toBe('Connaught Place (Main Branch)');
      expect(updated.confirmedBy).toBe(officerUser.id);
    });

    it('generates a formal bank inquiry letter with AICTE letterhead details', () => {
      const letter = generateBankInquiryLetter({
        fdrNo: testFdr.fdrNo,
        bank: testFdr.bank,
        branch: testFdr.branch,
        ifsc: testFdr.ifsc,
        amount: 2500000,
        issueDate: testFdr.issueDate,
        maturityDate: testFdr.maturityDate,
        institutionName: 'Delhi Institute of Engineering',
        aicteId: 'M5-INST-001',
      });

      expect(letter).toContain('ALL INDIA COUNCIL FOR TECHNICAL EDUCATION (AICTE)');
      expect(letter).toContain('FDR Number         : FDR-M5-777888');
      expect(letter).toContain('STATE BANK OF INDIA');
      expect(letter).toContain('Joint Lien Status  : Lien Marked in favour of Member Secretary, AICTE');
    });

    it('ManualConfirmationVerifier promotes all critical fields to BANK_CONFIRMED', async () => {
      // Transition FDR to UNDER_SCRUTINY
      await lifecycleService.transition({
        fdrId: testFdr.id,
        toStatus: 'UNDER_SCRUTINY',
        actor: { id: officerUser.id, role: officerUser.role },
        remarks: 'Commencing officer scrutiny',
      });

      const verifier = new ManualConfirmationVerifier(prisma, trustService, lifecycleService);
      const reqId = await verifier.requestVerification(testFdr.id, officerUser.id);

      expect(reqId).toBeDefined();

      // Confirm verification
      await verifier.confirmVerification(
        reqId,
        {
          status: 'CONFIRMED',
          confirmedFields: {
            fdrNo: testFdr.fdrNo,
            bank: testFdr.bank,
            amount: '2500000',
            lienMarked: 'true',
          },
          bankRemarks: 'Genuine deposit verified with branch ledger',
        },
        officerUser.id
      );

      const req = await prisma.bankVerificationRequest.findUnique({ where: { id: reqId } });
      expect(req?.status).toBe('CONFIRMED');

      const fdrTrust = await prisma.fdrFieldTrust.findUnique({
        where: { fdrId_field: { fdrId: testFdr.id, field: 'fdrNo' } },
      });
      expect(fdrTrust?.source).toBe('BANK_CONFIRMED');
      expect(fdrTrust?.confirmedBy).toBe(officerUser.id);

      // Verify lifecycle transitioned to VERIFIED
      const currentFdr = await prisma.fdr.findUnique({ where: { id: testFdr.id } });
      expect(currentFdr?.status).toBe('VERIFIED');
    });

    it('MockBankVerifier simulates confirmation labeled [DEMO ONLY]', async () => {
      const mockVerifier = new MockBankVerifier(prisma, trustService, lifecycleService);
      expect(mockVerifier.isMock).toBe(true);
      expect(mockVerifier.name).toContain('[DEMO ONLY]');

      const reqId = await mockVerifier.requestVerification(testFdr.id, officerUser.id);
      await mockVerifier.confirmVerification(
        reqId,
        {
          status: 'CONFIRMED',
          confirmedFields: {
            amount: '2500000',
            maturityDate: testFdr.maturityDate.toISOString(),
          },
          bankRemarks: 'Simulated automated bank confirmation (DEMO MOCK)',
        },
        officerUser.id
      );

      const req = await prisma.bankVerificationRequest.findUnique({ where: { id: reqId } });
      expect(req?.status).toBe('CONFIRMED');
      expect((req?.meta as any)?.bankRemarks).toContain('DEMO MOCK');
    });
  });
});
