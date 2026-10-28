import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { withRlsContext } from '../src/services/rls.js';
import { generateAccessToken } from '../src/services/auth.js';

describe('Milestone 3: RBAC & PostgreSQL Row-Level Security (RLS) Cross-Region Isolation', () => {
  const prisma = new PrismaClient();
  let server: http.Server;
  let baseUrl: string;

  let northInstId: string;
  let southInstId: string;
  let westInstId: string;
  let eastInstId: string;

  let northFdrId: string;
  let southFdrId: string;
  let westFdrId: string;
  let eastFdrId: string;

  let northDocId: string;
  let southDocId: string;

  let northOfficerToken: string;
  let southOfficerToken: string;
  let bureauToken: string;
  let committeeToken: string;
  let northInstToken: string;
  let southInstToken: string;

  beforeAll(async () => {
    // 1. Clean previous test fixtures
    await prisma.alert.deleteMany();
    await prisma.document.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    // 2. Create 4 institutions across distinct AICTE regions
    const northInst = await prisma.institution.create({
      data: { name: 'Delhi College of Engineering', aicteId: '1-NORTH-01', region: 'NORTH' },
    });
    northInstId = northInst.id;

    const southInst = await prisma.institution.create({
      data: { name: 'Bangalore Institute of Tech', aicteId: '1-SOUTH-01', region: 'SOUTH' },
    });
    southInstId = southInst.id;

    const westInst = await prisma.institution.create({
      data: { name: 'Mumbai Polytechnic College', aicteId: '1-WEST-01', region: 'WEST' },
    });
    westInstId = westInst.id;

    const eastInst = await prisma.institution.create({
      data: { name: 'Kolkata Tech Academy', aicteId: '1-EAST-01', region: 'EAST' },
    });
    eastInstId = eastInst.id;

    // 3. Create users
    const uNorthOfficer = await prisma.user.create({
      data: { email: 'officer.north.rls@aicte.gov.in', passwordHash: 'dummy', role: 'REGIONAL_OFFICER', region: 'NORTH' },
    });
    const uSouthOfficer = await prisma.user.create({
      data: { email: 'officer.south.rls@aicte.gov.in', passwordHash: 'dummy', role: 'REGIONAL_OFFICER', region: 'SOUTH' },
    });
    const uBureau = await prisma.user.create({
      data: { email: 'bureau.head.rls@aicte.gov.in', passwordHash: 'dummy', role: 'BUREAU' },
    });
    const uCommittee = await prisma.user.create({
      data: { email: 'committee.sac.rls@aicte.gov.in', passwordHash: 'dummy', role: 'COMMITTEE' },
    });
    const uNorthInst = await prisma.user.create({
      data: { email: 'principal.north.rls@college.edu', passwordHash: 'dummy', role: 'INSTITUTION', institutionId: northInstId },
    });
    const uSouthInst = await prisma.user.create({
      data: { email: 'principal.south.rls@college.edu', passwordHash: 'dummy', role: 'INSTITUTION', institutionId: southInstId },
    });

    // 4. Create FDRs
    const fNorth = await prisma.fdr.create({
      data: {
        institutionId: northInstId,
        fdrNo: 'FDR-RLS-NORTH-01',
        bank: 'State Bank of India',
        branch: 'Delhi Main',
        ifsc: 'SBIN0001001',
        amount: 3500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'UNDER_SCRUTINY',
      },
    });
    northFdrId = fNorth.id;

    const fSouth = await prisma.fdr.create({
      data: {
        institutionId: southInstId,
        fdrNo: 'FDR-RLS-SOUTH-01',
        bank: 'Canara Bank',
        branch: 'Bangalore MG',
        ifsc: 'CNRB0002002',
        amount: 2500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'UNDER_SCRUTINY',
      },
    });
    southFdrId = fSouth.id;

    const fWest = await prisma.fdr.create({
      data: {
        institutionId: westInstId,
        fdrNo: 'FDR-RLS-WEST-01',
        bank: 'Bank of Baroda',
        branch: 'Mumbai Fort',
        ifsc: 'BARB0003003',
        amount: 2000000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'ACTIVE',
      },
    });
    westFdrId = fWest.id;

    const fEast = await prisma.fdr.create({
      data: {
        institutionId: eastInstId,
        fdrNo: 'FDR-RLS-EAST-01',
        bank: 'Punjab National Bank',
        branch: 'Kolkata Park',
        ifsc: 'PUNB0004004',
        amount: 1500000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
        status: 'ACTIVE',
      },
    });
    eastFdrId = fEast.id;

    // 5. Create Documents
    const dNorth = await prisma.document.create({
      data: {
        fdrId: northFdrId,
        type: 'FDR_RECEIPT',
        storageKey: 'test/north-receipt.pdf',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploadedBy: uNorthInst.id,
      },
    });
    northDocId = dNorth.id;

    const dSouth = await prisma.document.create({
      data: {
        fdrId: southFdrId,
        type: 'FDR_RECEIPT',
        storageKey: 'test/south-receipt.pdf',
        sha256: 'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b899',
        uploadedBy: uSouthInst.id,
      },
    });
    southDocId = dSouth.id;

    // 6. Generate JWTs
    northOfficerToken = generateAccessToken({
      userId: uNorthOfficer.id,
      email: uNorthOfficer.email,
      role: 'REGIONAL_OFFICER',
      region: 'NORTH',
    });
    southOfficerToken = generateAccessToken({
      userId: uSouthOfficer.id,
      email: uSouthOfficer.email,
      role: 'REGIONAL_OFFICER',
      region: 'SOUTH',
    });
    bureauToken = generateAccessToken({
      userId: uBureau.id,
      email: uBureau.email,
      role: 'BUREAU',
    });
    committeeToken = generateAccessToken({
      userId: uCommittee.id,
      email: uCommittee.email,
      role: 'COMMITTEE',
    });
    northInstToken = generateAccessToken({
      userId: uNorthInst.id,
      email: uNorthInst.email,
      role: 'INSTITUTION',
      institutionId: northInstId,
    });
    southInstToken = generateAccessToken({
      userId: uSouthInst.id,
      email: uSouthInst.email,
      role: 'INSTITUTION',
      institutionId: southInstId,
    });

    // 7. Start test HTTP server
    const app = createApp(prisma);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  });

  describe('PostgreSQL Row-Level Security (RLS) Database Engine Enforcement', () => {
    it('restricts Regional Officer to only records in their assigned region', async () => {
      await withRlsContext(
        prisma,
        { id: 'officer-north', role: 'REGIONAL_OFFICER', region: 'NORTH' },
        async (tx) => {
          const fdrs = await tx.fdr.findMany();
          // Must see ONLY the North FDR
          expect(fdrs.length).toBe(1);
          expect(fdrs[0].id).toBe(northFdrId);
          expect(fdrs[0].fdrNo).toBe('FDR-RLS-NORTH-01');

          // Direct attempt to query South FDR must return null
          const southFdr = await tx.fdr.findUnique({ where: { id: southFdrId } });
          expect(southFdr).toBeNull();

          // Direct attempt to query West FDR must return null
          const westFdr = await tx.fdr.findUnique({ where: { id: westFdrId } });
          expect(westFdr).toBeNull();
        }
      );
    });

    it('blocks Regional Officer from viewing documents of another region', async () => {
      await withRlsContext(
        prisma,
        { id: 'officer-north', role: 'REGIONAL_OFFICER', region: 'NORTH' },
        async (tx) => {
          const docs = await tx.document.findMany();
          expect(docs.length).toBe(1);
          expect(docs[0].id).toBe(northDocId);

          const foreignDoc = await tx.document.findUnique({ where: { id: southDocId } });
          expect(foreignDoc).toBeNull();
        }
      );
    });

    it('enforces strict institutional isolation for institution accounts', async () => {
      await withRlsContext(
        prisma,
        { id: 'principal-north', role: 'INSTITUTION', institutionId: northInstId },
        async (tx) => {
          const fdrs = await tx.fdr.findMany();
          expect(fdrs.length).toBe(1);
          expect(fdrs[0].institutionId).toBe(northInstId);

          // College cannot see another college's FDR even in the same or foreign region
          const foreignFdr = await tx.fdr.findUnique({ where: { id: southFdrId } });
          expect(foreignFdr).toBeNull();
        }
      );
    });

    it('grants full nationwide visibility to BUREAU and COMMITTEE roles', async () => {
      await withRlsContext(
        prisma,
        { id: 'bureau-head', role: 'BUREAU' },
        async (tx) => {
          const fdrs = await tx.fdr.findMany();
          // Bureau must see all 4 FDRs across North, South, West, East
          expect(fdrs.length).toBe(4);
        }
      );

      await withRlsContext(
        prisma,
        { id: 'committee-member', role: 'COMMITTEE' },
        async (tx) => {
          const fdrs = await tx.fdr.findMany();
          expect(fdrs.length).toBe(4);
        }
      );
    });
  });

  describe('HTTP API Scoping & 0-Leakage Cross-Region Access Checks', () => {
    it('North Regional Officer GET /api/fdrs returns only North records', async () => {
      const res = await fetch(`${baseUrl}/api/fdrs`, {
        headers: { Authorization: `Bearer ${northOfficerToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(northFdrId);
      expect(data[0].institution.region).toBe('NORTH');
    });

    it('South Regional Officer GET /api/fdrs returns only South records', async () => {
      const res = await fetch(`${baseUrl}/api/fdrs`, {
        headers: { Authorization: `Bearer ${southOfficerToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(southFdrId);
      expect(data[0].institution.region).toBe('SOUTH');
    });

    it('cross-region direct access attempt by North Officer to South FDR returns 404', async () => {
      const res = await fetch(`${baseUrl}/api/fdrs/${southFdrId}`, {
        headers: { Authorization: `Bearer ${northOfficerToken}` },
      });
      // Denied access returns 404 (not found or unauthorized)
      expect(res.status).toBe(404);
      const err = await res.json();
      expect(err.error).toMatch(/unauthorized|not found/i);
    });

    it('cross-institution direct access attempt by North College to South FDR returns 404', async () => {
      const res = await fetch(`${baseUrl}/api/fdrs/${southFdrId}`, {
        headers: { Authorization: `Bearer ${northInstToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('Bureau Head GET /api/fdrs returns all institutions across all regions', async () => {
      const res = await fetch(`${baseUrl}/api/fdrs`, {
        headers: { Authorization: `Bearer ${bureauToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(4);
      const regions = new Set(data.map((f: any) => f.institution.region));
      expect(regions.has('NORTH')).toBe(true);
      expect(regions.has('SOUTH')).toBe(true);
      expect(regions.has('WEST')).toBe(true);
      expect(regions.has('EAST')).toBe(true);
    });
  });
});
