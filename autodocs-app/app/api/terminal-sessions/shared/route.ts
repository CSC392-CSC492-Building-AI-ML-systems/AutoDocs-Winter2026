import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface SharedRow {
  id: string;
  title: string;
  duration_seconds: number;
  content: string;
  created_at: string;
  shared_at: string | null;
  shared_by_user_id: string | null;
  owner_id: string;
  owner_name: string;
  owner_email: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query<SharedRow>(
            `SELECT ts.id, ts.title, ts.duration_seconds, ts.content, ts.created_at,
              viewer_access.shared_at,
              viewer_access.shared_by_user_id,
              owner_user.id AS owner_id,
              owner_user.name AS owner_name,
              owner_user.email AS owner_email
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

    return NextResponse.json({ sessions: result.rows });
  } catch {
    return NextResponse.json({ message: 'Failed to fetch shared sessions.' }, { status: 500 });
  }
}
