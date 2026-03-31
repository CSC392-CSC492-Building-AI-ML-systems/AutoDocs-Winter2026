import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface SharedRow {
  id: string;
  title: string;
  durationSeconds: number;
  content: string;
  createdAt: string;
  sharedAt: string | null;
  // shared_by_user_id: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query<SharedRow>(
      `SELECT ts.id,
              ts.title,
              ts.duration_seconds AS "durationSeconds",
              ts.content,
              ts.created_at AS "createdAt",
              viewer_access.shared_at AS "sharedAt",
              owner_user.id AS "ownerId",
              owner_user.name AS "ownerName",
              owner_user.email AS "ownerEmail"
       FROM terminal_sessions ts
       INNER JOIN terminal_session_access viewer_access
         ON viewer_access.terminal_session_id = ts.id
       INNER JOIN terminal_session_access owner_access
         ON owner_access.terminal_session_id = ts.id
        AND owner_access.owner = TRUE
       INNER JOIN users owner_user
         ON owner_user.id = owner_access.user_id
       WHERE viewer_access.user_id = $1
         AND viewer_access.owner = FALSE
       ORDER BY ts.created_at DESC`,
      [user.id],
    );

    return NextResponse.json({ terminalSessions: result.rows });
  } catch {
    return NextResponse.json({ message: 'Failed to fetch shared sessions.' }, { status: 500 });
  }
}
