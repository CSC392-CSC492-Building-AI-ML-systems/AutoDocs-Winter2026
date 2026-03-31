import { NextRequest } from 'next/server';
import { getUserFromAccessToken, type SessionUser } from '@/app/lib/server/session-auth';
import { ACCESS_COOKIE_NAME } from '@/app/lib/server/session';

export async function getRequestUser(request: NextRequest): Promise<SessionUser | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) return null;
  return getUserFromAccessToken(accessToken);
}
