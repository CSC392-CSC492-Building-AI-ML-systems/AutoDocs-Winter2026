import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAccessToken, rotateSession, toClientUser } from '@/app/lib/server/session-auth';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearSessionCookies,
  setSessionCookies,
} from '@/app/lib/server/session';

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
    if (accessToken) {
      const user = await getUserFromAccessToken(accessToken);
      if (user) {
        return NextResponse.json({ user: toClientUser(user) });
      }
    }

    const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const rotated = await rotateSession(refreshToken);
    if (!rotated) {
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const response = NextResponse.json({ user: toClientUser(rotated.user) });
    setSessionCookies(response, rotated.accessToken, rotated.refreshToken);
    return response;
  } catch {
    const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
}
