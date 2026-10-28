import { Request, Response, NextFunction } from 'express';
import { Role } from '@fdr-vault/shared';
import { verifyAccessToken, TokenPayload } from '../services/auth.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: role ${req.user.role} is not permitted for this action`,
      });
    }
    next();
  };
}

/**
 * Helper to produce row-level Prisma where clauses based on authenticated role.
 */
export function getScopedInstitutionFilter(user: TokenPayload): { institutionId?: string } {
  if (user.role === 'INSTITUTION') {
    if (!user.institutionId) {
      throw new Error('Institution user must have an associated institutionId');
    }
    return { institutionId: user.institutionId };
  }
  return {};
}
