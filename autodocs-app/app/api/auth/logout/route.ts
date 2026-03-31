import { NextRequest, NextResponse } from 'next/server';
import { revokeSession } from '@/app/lib/server/session-auth';
import { clearSessionCookies, REFRESH_COOKIE_NAME } from '@/app/lib/server/session';

export async function POST(request: NextRequest) {
	try {
		const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
		if (refreshToken) {
			await revokeSession(refreshToken);
		}
	} catch {
		// Always clear client cookies, even if revocation fails.
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookies(response);
	return response;
}
