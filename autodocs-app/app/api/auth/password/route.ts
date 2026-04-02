import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getUserFromAccessToken, rotateSession, type SessionUser } from '@/app/lib/server/session-auth';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearSessionCookies,
} from '@/app/lib/server/session';

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

interface UserWithPassword extends SessionUser {
  password_hash: string;
}

async function getAuthenticatedUser(request: NextRequest): Promise<SessionUser | null> {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (accessToken) {
    const user = await getUserFromAccessToken(accessToken);
    if (user) {
      return user;
    }
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return null;
  }

  const rotated = await rotateSession(refreshToken);
  return rotated?.user ?? null;
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      const response = NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }

    const body = (await request.json()) as ChangePasswordBody;
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: 'currentPassword and newPassword are required.' },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { message: 'New password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    const currentUserResult = await db.query<UserWithPassword>(
      `SELECT id, email, name, created_at, password_hash
       FROM users
       WHERE id = $1`,
      [user.id],
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

    const passwordUnchanged = await bcrypt.compare(newPassword, currentUser.password_hash);
    if (passwordUnchanged) {
      return NextResponse.json(
        { message: 'New password must be different from your current password.' },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [passwordHash, currentUser.id],
    );

    return NextResponse.json({ message: 'Password updated successfully.' });
  } catch {
    return NextResponse.json({ message: 'Failed to update password.' }, { status: 500 });
  }
}
