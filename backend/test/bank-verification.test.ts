import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  ManualConfirmationVerifier,
  MockBankVerifier,
  generateBankInquiryLetter,
} from '../src/services/bank-verifier.js';
import { FieldTrustService } from '../src/services/trust.js';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';

describe('Milestone 6: Bank Verification Flow (Mock & Manual)', () => {
  const prisma = new PrismaClient();
  const trustService = new FieldTrustService(prisma);
  const lifecycleService = new FdrLifecycleService(prisma);

  const manualVerifier = new ManualConfirmationVerifier(prisma, trustService, lifecycleService);
  const mockVerifier = new MockBankVerifier(prisma, trustService, lifecycleService);

  let officerId: string;
  let instId: string;
  let testFdrId: string;

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.fdrFieldTrust.deleteMany();
    await prisma.bankVerificationRequest.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: { name: 'Bank Verify Institute', aicteId: '1-BV-001', region: 'CENTRAL' },
    });
    instId = inst.id;

    const officer = await prisma.user.create({
      data: { email: 'officer.bv@example.com', passwordHash: 'hash', role: 'OFFICER' },
    });
    officerId = officer.id;

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: instId,
        fdrNo: 'FDR-BV-999',
        bank: 'State Bank of India',
        branch: 'Connaught Place',
        ifsc: 'SBIN0000691',
        amount: 2000000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'UNDER_SCRUTINY',
      },
    });
    testFdrId = fdr.id;

    await trustService.initializeTrust(testFdrId, {
      fdrNo: 'FDR-BV-999',
      bank: 'State Bank of India',
      branch: 'Connaught Place',
      ifsc: 'SBIN0000691',
      amount: 2000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      lienMarked: true,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('generates a formal downloadable inquiry letter with institution & FDR particulars', () => {
    const letter = generateBankInquiryLetter({
      fdrNo: 'FDR-BV-999',
      bank: 'State Bank of India',
      branch: 'Connaught Place',
      ifsc: 'SBIN0000691',
      amount: 2000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      institutionName: 'Bank Verify Institute',
      aicteId: '1-BV-001',
    });

    expect(letter).toContain('ALL INDIA COUNCIL FOR TECHNICAL EDUCATION');
    expect(letter).toContain('FDR-BV-999');
    expect(letter).toContain('Connaught Place');
    expect(letter).toContain('1-BV-001');
  });

  it('creates and completes mock bank verification, flipping field trust to BANK_CONFIRMED', async () => {
    const reqId = await mockVerifier.requestVerification(testFdrId, officerId);
    expect(reqId).toBeDefined();

    await mockVerifier.confirmVerification(
      reqId,
      {
        status: 'CONFIRMED',
        confirmedFields: {
          fdrNo: 'FDR-BV-999',
          bank: 'State Bank of India',
          amount: '2000000',
        },
        bankRemarks: 'Confirmed genuine by Branch Manager',
      },
      officerId
    );

    const fdrTrust = await prisma.fdrFieldTrust.findUnique({
      where: { fdrId_field: { fdrId: testFdrId, field: 'amount' } },
    });

    expect(fdrTrust?.source).toBe('BANK_CONFIRMED');
    expect(fdrTrust?.confirmedBy).toBe(officerId);

    // Verify FDR transitioned to VERIFIED
    const updatedFdr = await prisma.fdr.findUnique({ where: { id: testFdrId } });
    expect(updatedFdr?.status).toBe('VERIFIED');
  });
});
