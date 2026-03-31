import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { issueSession, toClientUser } from '@/app/lib/server/session-auth';
import { setSessionCookies } from '@/app/lib/server/session';

interface SignupBody {
	name?: string;
	email?: string;
	password?: string;
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as SignupBody;
		const name = body.name?.trim();
		const email = body.email?.trim().toLowerCase();
		const password = body.password;

		if (!name || !email || !password) {
			return NextResponse.json({ message: 'Name, email, and password are required.' }, { status: 400 });
		}

		if (password.length < 8) {
			return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
		}

		const existing = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
		if (existing.rowCount && existing.rowCount > 0) {
			return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 });
		}

		const passwordHash = await bcrypt.hash(password, 12);
		const created = await db.query<{ id: string; email: string; name: string; created_at: string }>(
			`INSERT INTO users (email, name, password_hash)
			 VALUES ($1, $2, $3)
			 RETURNING id, email, name, created_at`,
			[email, name, passwordHash],
		);

		const user = created.rows[0];
		const { accessToken, refreshToken } = await issueSession(user);
		const response = NextResponse.json({ user: toClientUser(user) });
		setSessionCookies(response, accessToken, refreshToken);
		return response;
	} catch {
		return NextResponse.json({ message: 'Signup failed.' }, { status: 500 });
	}
}
