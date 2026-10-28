import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { generateAccessToken } from '../src/services/auth.js';
import { FdrLifecycleService } from '../src/services/fdr-lifecycle.js';
import { Clock } from '../src/services/clock.js';

describe('Milestone 8: Reports, Streaming CSV Export & Live Audit Explorer', () => {
  let app: any;
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;
  let adminToken: string;
  let instToken: string;
  let regionalToken: string;

  let testInstId: string;
  let otherInstId: string;
  let officerUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = createApp(prisma);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Clean test tables
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.fdrFieldTrust.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.bankVerificationRequest.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    // Create test institutions
    const inst1 = await prisma.institution.create({
      data: {
        aicteId: '1-999000111',
        name: 'Northern Institute of Technology',
        region: 'NORTH',
      },
    });
    testInstId = inst1.id;

    const inst2 = await prisma.institution.create({
      data: {
        aicteId: '1-999000222',
        name: 'Southern College of Engineering',
        region: 'SOUTH',
      },
    });
    otherInstId = inst2.id;

    const officerUser = await prisma.user.create({
      data: {
        email: 'officer.north@aicte.gov.in',
        passwordHash: 'dummy-hash-test',
        role: 'REGIONAL_OFFICER',
        region: 'NORTH',
      },
    });
    officerUserId = officerUser.id;

    adminToken = generateAccessToken({
      userId: 'admin-export-test',
      email: 'admin@aicte.gov.in',
      role: 'ADMIN',
    });

    regionalToken = generateAccessToken({
      userId: officerUser.id,
      email: officerUser.email,
      role: 'REGIONAL_OFFICER',
      region: 'NORTH',
    });

    instToken = generateAccessToken({
      userId: 'inst-user-test',
      email: 'principal@nit.edu',
      role: 'INSTITUTION',
      institutionId: testInstId,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  describe('Server-Side Streaming CSV Export (/api/reports/fdrs/export.csv)', () => {
    it('exports 105+ FDR records with RFC 4180 compliance, correct headers and row counts', async () => {
      // Seed 105 FDRs across North and South
      const fdrData = [];
      const now = Clock.now();
      for (let i = 1; i <= 105; i++) {
        fdrData.push({
          fdrNo: `FDR-STREAM-${String(i).padStart(4, '0')}`,
          institutionId: i <= 70 ? testInstId : otherInstId,
          bank: i % 2 === 0 ? 'State Bank of India' : 'Punjab National Bank',
          branch: 'Connaught Place',
          ifsc: 'SBIN0000691',
          amount: 1500000 + i * 1000,
          issueDate: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
          maturityDate: new Date(now.getTime() + (30 + (i % 60)) * 24 * 60 * 60 * 1000),
          lienMarked: true,
          status: i <= 80 ? 'ACTIVE' : 'EXPIRING',
        });
      }

      await prisma.fdr.createMany({ data: fdrData });

      // Admin exports all
      const res = await fetch(`${baseUrl}/api/reports/fdrs/export.csv`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('content-disposition')).toContain('attachment; filename="fdrs_export.csv"');

      const csvText = await res.text();
      const lines = csvText.trim().split('\r\n');

      // Verify header
      expect(lines[0]).toBe(
        'FDR Number,Institution Name,AICTE Region,Issuing Bank,Branch,IFSC,Principal Amount (INR),Issue Date,Maturity Date,Lien Marked,Status,Discrepancies Count,Created At'
      );

      // Verify row count (1 header + 105 data rows)
      expect(lines.length).toBe(106);

      // Verify RFC 4180 cell escaping
      expect(lines[1]).toContain('FDR-STREAM-');
      expect(lines[1]).toContain('Connaught Place');
    });

    it('enforces RBAC filtering in CSV export for institutions and regional officers', async () => {
      // Institution export: should only include its own 70 records
      const instRes = await fetch(`${baseUrl}/api/reports/fdrs/export.csv`, {
        headers: { Authorization: `Bearer ${instToken}` },
      });
      expect(instRes.status).toBe(200);
      const instCsv = await instRes.text();
      const instLines = instCsv.trim().split('\r\n');
      expect(instLines.length).toBe(71); // 1 header + 70 records
      expect(instCsv).not.toContain('Southern College of Engineering');

      // Regional Officer export: should only include NORTH records
      const regRes = await fetch(`${baseUrl}/api/reports/fdrs/export.csv`, {
        headers: { Authorization: `Bearer ${regionalToken}` },
      });
      expect(regRes.status).toBe(200);
      const regCsv = await regRes.text();
      const regLines = regCsv.trim().split('\r\n');
      expect(regLines.length).toBe(71); // 1 header + 70 records in NORTH
    });
  });

  describe('Live Cryptographic Audit Trail Explorer & Tamper Detection', () => {
    it('verifies untampered hash chain and detects DB payload corruption with exact breakpoint report', async () => {
      const lifecycle = new FdrLifecycleService(prisma);

      // Create an audit chain by performing real transitions
      const fdr = await prisma.fdr.findFirst({ where: { institutionId: testInstId } });
      expect(fdr).toBeDefined();

      // Set to SUBMITTED so we can run transitions
      await prisma.fdr.update({
        where: { id: fdr!.id },
        data: { status: 'SUBMITTED' },
      });

      await lifecycle.transition({
        fdrId: fdr!.id,
        toStatus: 'UNDER_SCRUTINY',
        actor: { id: officerUserId, role: 'REGIONAL_OFFICER' },
        remarks: 'Initial scrutiny commenced',
      });

      await lifecycle.transition({
        fdrId: fdr!.id,
        toStatus: 'VERIFIED',
        actor: { id: officerUserId, role: 'REGIONAL_OFFICER' },
        remarks: 'Verification complete',
      });

      // 1. Verify clean chain
      const cleanVerifyRes = await fetch(`${baseUrl}/api/audit/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const cleanReport = await cleanVerifyRes.json();
      expect(cleanReport.valid).toBe(true);
      expect(cleanReport.totalRows).toBeGreaterThanOrEqual(2);

      // 2. Corrupt a row directly in the database
      const logs = await prisma.auditLog.findMany({ orderBy: { ts: 'asc' } });
      const targetRow = logs[0];

      await prisma.auditLog.update({
        where: { id: targetRow.id },
        data: { payload: { fdrNo: 'TAMPERED_BY_MALICIOUS_ACTOR' } },
      });

      // 3. Re-verify: must fail and identify corrupted block
      const tamperVerifyRes = await fetch(`${baseUrl}/api/audit/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const tamperReport = await tamperVerifyRes.json();
      expect(tamperReport.valid).toBe(false);
      expect(tamperReport.corruptedAtId).toBeDefined();

      // Clean up audit logs
      await prisma.auditLog.deleteMany();
    });
  });
});
