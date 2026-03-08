import { NextRequest, NextResponse } from 'next/server';
import { rotateSession } from '@/app/lib/server/session-auth';
import {
  REFRESH_COOKIE_NAME,
  clearSessionCookies,
  setSessionCookies,
} from '@/app/lib/server/session';

export async function POST(request: NextRequest) {
  try {
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

    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, rotated.accessToken, rotated.refreshToken);
    return response;
  } catch {
    const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
}
