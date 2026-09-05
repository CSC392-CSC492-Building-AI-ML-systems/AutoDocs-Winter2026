import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { readMlJob } from '@/app/lib/server/ml-jobs';
import { isLocalCpuJobsEnabled } from '@/app/lib/server/processing-mode';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface JobRow { id: string; title: string; duration_seconds: number; terminal_session_id: string | null; }

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isLocalCpuJobsEnabled()) return NextResponse.json({ message: 'Local CPU job processing is disabled.' }, { status: 409 });
  const { jobId } = await params;
  const row = (await db.query<JobRow>(`SELECT id, title, duration_seconds, terminal_session_id FROM terminal_session_jobs WHERE id = $1 AND user_id = $2`, [jobId, user.id])).rows[0];
  if (!row) return NextResponse.json({ message: 'Upload job not found.' }, { status: 404 });
  try {
    const job = await readMlJob(jobId);
    await db.query(`UPDATE terminal_session_jobs SET status = $2, progress_percent = $3, error_message = $4, updated_at = NOW() WHERE id = $1`, [jobId, job.status, job.percent, job.error]);
    if (job.status !== 'completed' || !job.result || row.terminal_session_id) return NextResponse.json({ job, terminalSessionId: row.terminal_session_id });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const locked = (await client.query<JobRow>(`SELECT id, title, duration_seconds, terminal_session_id FROM terminal_session_jobs WHERE id = $1 FOR UPDATE`, [jobId])).rows[0];
      if (!locked.terminal_session_id) {
        const content = job.result.content.map((item) => { const parsed = JSON.parse(item) as { summary: string; depth: number }; return `${parsed.summary}\n${parsed.depth}`; }).join('\n');
        const session = (await client.query<{ id: string }>(`INSERT INTO terminal_sessions (title, duration_seconds, content) VALUES ($1, $2, $3) RETURNING id`, [locked.title, locked.duration_seconds, content])).rows[0];
        await client.query(`INSERT INTO terminal_session_access (user_id, terminal_session_id, owner) VALUES ($1, $2, TRUE)`, [user.id, session.id]);
        await client.query(`UPDATE terminal_session_jobs SET terminal_session_id = $2, updated_at = NOW() WHERE id = $1`, [jobId, session.id]);
        locked.terminal_session_id = session.id;
      }
      await client.query('COMMIT');
      return NextResponse.json({ job, terminalSessionId: locked.terminal_session_id });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : 'Could not read upload job.' }, { status: 502 }); }
}
