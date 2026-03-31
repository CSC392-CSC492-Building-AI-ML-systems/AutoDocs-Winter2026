import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ terminalSessionId: string }> },
) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { terminalSessionId: rawTerminalSessionId } = await params;
    const terminalSessionId = rawTerminalSessionId?.trim();

    if (!terminalSessionId) {
      return NextResponse.json({ message: 'terminalSessionId is required.' }, { status: 400 });
    }

    if (!isUuid(terminalSessionId)) {
      return NextResponse.json({ message: 'terminalSessionId must be a valid UUID.' }, { status: 400 });
    }

    const accessResult = await db.query<{ owner: boolean }>(
      `SELECT owner
       FROM terminal_session_access
       WHERE user_id = $1 AND terminal_session_id = $2`,
      [user.id, terminalSessionId],
    );

    const accessRow = accessResult.rows[0];

    if (!accessRow) {
      return NextResponse.json({ message: 'Terminal session not found.' }, { status: 404 });
    }

    if (!accessRow.owner) {
      return NextResponse.json(
        { message: 'You do not own this terminal session.' },
        { status: 403 },
      );
    }

    await db.query(
      `DELETE FROM terminal_sessions
       WHERE id = $1`,
      [terminalSessionId],
    );

    return NextResponse.json({ message: 'Terminal session deleted successfully.' });
  } catch {
    return NextResponse.json({ message: 'Failed to delete terminal session.' }, { status: 500 });
  }
}
