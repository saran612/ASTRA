import { PrismaClient, Role, FdrStatus, TrustSource } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { documentStore } from '../src/services/storage.js';
import { computeAuditHash, GENESIS_HASH } from '../src/services/audit.js';

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('Cleaning existing records...');
  await prisma.auditLog.deleteMany();
  await prisma.fdrEvent.deleteMany();
  await prisma.fdrFieldTrust.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.discrepancy.deleteMany();
  await prisma.bankVerificationRequest.deleteMany();
  await prisma.releaseRequest.deleteMany();
  await prisma.document.deleteMany();
  await prisma.fdr.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.ruleConfig.deleteMany();
}

async function seedRules() {
  console.log('Seeding rules config...');
  const rules = [
    {
      key: 'aicte.deposit_slabs',
      value: {
        ENGINEERING_UG: 3500000,
        MANAGEMENT_PG: 1500000,
        PHARMACY_UG: 1500000,
        POLYTECHNIC: 1000000,
        DEFAULT: 1000000,
      },
      note: 'Minimum FDR deposit required per institution program type',
      source: 'TODO: replace with AICTE handbook clause (seeded placeholder)',
    },
    {
      key: 'aicte.min_validity_days',
      value: { minDays: 365 * 3 },
      note: 'Minimum initial validity duration for security deposit FDR',
      source: 'TODO: replace with AICTE handbook clause (seeded placeholder)',
    },
    {
      key: 'aicte.reminder_days',
      value: { thresholds: [90, 60, 30, 7, 0] },
      note: 'Days before maturity to raise expiring alerts',
      source: 'TODO: replace with AICTE handbook clause (seeded placeholder)',
    },
    {
      key: 'aicte.escalation_unacked_days',
      value: { regionalOfficerDays: 7, bureauHeadDays: 14 },
      note: 'Days after which unacknowledged alerts escalate',
      source: 'TODO: replace with AICTE handbook clause (seeded placeholder)',
    },
    {
      key: 'aicte.required_document_types',
      value: { types: ['FDR_RECEIPT', 'JOINT_LIEN_LETTER'] },
      note: 'Mandatory documents required for FDR submission approval',
      source: 'TODO: replace with AICTE handbook clause (seeded placeholder)',
    },
  ];

  for (const r of rules) {
    await prisma.ruleConfig.create({ data: r });
  }
}

async function main() {
  await cleanDatabase();
  await seedRules();

  const passwordHash = await argon2.hash('password123');

  console.log('Seeding institutions & users...');
  const regions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  const institutions = [
    { name: 'Northern Institute of Technology', aicteId: '1-NIT-DELHI', region: 'NORTH' },
    { name: 'Delhi School of Engineering', aicteId: '1-DSE-DELHI', region: 'NORTH' },
    { name: 'Southern College of Pharmacy', aicteId: '1-SCP-CHENNAI', region: 'SOUTH' },
    { name: 'Deccan Polytechnic Academy', aicteId: '1-DPA-HYDERABAD', region: 'SOUTH' },
    { name: 'Eastern Management Institute', aicteId: '1-EMI-KOLKATA', region: 'EAST' },
    { name: 'Bengal Engineering College', aicteId: '1-BEC-HOWRAH', region: 'EAST' },
    { name: 'Western Institute of Management', aicteId: '1-WIM-MUMBAI', region: 'WEST' },
    { name: 'Pune Advanced Technology College', aicteId: '1-PAT-PUNE', region: 'WEST' },
  ];

  const createdInstitutions: any[] = [];
  for (const instData of institutions) {
    const inst = await prisma.institution.create({ data: instData });
    createdInstitutions.push(inst);

    // Create Institution User
    const prefix = instData.aicteId.toLowerCase().replace(/[^a-z0-9]/g, '');
    await prisma.user.create({
      data: {
        email: `principal@${prefix}.edu.in`,
        passwordHash,
        role: 'INSTITUTION',
        institutionId: inst.id,
        region: instData.region,
      },
    });
  }

  // Demo user logins
  const demoUsers = [
    { email: 'inst.north@aicte-demo.edu.in', role: 'INSTITUTION', instIdx: 0, region: 'NORTH' },
    { email: 'officer.north@aicte-demo.gov.in', role: 'OFFICER', region: 'NORTH' },
    { email: 'officer.south@aicte-demo.gov.in', role: 'OFFICER', region: 'SOUTH' },
    { email: 'bureau.head@aicte-demo.gov.in', role: 'AUTHORITY', region: 'NORTH' },
    { email: 'admin@aicte-demo.gov.in', role: 'ADMIN', region: 'NORTH' },
  ];

  const createdUsers: Record<string, any> = {};
  for (const u of demoUsers) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        role: u.role as Role,
        institutionId: u.instIdx !== undefined ? createdInstitutions[u.instIdx].id : null,
        region: u.region,
      },
    });
    createdUsers[u.role] = user;
  }

  console.log('Seeding documents & sample files...');
  const samplePdfBytes = Buffer.from('%PDF-1.4 Mock FDR Deposit Document AICTE Form 2026');
  const sampleDocMeta = await documentStore.save(samplePdfBytes, 'fdr-sample.pdf');

  // Shared hash for duplicate test
  const sharedDuplicateDocMeta = await documentStore.save(
    Buffer.from('IDENTICAL_REUSED_PLEDGED_RECEIPT_DEFECT_PAYLOAD'),
    'reused-fdr.pdf'
  );

  console.log('Seeding 40 FDRs across all lifecycle statuses...');
  let prevAuditHash = GENESIS_HASH;

  const banks = [
    { bank: 'State Bank of India', ifsc: 'SBIN0000691', branch: 'New Delhi Main' },
    { bank: 'Punjab National Bank', ifsc: 'PUNB0001234', branch: 'Connaught Place' },
    { bank: 'Bank of Baroda', ifsc: 'BARB0000999', branch: 'Bandra West' },
    { bank: 'Canara Bank', ifsc: 'CNRB0001000', branch: 'Kolkata Central' },
    { bank: 'HDFC Bank', ifsc: 'HDFC0000555', branch: 'Anna Salai' },
    { bank: 'ICICI Bank', ifsc: 'ICIC0000111', branch: 'MG Road' },
  ];

  // We generate ~40 FDRs
  const fdrStatuses: FdrStatus[] = [
    'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE',
    'EXPIRING', 'EXPIRING', 'EXPIRING',
    'LAPSED', 'LAPSED',
    'RENEWED', 'RENEWED', 'RENEWED',
    'RELEASE_REQUESTED', 'RELEASE_APPROVED', 'RELEASED',
    'UNDER_SCRUTINY', 'UNDER_SCRUTINY', 'UNDER_SCRUTINY',
    'DISCREPANCY', 'DISCREPANCY',
    'VERIFIED', 'VERIFIED'
  ];

  let fdrCounter = 100;

  for (let i = 0; i < 34; i++) {
    const inst = createdInstitutions[i % createdInstitutions.length];
    const bankInfo = banks[i % banks.length];
    const status = fdrStatuses[i % fdrStatuses.length];
    fdrCounter++;

    const issueDate = new Date(2023, 0, 15 + i);
    // Determine maturity based on status
    let maturityDate: Date;
    if (status === 'EXPIRING') {
      maturityDate = new Date(2026, 10, 15 + (i % 30)); // In ~40-60 days
    } else if (status === 'LAPSED') {
      maturityDate = new Date(2026, 8, 1); // 1-2 months ago
    } else {
      maturityDate = new Date(2027, 0, 15 + i); // 1-2 years out
    }

    const fdr = await prisma.fdr.create({
      data: {
        institutionId: inst.id,
        fdrNo: `FDR-AICTE-${fdrCounter}`,
        bank: bankInfo.bank,
        branch: bankInfo.branch,
        ifsc: bankInfo.ifsc,
        amount: 3500000,
        issueDate,
        maturityDate,
        status,
        lienMarked: true,
      },
    });

    // Populate field trusts
    const trustSource: TrustSource = ['ACTIVE', 'VERIFIED', 'RELEASED', 'RENEWED'].includes(status)
      ? 'BANK_CONFIRMED'
      : 'INSTITUTION';

    const fields = ['fdrNo', 'bank', 'branch', 'ifsc', 'amount', 'issueDate', 'maturityDate', 'lienMarked'];
    for (const f of fields) {
      await prisma.fdrFieldTrust.create({
        data: {
          fdrId: fdr.id,
          field: f,
          value: f === 'lienMarked' ? 'true' : String((fdr as any)[f]),
          source: trustSource,
          confirmedBy: trustSource === 'BANK_CONFIRMED' ? createdUsers['OFFICER'].id : null,
          confirmedAt: trustSource === 'BANK_CONFIRMED' ? new Date() : null,
        },
      });
    }

    // Attach regular document
    await prisma.document.create({
      data: {
        fdrId: fdr.id,
        type: 'FDR_RECEIPT',
        storageKey: sampleDocMeta.storageKey,
        sha256: sampleDocMeta.sha256,
        uploadedBy: createdUsers['INSTITUTION'].id,
      },
    });

    // Audit log row
    const auditPayload = { fdrId: fdr.id, status };
    const hash = computeAuditHash(prevAuditHash, {
      actorId: createdUsers['ADMIN'].id,
      action: `SEED_FDR_${status}`,
      entity: 'Fdr',
      entityId: fdr.id,
      payload: auditPayload,
      ts: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        actorId: createdUsers['ADMIN'].id,
        action: `SEED_FDR_${status}`,
        entity: 'Fdr',
        entityId: fdr.id,
        payload: auditPayload,
        prevHash: prevAuditHash,
        hash,
      },
    });
    prevAuditHash = hash;
  }

  console.log('Seeding 6 DELIBERATE DEFECTS...');

  // DEFECT 1: DUPLICATE_FDR_NO (Double pledge across institutions)
  const defectFdr1 = await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[0].id,
      fdrNo: 'FDR-DOUBLE-PLEDGE-999',
      bank: 'State Bank of India',
      branch: 'Main Branch',
      ifsc: 'SBIN0000691',
      amount: 2500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      status: 'UNDER_SCRUTINY',
      lienMarked: true,
    },
  });

  const defectFdr2 = await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[1].id,
      fdrNo: 'FDR-DOUBLE-PLEDGE-999', // SAME FDR NO at SAME BANK, DIFFERENT INSTITUTION
      bank: 'State Bank of India',
      branch: 'Main Branch',
      ifsc: 'SBIN0000691',
      amount: 2500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      status: 'UNDER_SCRUTINY',
      lienMarked: true,
    },
  });

  // DEFECT 2: DUPLICATE_DOCUMENT_HASH (Reused document scan)
  await prisma.document.create({
    data: {
      fdrId: defectFdr1.id,
      type: 'FDR_RECEIPT',
      storageKey: sharedDuplicateDocMeta.storageKey,
      sha256: sharedDuplicateDocMeta.sha256,
      uploadedBy: createdUsers['INSTITUTION'].id,
    },
  });

  await prisma.document.create({
    data: {
      fdrId: defectFdr2.id,
      type: 'FDR_RECEIPT',
      storageKey: sharedDuplicateDocMeta.storageKey,
      sha256: sharedDuplicateDocMeta.sha256, // IDENTICAL HASH
      uploadedBy: createdUsers['INSTITUTION'].id,
    },
  });

  // DEFECT 3: DATE_INVALID (Maturity date earlier than or equal to issue date)
  await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[2].id,
      fdrNo: 'FDR-DEFECT-INVALID-DATE',
      bank: 'Punjab National Bank',
      branch: 'Connaught Place',
      ifsc: 'PUNB0001234',
      amount: 2000000,
      issueDate: new Date('2025-06-01'),
      maturityDate: new Date('2024-06-01'), // Maturity <= Issue
      status: 'UNDER_SCRUTINY',
      lienMarked: true,
    },
  });

  // DEFECT 4: VALIDITY_TOO_SHORT (Duration only 180 days, minimum is 3 years)
  await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[3].id,
      fdrNo: 'FDR-DEFECT-SHORT-VALIDITY',
      bank: 'Canara Bank',
      branch: 'Central',
      ifsc: 'CNRB0001000',
      amount: 2500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2024-07-01'), // Only 6 months
      status: 'UNDER_SCRUTINY',
      lienMarked: true,
    },
  });

  // DEFECT 5: IFSC_BANK_MISMATCH (Bank name is State Bank of India but IFSC is HDFC)
  await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[4].id,
      fdrNo: 'FDR-DEFECT-IFSC-MISMATCH',
      bank: 'State Bank of India',
      branch: 'Anna Salai',
      ifsc: 'HDFC0000555', // Mismatched prefix
      amount: 3000000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      status: 'UNDER_SCRUTINY',
      lienMarked: true,
    },
  });

  // DEFECT 6: LIEN_NOT_MARKED (Deposit not lien marked to AICTE)
  await prisma.fdr.create({
    data: {
      institutionId: createdInstitutions[5].id,
      fdrNo: 'FDR-DEFECT-NO-LIEN',
      bank: 'Bank of Baroda',
      branch: 'Bandra',
      ifsc: 'BARB0000999',
      amount: 2500000,
      issueDate: new Date('2024-01-01'),
      maturityDate: new Date('2027-01-01'),
      status: 'UNDER_SCRUTINY',
      lienMarked: false, // Defect
    },
  });

  console.log('Seed completed successfully. 40 total FDRs created with 6 seeded defects.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
