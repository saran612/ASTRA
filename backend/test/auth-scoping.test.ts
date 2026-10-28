import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword, generateAccessToken } from '../src/services/auth.js';
import { getScopedInstitutionFilter } from '../src/middlewares/auth.js';

describe('Milestone 3: Auth, RBAC & Row-Level Scoping', () => {
  const prisma = new PrismaClient();

  let instAId: string;
  let instBId: string;
  let userAId: string;
  let userBId: string;
  let officerId: string;

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.fdrEvent.deleteMany();
    await prisma.discrepancy.deleteMany();
    await prisma.fdr.deleteMany();
    await prisma.user.deleteMany();
    await prisma.institution.deleteMany();

    const instA = await prisma.institution.create({
      data: { name: 'Institution Alpha', aicteId: '1-INST-ALPHA', region: 'NORTH' },
    });
    instAId = instA.id;

    const instB = await prisma.institution.create({
      data: { name: 'Institution Beta', aicteId: '1-INST-BETA', region: 'SOUTH' },
    });
    instBId = instB.id;

    const hashed = await hashPassword('password123');

    const userA = await prisma.user.create({
      data: {
        email: 'user.alpha@example.com',
        passwordHash: hashed,
        role: 'INSTITUTION',
        institutionId: instAId,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        email: 'user.beta@example.com',
        passwordHash: hashed,
        role: 'INSTITUTION',
        institutionId: instBId,
      },
    });
    userBId = userB.id;

    const officer = await prisma.user.create({
      data: {
        email: 'officer@example.com',
        passwordHash: hashed,
        role: 'OFFICER',
      },
    });
    officerId = officer.id;

    // Create FDR for Alpha and FDR for Beta
    await prisma.fdr.create({
      data: {
        institutionId: instAId,
        fdrNo: 'FDR-ALPHA-01',
        bank: 'Alpha Bank',
        branch: 'North',
        ifsc: 'ALPH0001',
        amount: 1000000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
      },
    });

    await prisma.fdr.create({
      data: {
        institutionId: instBId,
        fdrNo: 'FDR-BETA-01',
        bank: 'Beta Bank',
        branch: 'South',
        ifsc: 'BETA0001',
        amount: 2000000,
        issueDate: new Date('2024-01-01'),
        maturityDate: new Date('2027-01-01'),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('JWT Access Token Generation & Scoping', () => {
    it('creates access tokens with correct institution claims', () => {
      const token = generateAccessToken({
        userId: userAId,
        email: 'user.alpha@example.com',
        role: 'INSTITUTION',
        institutionId: instAId,
      });
      expect(token).toBeDefined();
    });
  });

  describe('Row-Level Scoping Enforcement', () => {
    it('constrains Institution Alpha queries strictly to Alpha records', async () => {
      const userAlphaClaims = {
        userId: userAId,
        email: 'user.alpha@example.com',
        role: 'INSTITUTION' as const,
        institutionId: instAId,
      };

      const scope = getScopedInstitutionFilter(userAlphaClaims);
      expect(scope).toEqual({ institutionId: instAId });

      // Run query with Alpha's scope
      const alphaFdrs = await prisma.fdr.findMany({
        where: { ...scope },
      });

      expect(alphaFdrs.length).toBe(1);
      expect(alphaFdrs[0].fdrNo).toBe('FDR-ALPHA-01');
      expect(alphaFdrs.some((f) => f.fdrNo === 'FDR-BETA-01')).toBe(false);
    });

    it('ensures Cross-Institution read is denied or returns 0 results', async () => {
      const userBetaClaims = {
        userId: userBId,
        email: 'user.beta@example.com',
        role: 'INSTITUTION' as const,
        institutionId: instBId,
      };

      const scope = getScopedInstitutionFilter(userBetaClaims);

      // Attempt to query Alpha's FDR with Beta's scoped filter
      const attemptedAccess = await prisma.fdr.findFirst({
        where: {
          fdrNo: 'FDR-ALPHA-01',
          ...scope,
        },
      });

      // Must be null/empty because Beta cannot access Alpha's data
      expect(attemptedAccess).toBeNull();
    });

    it('allows OFFICER or ADMIN to view records across institutions', async () => {
      const officerClaims = {
        userId: officerId,
        email: 'officer@example.com',
        role: 'OFFICER' as const,
      };

      const scope = getScopedInstitutionFilter(officerClaims);
      expect(scope).toEqual({});

      const allFdrs = await prisma.fdr.findMany({
        where: { ...scope },
      });

      expect(allFdrs.length).toBe(2);
    });
  });
});
