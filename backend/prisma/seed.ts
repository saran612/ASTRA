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
      source: 'APH 2024-27 Clause 4.2.8 (Deposit Amount Slabs by Program Tier)',
    },
    {
      key: 'aicte.min_validity_days',
      value: { minDays: 365 * 3 },
      note: 'Minimum initial validity duration for security deposit FDR',
      source: 'APH 2024-27 Clause 4.1.5 (Minimum Validity Tenure and Auto-Renewal Mandate)',
    },
    {
      key: 'aicte.reminder_days',
      value: { thresholds: [90, 60, 30, 7, 0] },
      note: 'Days before maturity to raise expiring alerts',
      source: 'APH 2024-27 Clause 4.1.5 (Multi-tier alert ladder)',
    },
    {
      key: 'aicte.escalation_unacked_days',
      value: { regionalOfficerDays: 7, bureauHeadDays: 14 },
      note: 'Days after which unacknowledged alerts escalate',
      source: 'APH 2024-27 Clause 4.3.4 (Scrutiny escalation timelines)',
    },
    {
      key: 'aicte.required_document_types',
      value: { types: ['FDR_RECEIPT', 'JOINT_LIEN_LETTER'] },
      note: 'Mandatory documents required for FDR submission approval',
      source: 'APH 2024-27 Clause 4.2.1 (Joint Lien Marking in Bank Books)',
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

  console.log('Seeding 16 institutions across all AICTE regions...');
  const institutionConfigs = [
    { name: 'Northern Institute of Technology', aicteId: '1-NIT-DELHI', region: 'NORTH' },
    { name: 'Delhi School of Engineering', aicteId: '1-DSE-DELHI', region: 'NORTH' },
    { name: 'Southern College of Pharmacy', aicteId: '1-SCP-CHENNAI', region: 'SOUTH' },
    { name: 'Deccan Polytechnic Academy', aicteId: '1-DPA-HYDERABAD', region: 'SOUTH' },
    { name: 'Eastern Management Institute', aicteId: '1-EMI-KOLKATA', region: 'EAST' },
    { name: 'Bengal Engineering College', aicteId: '1-BEC-HOWRAH', region: 'EAST' },
    { name: 'Western Institute of Management', aicteId: '1-WIM-MUMBAI', region: 'WEST' },
    { name: 'Pune Advanced Technology College', aicteId: '1-PAT-PUNE', region: 'WEST' },
    { name: 'Central Institute of Technology Bhopal', aicteId: '1-CIT-BHOPAL', region: 'CENTRAL' },
    { name: 'Indore College of Engineering', aicteId: '1-ICE-INDORE', region: 'CENTRAL' },
    { name: 'Chandigarh Institute of Architecture', aicteId: '1-CIA-CHD', region: 'NORTH_WEST' },
    { name: 'Jaipur Technical Institute', aicteId: '1-JTI-JAIPUR', region: 'NORTH_WEST' },
    { name: 'Bangalore College of Engineering', aicteId: '1-BCE-BLR', region: 'SOUTH_WEST' },
    { name: 'Mysore Institute of Technology', aicteId: '1-MIT-MYS', region: 'SOUTH_WEST' },
    { name: 'Guwahati Polytechnic Institute', aicteId: '1-GPI-GUW', region: 'NORTH_EAST' },
    { name: 'Assam Technical University Campus', aicteId: '1-ATU-SIL', region: 'NORTH_EAST' },
  ];

  const createdInstitutions: any[] = [];
  for (const instData of institutionConfigs) {
    const inst = await prisma.institution.create({ data: instData });
    createdInstitutions.push(inst);

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

  // Demo Administrative Logins
  const demoUsers = [
    { email: 'inst.north@aicte-demo.edu.in', role: 'INSTITUTION', instIdx: 0, region: 'NORTH' },
    { email: 'officer.north@aicte-demo.gov.in', role: 'REGIONAL_OFFICER', region: 'NORTH' },
    { email: 'officer.south@aicte-demo.gov.in', role: 'REGIONAL_OFFICER', region: 'SOUTH' },
    { email: 'bureau.head@aicte-demo.gov.in', role: 'BUREAU', region: 'NORTH' },
    { email: 'authority@aicte-demo.gov.in', role: 'AUTHORITY', region: 'NORTH' },
    { email: 'committee@aicte-demo.gov.in', role: 'COMMITTEE', region: 'NORTH' },
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

  // Shared hash artifacts for duplicate document tests
  const dupDocs: any[] = [];
  for (let d = 1; d <= 3; d++) {
    const dupMeta = await documentStore.save(
      Buffer.from(`IDENTICAL_REUSED_PLEDGED_RECEIPT_DEFECT_PAYLOAD_${d}`),
      `reused-fdr-${d}.pdf`
    );
    dupDocs.push(dupMeta);
  }

  const banks = [
    { bank: 'State Bank of India', ifsc: 'SBIN0000691', branch: 'New Delhi Main' },
    { bank: 'Punjab National Bank', ifsc: 'PUNB0001234', branch: 'Connaught Place' },
    { bank: 'Bank of Baroda', ifsc: 'BARB0000999', branch: 'Bandra West' },
    { bank: 'Canara Bank', ifsc: 'CNRB0001000', branch: 'Kolkata Central' },
    { bank: 'Union Bank of India', ifsc: 'UBIN0002000', branch: 'Nariman Point' },
    { bank: 'HDFC Bank', ifsc: 'HDFC0000555', branch: 'Anna Salai' },
    { bank: 'ICICI Bank', ifsc: 'ICIC0000111', branch: 'MG Road' },
    { bank: 'Axis Bank', ifsc: 'UTIB0000222', branch: 'Deccan Gymkhana' },
  ];

  console.log('Seeding 200 FDRs across realistic stage and bank distributions...');

  // Realistic stage distribution for 200 FDRs:
  // 20 SUBMITTED (10%), 40 UNDER_SCRUTINY (20%), 30 DISCREPANCY (15%),
  // 60 ACTIVE (30%), 20 EXPIRING (10%), 10 RENEWED (5%), 10 LAPSED (5%), 10 RELEASED (5%)
  const stageTargets: Array<{ status: FdrStatus; count: number }> = [
    { status: 'SUBMITTED', count: 20 },
    { status: 'UNDER_SCRUTINY', count: 40 },
    { status: 'DISCREPANCY', count: 30 },
    { status: 'ACTIVE', count: 60 },
    { status: 'EXPIRING', count: 20 },
    { status: 'RENEWED', count: 10 },
    { status: 'LAPSED', count: 10 },
    { status: 'RELEASED', count: 10 },
  ];

  let prevAuditHash = GENESIS_HASH;
  let fdrSeq = 1000;
  const allCreatedFdrs: any[] = [];

  for (const group of stageTargets) {
    for (let c = 0; c < group.count; c++) {
      fdrSeq++;
      const inst = createdInstitutions[fdrSeq % createdInstitutions.length];
      const bankInfo = banks[fdrSeq % banks.length];
      const status = group.status;

      const issueDate = new Date(2023, 0, 1 + (fdrSeq % 100));
      let maturityDate: Date;
      if (status === 'EXPIRING') {
        maturityDate = new Date(2026, 10, 15 + (c % 25)); // Maturing within 15-40 days
      } else if (status === 'LAPSED') {
        maturityDate = new Date(2026, 7, 1 + (c % 30)); // Lapsed 2-3 months ago
      } else if (status === 'RENEWED' || status === 'RELEASED') {
        maturityDate = new Date(2026, 5, 1);
      } else {
        maturityDate = new Date(2027, 5, 1 + (fdrSeq % 200)); // Future maturity
      }

      const fdr = await prisma.fdr.create({
        data: {
          institutionId: inst.id,
          fdrNo: `FDR-AICTE-${fdrSeq}`,
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
      allCreatedFdrs.push(fdr);

      // Trust Provenance
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
            confirmedBy: trustSource === 'BANK_CONFIRMED' ? createdUsers['REGIONAL_OFFICER']?.id : null,
            confirmedAt: trustSource === 'BANK_CONFIRMED' ? new Date() : null,
          },
        });
      }

      // Normal Receipt Attachment
      await prisma.document.create({
        data: {
          fdrId: fdr.id,
          type: 'FDR_RECEIPT',
          storageKey: sampleDocMeta.storageKey,
          sha256: sampleDocMeta.sha256,
          uploadedBy: createdUsers['INSTITUTION']?.id || inst.id,
        },
      });

      // Audit Log Block
      const logTs = new Date();
      const auditPayload = { fdrId: fdr.id, status };
      const hash = computeAuditHash(prevAuditHash, {
        actorId: createdUsers['ADMIN'].id,
        action: `SEED_FDR_${status}`,
        entity: 'Fdr',
        entityId: fdr.id,
        payload: auditPayload,
        ts: logTs,
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
          ts: logTs,
        },
      });
      prevAuditHash = hash;
    }
  }

  console.log(`Base 200 FDRs seeded. Now applying deliberate regulatory edge cases...`);

  // EDGE CASE 1: 3 Duplicate FDR Number pairs across institutions
  for (let k = 1; k <= 3; k++) {
    const fdrA = allCreatedFdrs[(k * 5) % allCreatedFdrs.length];
    const fdrB = allCreatedFdrs[(k * 7 + 20) % allCreatedFdrs.length];
    const duplicateFdrNo = `FDR-DUP-PLEDGE-00${k}`;
    await prisma.fdr.update({
      where: { id: fdrA.id },
      data: { fdrNo: duplicateFdrNo, bank: 'State Bank of India', status: 'DISCREPANCY' },
    });
    await prisma.fdr.update({
      where: { id: fdrB.id },
      data: { fdrNo: duplicateFdrNo, bank: 'State Bank of India', status: 'DISCREPANCY' },
    });
  }

  // EDGE CASE 2: 3 Duplicate Document Hash pairs across distinct institutions
  for (let k = 0; k < 3; k++) {
    const fdrA = allCreatedFdrs[k * 4 + 1];
    const fdrB = allCreatedFdrs[k * 4 + 2];
    const dupMeta = dupDocs[k];

    await prisma.document.create({
      data: {
        fdrId: fdrA.id,
        type: 'FDR_RECEIPT',
        storageKey: dupMeta.storageKey,
        sha256: dupMeta.sha256,
        uploadedBy: createdUsers['INSTITUTION'].id,
      },
    });

    await prisma.document.create({
      data: {
        fdrId: fdrB.id,
        type: 'FDR_RECEIPT',
        storageKey: dupMeta.storageKey,
        sha256: dupMeta.sha256,
        uploadedBy: createdUsers['INSTITUTION'].id,
      },
    });
  }

  // EDGE CASE 3: 6 Bank to IFSC prefix mismatches
  const ifscMismatches = [
    { idx: 15, bank: 'State Bank of India', ifsc: 'HDFC0000555' },
    { idx: 25, bank: 'Punjab National Bank', ifsc: 'ICIC0000111' },
    { idx: 35, bank: 'Bank of Baroda', ifsc: 'SBIN0000691' },
    { idx: 45, bank: 'Canara Bank', ifsc: 'UTIB0000222' },
    { idx: 55, bank: 'HDFC Bank', ifsc: 'PUNB0001234' },
    { idx: 65, bank: 'ICICI Bank', ifsc: 'BARB0000999' },
  ];
  for (const m of ifscMismatches) {
    await prisma.fdr.update({
      where: { id: allCreatedFdrs[m.idx].id },
      data: { bank: m.bank, ifsc: m.ifsc, status: 'DISCREPANCY' },
    });
  }

  // EDGE CASE 4: 4 Invalid Deposit Slabs (below statutory minimum)
  const slabDefects = [70, 75, 80, 85];
  for (const idx of slabDefects) {
    await prisma.fdr.update({
      where: { id: allCreatedFdrs[idx].id },
      data: { amount: 500000, status: 'DISCREPANCY' },
    });
  }

  // EDGE CASE 5: 3 Invalid Dates (Maturity <= Issue Date)
  const invalidDateDefects = [90, 95, 100];
  for (const idx of invalidDateDefects) {
    await prisma.fdr.update({
      where: { id: allCreatedFdrs[idx].id },
      data: {
        issueDate: new Date('2025-06-01'),
        maturityDate: new Date('2024-06-01'),
        status: 'DISCREPANCY',
      },
    });
  }

  // EDGE CASE 6: 4 Short Validity Periods (< 3 years)
  const shortValidityDefects = [105, 110, 115, 120];
  for (const idx of shortValidityDefects) {
    await prisma.fdr.update({
      where: { id: allCreatedFdrs[idx].id },
      data: {
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2024-07-01'), // 6 months
        status: 'DISCREPANCY',
      },
    });
  }

  // EDGE CASE 7: 4 Missing Joint Lien Markings
  const missingLienDefects = [125, 130, 135, 140];
  for (const idx of missingLienDefects) {
    await prisma.fdr.update({
      where: { id: allCreatedFdrs[idx].id },
      data: { lienMarked: false, status: 'DISCREPANCY' },
    });
  }

  console.log('Seed completed successfully. 200 total FDRs created across all regions with all deliberate edge cases.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
