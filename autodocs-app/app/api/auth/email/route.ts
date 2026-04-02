import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { signAuthToken } from '@/app/lib/server/auth';
import { getUserFromAccessToken, rotateSession, toClientUser, type SessionUser } from '@/app/lib/server/session-auth';
import {
  ACCESS_COOKIE_NAME,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  clearSessionCookies,
  cookieOptions,
  setSessionCookies,
} from '@/app/lib/server/session';

interface ChangeEmailBody {
  email?: string;
  currentPassword?: string;
}

interface UserWithPassword extends SessionUser {
  password_hash: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getAuthenticatedUser(request: NextRequest): Promise<{
  user: SessionUser;
  refreshToken: string | null;
} | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value ?? null;

  if (accessToken) {
    const user = await getUserFromAccessToken(accessToken);
    if (user) {
      return { user, refreshToken };
    }
  }

  if (!refreshToken) {
    return null;
  }

  const rotated = await rotateSession(refreshToken);
  if (!rotated) {
    return null;
  }

  return {
    user: rotated.user,
    refreshToken: rotated.refreshToken,
  };
}

export async function PATCH(request: NextRequest) {
  try {
    const authenticated = await getAuthenticatedUser(request);
    if (!authenticated) {
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const body = (await request.json()) as ChangeEmailBody;
    const email = body.email?.trim().toLowerCase();
    const currentPassword = body.currentPassword;

    if (!email || !currentPassword) {
      return NextResponse.json(
        { message: 'Email and currentPassword are required.' },
        { status: 400 },
      );
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ message: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (email === authenticated.user.email) {
      return NextResponse.json(
        { message: 'New email must be different from your current email.' },
        { status: 400 },
      );
    }

    const currentUserResult = await db.query<UserWithPassword>(
      `SELECT id, email, name, created_at, password_hash
       FROM users
       WHERE id = $1`,
      [authenticated.user.id],
    );

    const currentUser = currentUserResult.rows[0];
    if (!currentUser) {
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const passwordOk = await bcrypt.compare(currentPassword, currentUser.password_hash);
    if (!passwordOk) {
      return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 401 });
    }

    const existing = await db.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE email = $1 AND id <> $2`,
      [email, currentUser.id],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 });
    }

    const updatedResult = await db.query<SessionUser>(
      `UPDATE users
       SET email = $1
       WHERE id = $2
       RETURNING id, email, name, created_at`,
      [email, currentUser.id],
    );

    const updatedUser = updatedResult.rows[0];
    const accessToken = signAuthToken({
      sub: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
    });

    const response = NextResponse.json({
      message: 'Email updated successfully.',
      user: toClientUser(updatedUser),
    });

    if (authenticated.refreshToken) {
      setSessionCookies(response, accessToken, authenticated.refreshToken);
    } else {
      response.cookies.set(ACCESS_COOKIE_NAME, accessToken, cookieOptions(ACCESS_TTL_SECONDS));
    }

    return response;
  } catch {
    return NextResponse.json({ message: 'Failed to update email.' }, { status: 500 });
  }
}
