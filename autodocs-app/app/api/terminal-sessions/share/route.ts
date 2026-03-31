import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface ShareBody {
  terminalSessionId?: string;
  targetUserId?: string;
  targetUserEmail?: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ShareBody;
    const terminalSessionId = body.terminalSessionId?.trim();
    const targetUserId = body.targetUserId?.trim();
    const targetUserEmail = body.targetUserEmail?.trim().toLowerCase();

    if (!terminalSessionId) {
      return NextResponse.json({ message: 'terminalSessionId is required.' }, { status: 400 });
    }

    if (!isUuid(terminalSessionId)) {
      return NextResponse.json({ message: 'terminalSessionId must be a valid UUID.' }, { status: 400 });
    }

    if (!targetUserId && !targetUserEmail) {
      return NextResponse.json(
        { message: 'Either targetUserId or targetUserEmail is required.' },
        { status: 400 },
      );
    }

    if (targetUserId && !isUuid(targetUserId)) {
      return NextResponse.json({ message: 'targetUserId must be a valid UUID.' }, { status: 400 });
    }

    const ownerCheck = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM terminal_session_access
         WHERE user_id = $1 AND terminal_session_id = $2 AND owner = TRUE
       ) AS exists`,
      [user.id, terminalSessionId],
    );

    if (!ownerCheck.rows[0]?.exists) {
      return NextResponse.json(
        { message: 'You do not own this terminal session.' },
        { status: 403 },
      );
    }

    const targetUserResult = targetUserId
      ? await db.query<{ id: string; email: string; name: string }>(
          `SELECT id, email, name
           FROM users
           WHERE id = $1`,
          [targetUserId],
        )
      : await db.query<{ id: string; email: string; name: string }>(
          `SELECT id, email, name
           FROM users
           WHERE email = $1`,
          [targetUserEmail],
        );

    const targetUser = targetUserResult.rows[0];
    if (!targetUser) {
      return NextResponse.json({ message: 'Target user not found.' }, { status: 404 });
    }

    if (targetUser.id === user.id) {
      return NextResponse.json({ message: 'Cannot share a session with yourself.' }, { status: 400 });
    }

    await db.query(
      `INSERT INTO terminal_session_access (
         user_id,
         terminal_session_id,
         owner,
         shared_at,
         shared_by_user_id
       )
       VALUES ($1, $2, FALSE, NOW(), $3)
       ON CONFLICT (user_id, terminal_session_id)
       DO UPDATE SET
         owner = terminal_session_access.owner OR EXCLUDED.owner,
         shared_at = CASE
           WHEN terminal_session_access.owner THEN terminal_session_access.shared_at
           ELSE EXCLUDED.shared_at
         END,
         shared_by_user_id = CASE
           WHEN terminal_session_access.owner THEN terminal_session_access.shared_by_user_id
           ELSE EXCLUDED.shared_by_user_id
         END`,
      [targetUser.id, terminalSessionId, user.id],
    );

    return NextResponse.json({
      message: 'Session shared successfully.',
      sharedWith: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      },
    });
  } catch {
    return NextResponse.json({ message: 'Failed to share session.' }, { status: 500 });
  }
}
