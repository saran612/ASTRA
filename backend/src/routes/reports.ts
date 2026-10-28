import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.js';
import { Clock } from '../services/clock.js';

export function createReportsRouter(prisma: PrismaClient) {
  const router = Router();

  router.use(requireAuth);

  /**
   * RFC 4180 compliant CSV cell escaper
   */
  function escapeCsvCell(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * GET /api/reports/fdrs/export.csv
   * Server-side streaming CSV export with filters
   */
  router.get('/fdrs/export.csv', async (req: AuthenticatedRequest, res: Response) => {
    const { status, region, bank, maturityWindow } = req.query;

    const where: any = {};

    // RBAC scoping
    if (req.user?.role === 'INSTITUTION' && req.user.institutionId) {
      where.institutionId = req.user.institutionId;
    } else if (req.user?.role === 'REGIONAL_OFFICER' && req.user.region) {
      where.institution = { region: req.user.region };
    }

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (bank && typeof bank === 'string') {
      where.bank = bank;
    }

    if (region && typeof region === 'string') {
      where.institution = { ...(where.institution || {}), region };
    }

    if (maturityWindow && typeof maturityWindow === 'string') {
      const windowDays = parseInt(maturityWindow, 10);
      if (!isNaN(windowDays)) {
        const now = Clock.now();
        const futureDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
        where.maturityDate = {
          gte: now,
          lte: futureDate,
        };
      }
    }

    // Set streaming CSV response headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fdrs_export.csv"');

    const headers = [
      'FDR Number',
      'Institution Name',
      'AICTE Region',
      'Issuing Bank',
      'Branch',
      'IFSC',
      'Principal Amount (INR)',
      'Issue Date',
      'Maturity Date',
      'Lien Marked',
      'Status',
      'Discrepancies Count',
      'Created At',
    ];

    res.write(headers.map(escapeCsvCell).join(',') + '\r\n');

    const pageSize = 100;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const fdrs = await prisma.fdr.findMany({
        where,
        include: {
          institution: true,
          discrepancies: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      if (fdrs.length === 0) {
        hasMore = false;
        break;
      }

      for (const f of fdrs) {
        const row = [
          f.fdrNo,
          f.institution?.name || 'N/A',
          f.institution?.region || 'N/A',
          f.bank,
          f.branch,
          f.ifsc,
          f.amount,
          new Date(f.issueDate).toISOString().split('T')[0],
          new Date(f.maturityDate).toISOString().split('T')[0],
          f.lienMarked ? 'YES' : 'NO',
          f.status,
          f.discrepancies.length,
          new Date(f.createdAt).toISOString(),
        ];
        res.write(row.map(escapeCsvCell).join(',') + '\r\n');
      }

      skip += pageSize;
      if (fdrs.length < pageSize) {
        hasMore = false;
      }
    }

    res.end();
  });

  return router;
}
