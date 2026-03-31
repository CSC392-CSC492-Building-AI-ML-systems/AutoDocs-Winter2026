import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { issueSession, toClientUser } from '@/app/lib/server/session-auth';
import { setSessionCookies } from '@/app/lib/server/session';

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    const result = await db.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      created_at: string;
    }>(
      `SELECT id, email, name, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );

    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const { accessToken, refreshToken } = await issueSession(user);
    const response = NextResponse.json({ user: toClientUser(user) });
    setSessionCookies(response, accessToken, refreshToken);
    return response;
  } catch {
    return NextResponse.json({ message: 'Login failed.' }, { status: 500 });
  }
}
