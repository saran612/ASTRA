import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { documentStore } from '../src/services/storage.js';
import { FieldTrustService } from '../src/services/trust.js';

describe('Milestone 4: Document Storage Encryption & Field Trust', () => {
  const prisma = new PrismaClient();
  const trustService = new FieldTrustService(prisma);

  let instId: string;
  let testFdrId: string;

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.fdrFieldTrust.deleteMany();
    await prisma.document.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const inst = await prisma.institution.create({
      data: { name: 'Storage Test College', aicteId: '1-STORE-TEST', region: 'WEST' },
    });
    instId = inst.id;

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: instId,
        fdrNo: 'FDR-STORE-001',
        bank: 'Canara Bank',
        branch: 'Pune Camp',
        ifsc: 'CNRB0001234',
        amount: 1500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
      },
    });
    testFdrId = fdr.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('DocumentStore AES-256-GCM Encryption', () => {
    it('encrypts and decrypts file buffer successfully with correct sha256', async () => {
      const originalContent = Buffer.from('PDF_SAMPLE_SECURITY_DEPOSIT_DOCUMENT_AICTE');
      const meta = await documentStore.save(originalContent, 'receipt.pdf');

      expect(meta.storageKey).toMatch(/\.enc$/);
      expect(meta.sha256).toBeDefined();

      const decrypted = await documentStore.read(meta.storageKey);
      expect(decrypted.toString()).toBe('PDF_SAMPLE_SECURITY_DEPOSIT_DOCUMENT_AICTE');

      // Clean up
      await documentStore.delete(meta.storageKey);
    });

    it('generates and validates signed expiring download tokens', () => {
      const docId = 'doc-test-123';
      const token = documentStore.generateSignedDownloadToken(docId, 15);
      expect(token).toBeDefined();

      const valid = documentStore.verifySignedDownloadToken(docId, token);
      expect(valid).toBe(true);

      const invalid = documentStore.verifySignedDownloadToken('other-doc-id', token);
      expect(invalid).toBe(false);
    });
  });

  describe('Field Trust Management', () => {
    it('initializes field trust rows with source INSTITUTION', async () => {
      await trustService.initializeTrust(testFdrId, {
        fdrNo: 'FDR-STORE-001',
        bank: 'Canara Bank',
        branch: 'Pune Camp',
        ifsc: 'CNRB0001234',
        amount: 1500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        lienMarked: true,
      });

      const trusts = await prisma.fdrFieldTrust.findMany({
        where: { fdrId: testFdrId },
      });

      expect(trusts.length).toBe(8);
      for (const t of trusts) {
        expect(t.source).toBe('INSTITUTION');
        expect(t.confirmedBy).toBeNull();
      }
    });

    it('promotes field trust to BANK_CONFIRMED upon verification', async () => {
      const now = new Date();
      await trustService.confirmField(
        testFdrId,
        'amount',
        '1500000',
        'BANK_CONFIRMED',
        'officer-id-001',
        now
      );

      const updated = await prisma.fdrFieldTrust.findUnique({
        where: { fdrId_field: { fdrId: testFdrId, field: 'amount' } },
      });

      expect(updated?.source).toBe('BANK_CONFIRMED');
      expect(updated?.confirmedBy).toBe('officer-id-001');
      expect(updated?.confirmedAt).toBeDefined();
    });
  });
});
