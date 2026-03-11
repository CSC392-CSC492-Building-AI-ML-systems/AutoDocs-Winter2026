import crypto from 'crypto';
import { db } from '@/app/lib/server/db';
import { signAuthToken, signRefreshToken, verifyToken } from '@/app/lib/server/auth';
import { hashToken, refreshExpiryDate } from '@/app/lib/server/session';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export function toClientUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
  };
}

export async function issueSession(user: SessionUser) {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, sid: sessionId });
  const refreshTokenHash = hashToken(refreshToken);

  await db.query(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, user.id, refreshTokenHash, refreshExpiryDate().toISOString()],
  );

  const accessToken = signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  return { accessToken, refreshToken };
}

export async function rotateSession(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
} | null> {
  const claims = verifyToken(refreshToken);
  if (!claims?.sub || !claims.sid) return null;

  const refreshTokenHash = hashToken(refreshToken);

  const sessionResult = await db.query<{
    id: string;
    user_id: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `SELECT id, user_id, expires_at, revoked_at
     FROM sessions
     WHERE id = $1 AND refresh_token_hash = $2`,
    [claims.sid, refreshTokenHash],
  );

  const session = sessionResult.rows[0];
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const userResult = await db.query<SessionUser>(
    `SELECT id, email, name, created_at
     FROM users
     WHERE id = $1`,
    [session.user_id],
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const newRefreshToken = signRefreshToken({ sub: user.id, sid: session.id });
  await db.query(
    `UPDATE sessions
     SET refresh_token_hash = $1, expires_at = $2
     WHERE id = $3`,
    [hashToken(newRefreshToken), refreshExpiryDate().toISOString(), session.id],
  );

  const accessToken = signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user,
  };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const claims = verifyToken(refreshToken);
  if (!claims?.sid) return;

  await db.query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL`,
    [claims.sid],
  );
}

export async function getUserFromAccessToken(accessToken: string): Promise<SessionUser | null> {
  const claims = verifyToken(accessToken);
  if (!claims?.sub) return null;

  const result = await db.query<SessionUser>(
    `SELECT id, email, name, created_at
     FROM users
     WHERE id = $1`,
    [claims.sub],
  );

  return result.rows[0] ?? null;
}
