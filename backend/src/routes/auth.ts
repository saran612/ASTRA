import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../services/auth.js';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.js';

export function createAuthRouter(prisma: PrismaClient) {
  const router = Router();

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  router.post('/login', async (req, res: Response) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid login payload', details: parseResult.error.errors });
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { institution: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      region: user.region,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        institutionName: user.institution?.name,
        region: user.region,
      },
    });
  });

  const refreshSchema = z.object({
    refreshToken: z.string().min(1),
  });

  router.post('/refresh', async (req, res: Response) => {
    const parse = refreshSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Missing refreshToken' });
    }

    try {
      const decoded = verifyRefreshToken(parse.data.refreshToken);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        return res.status(401).json({ error: 'User no longer exists' });
      }

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        region: user.region,
      };

      const newAccessToken = generateAccessToken(payload);
      const newRefreshToken = generateRefreshToken(payload);

      return res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { institution: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      institution: user.institution,
      region: user.region,
    });
  });

  return router;
}
