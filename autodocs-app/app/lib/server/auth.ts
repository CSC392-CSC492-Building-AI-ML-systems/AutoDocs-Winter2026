import jwt from 'jsonwebtoken';

import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from '@/app/lib/server/session';

export interface JwtClaims {
  sub: string;
  email: string;
  name: string;
  sid?: string;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export function signAuthToken(payload: {
  sub: string;
  email: string;
  name: string;
}): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

export function signRefreshToken(payload: { sub: string; sid: string }): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TTL_SECONDS,
  });
}

export function verifyToken(token: string): JwtClaims | null {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as JwtClaims;
  } catch {
    return null;
  }
}
