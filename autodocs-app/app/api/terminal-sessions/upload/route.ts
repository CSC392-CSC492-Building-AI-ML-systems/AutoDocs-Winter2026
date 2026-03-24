import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

export const runtime = 'nodejs';

interface ProcessorResponse {
  title?: string;
  durationSeconds?: number;
  sessionContent?: string;
  annotations?: Array<{ idx: number; summary: string; depth: number }>;
  boundaryTimestamps?: string[];
}

interface TerminalSessionRow {
  id: string;
  title: string;
  durationSeconds: number;
  content: string;
  createdAt: string;
}

function getProcessorUrl(): string | null {
  const value = process.env.PROCESSOR_API_URL?.trim();
  if (!value) return null;
  return value.replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  let transactionStarted = false;

  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const titleField = formData.get('title');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'file is required.' }, { status: 400 });
    }

    const title =
      typeof titleField === 'string' && titleField.trim().length > 0
        ? titleField.trim()
        : file.name.replace(/\.[^/.]+$/, '');

    const processorUrl = getProcessorUrl();
    if (!processorUrl) {
      return NextResponse.json(
        {
          message:
            'PROCESSOR_API_URL is not configured. Start the FastAPI processing service and set this env var in the Next app.',
        },
        { status: 500 },
      );
    }

    const processorForm = new FormData();
    processorForm.set('file', file, file.name);
    processorForm.set('title', title);

    const processorResponse = await fetch(`${processorUrl}/process-terminal-recording`, {
      method: 'POST',
      body: processorForm,
      cache: 'no-store',
    });

    const processorBody = (await processorResponse.json().catch(() => ({}))) as ProcessorResponse & {
      detail?: string;
      message?: string;
    };

    if (!processorResponse.ok) {
      return NextResponse.json(
        {
          message:
            processorBody.detail ??
            processorBody.message ??
            `Processing service failed with status ${processorResponse.status}.`,
        },
        { status: 502 },
      );
    }

    const processedTitle = processorBody.title?.trim() || title;
    const durationSeconds = processorBody.durationSeconds;
    const sessionContent = processorBody.sessionContent?.trim();

    if (
      typeof durationSeconds !== 'number' ||
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 0
    ) {
      return NextResponse.json(
        { message: 'Processing service returned an invalid durationSeconds value.' },
        { status: 502 },
      );
    }

    if (!sessionContent) {
      return NextResponse.json(
        { message: 'Processing service returned empty session content.' },
        { status: 502 },
      );
    }

    await db.query('BEGIN');
    transactionStarted = true;

    const sessionInsert = await db.query<TerminalSessionRow>(
      `INSERT INTO terminal_sessions (title, duration_seconds, content)
       VALUES ($1, $2, $3)
       RETURNING id,
                 title,
                 duration_seconds AS "durationSeconds",
                 content,
                 created_at AS "createdAt"`,
      [processedTitle, durationSeconds, sessionContent],
    );

    const terminalSession = sessionInsert.rows[0];

    await db.query(
      `INSERT INTO terminal_session_access (user_id, terminal_session_id, owner)
       VALUES ($1, $2, TRUE)`,
      [user.id, terminalSession.id],
    );

    await db.query('COMMIT');
    transactionStarted = false;

    return NextResponse.json(
      {
        terminalSession,
        processing: {
          annotationsCount: processorBody.annotations?.length ?? 0,
          boundaryCount: processorBody.boundaryTimestamps?.length ?? 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (transactionStarted) {
      await db.query('ROLLBACK');
    }

    console.error(error);
    return NextResponse.json(
      { message: 'Failed to upload and process terminal session.' },
      { status: 500 },
    );
  }
}
