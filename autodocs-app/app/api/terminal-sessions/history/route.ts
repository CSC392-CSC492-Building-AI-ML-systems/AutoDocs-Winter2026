import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface HistoryRow {
  id: string;
  title: string;
  duration_seconds: number;
  content: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query<HistoryRow>(
      `SELECT ts.id, ts.title, ts.duration_seconds, ts.content, ts.created_at
       FROM terminal_sessions ts
       INNER JOIN terminal_session_access tsa
         ON tsa.terminal_session_id = ts.id
       WHERE tsa.user_id = $1 AND tsa.owner = TRUE
       ORDER BY ts.created_at DESC`,
      [user.id],
    );

    return NextResponse.json({ sessions: result.rows });
  } catch {
    return NextResponse.json({ message: 'Failed to fetch history.' }, { status: 500 });
  }
}
