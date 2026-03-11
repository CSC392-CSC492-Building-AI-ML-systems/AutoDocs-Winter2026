import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const ACCESS_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const ACCESS_TTL_SECONDS = 60 * 15;
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string): void {
  response.cookies.set(ACCESS_COOKIE_NAME, accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE_NAME, '', { ...cookieOptions(0), maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE_NAME, '', { ...cookieOptions(0), maxAge: 0 });
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
}
