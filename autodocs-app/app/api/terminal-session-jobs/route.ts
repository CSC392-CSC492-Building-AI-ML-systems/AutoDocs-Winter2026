import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { createJobId, enqueueMlJob, readMlJob } from '@/app/lib/server/ml-jobs';
import { isLocalCpuJobsEnabled } from '@/app/lib/server/processing-mode';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface JobBody { title?: string; durationSeconds?: number; content?: string; }

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isLocalCpuJobsEnabled()) return NextResponse.json({ message: 'Local CPU job processing is disabled. Use the legacy terminal-session endpoint.' }, { status: 409 });
  try {
    const body = (await request.json()) as JobBody;
    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title || !content) return NextResponse.json({ message: 'title and content are required.' }, { status: 400 });
    if (!Number.isInteger(body.durationSeconds) || (body.durationSeconds ?? -1) < 0) return NextResponse.json({ message: 'durationSeconds must be a non-negative integer.' }, { status: 400 });
    const jobId = createJobId();
    await db.query(`INSERT INTO terminal_session_jobs (id, user_id, title, duration_seconds, status) VALUES ($1, $2, $3, $4, 'queued')`, [jobId, user.id, title, body.durationSeconds]);
    try {
      const job = await enqueueMlJob({ id: jobId, title, content });
      return NextResponse.json({ job }, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start analysis.';
      await db.query(`UPDATE terminal_session_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`, [jobId, message]);
      return NextResponse.json({ message }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Could not create upload job.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isLocalCpuJobsEnabled()) return NextResponse.json({ enabled: false, job: null });
  const result = await db.query<{ id: string }>(`SELECT id FROM terminal_session_jobs WHERE user_id = $1 AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1`, [user.id]);
  if (!result.rows[0]) return NextResponse.json({ enabled: true, job: null });
  try { return NextResponse.json({ enabled: true, job: await readMlJob(result.rows[0].id) }); }
  catch { return NextResponse.json({ enabled: true, job: null }); }
}
