import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Role } from '@fdr-vault/shared';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-jwt-access-secret-32-chars-long-min';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-32-chars-long-min';

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
  institutionId?: string | null;
  region?: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
}
