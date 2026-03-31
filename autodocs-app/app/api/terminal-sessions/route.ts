import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/server/db';
import { getRequestUser } from '@/app/lib/server/request-auth';

interface TerminalSessionBody {
  title?: string;
  durationSeconds?: number;
  content?: string;
}

interface TerminalSessionRow {
  id: string;
  title: string;
  durationSeconds: number;
  content: string;
  createdAt: string;
}

interface MlServiceResponseLine {
  summary: string[]; // each string is a JSON object with summary and depth
  depth: string;
  idx: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query<TerminalSessionRow>(
      `SELECT ts.id,
              ts.title,
              ts.duration_seconds AS "durationSeconds",
              ts.content,
              ts.created_at AS "createdAt"
       FROM terminal_sessions ts
       INNER JOIN terminal_session_access tsa
         ON tsa.terminal_session_id = ts.id
       WHERE tsa.user_id = $1 AND tsa.owner = TRUE
       ORDER BY ts.created_at DESC`,
      [user.id],
    );
    return NextResponse.json({ terminalSessions: result.rows });
  } catch (e){
    console.log(e);
    return NextResponse.json({ message: e}, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let transactionStarted = false;

  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as TerminalSessionBody;
    const title = body.title?.trim();
    const durationSeconds = body.durationSeconds;
    let content = body.content?.trim();

    if (!title) {
      return NextResponse.json({ message: 'title is required.' }, { status: 400 });
    }

    if (typeof durationSeconds !== 'number' || !Number.isInteger(durationSeconds) || durationSeconds < 0) {
      return NextResponse.json(
        { message: 'durationSeconds must be a non-negative integer.' },
        { status: 400 },
      );
    }

    if (!content) {
      return NextResponse.json({ message: 'content is required.' }, { status: 400 });
    }

    // send the content to the ML service to get the summary and events
    const mlResponse = await fetch(`${process.env.ML_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    
    if (!mlResponse.ok) {
      const mlError = await mlResponse.text();
      console.error('ML service error:', mlError);
      return NextResponse.json({ message: 'Failed to process session content.' }, { status: 500 });
    }
    // example response from the ML service
    // const mlData = {
    //   content: [
    //       '{"idx": 0, "depth": 0, "summary": "Navigate to AutoDocs-Winter2026/autodocs-app directory"}',
    //       '{"idx": 1, "depth": -1, "summary": "Begin changing directory"}',
    //       '{"idx": 2, "depth": 0, "summary": "Begin new task"}',
    //       '{"idx": 3, "depth": 0, "summary": "Begin new task"}',
    //       '{"idx": 4, "depth": -1, "summary": "Run script or process update"}',
    //       '{"idx": 5, "depth": 1, "summary": "Exit insert mode and return to normal terminal state"}',
    //       '{"idx": 6, "depth": -1, "summary": "Enter project directory and change prompt settings"}',
    //       '{"idx": 7, "depth": -1, "summary": "Navigate to autodocs-app directory"}',
    //       '{"idx": 8, "depth": -1, "summary": "Enter vi editor mode"}',
    //       '{"idx": 9, "depth": 4, "summary": "Return to shell prompt from nested editing mode"}',
    //       '{"idx": 10, "depth": 0, "summary": "Enter a command"}',
    //       '{"idx": 11, "depth": 0, "summary": "Check status or details of ongoing process"}',
    //       '{"idx": 12, "depth": 0, "summary": "Exit Vim and return to shell prompt"}',
    //       '{"idx": 13, "depth": 0, "summary": "Check available options or documentation"}',
    //       '{"idx": 14, "depth": 0, "summary": "Enter a command"}',
    //       '{"idx": 15, "depth": 0, "summary": "Navigate through command history or menu options"}',
    //       `{"idx": 16, "depth": 0, "summary": "Print 'hello world'"}`,
    //       '{"idx": 17, "depth": 0, "summary": "Navigate to AutoDocs-Winter2026/autodocs-app directory"}',
    //       '{"idx": 18, "depth": 1, "summary": "Exit current shell session"}'
    //     ],
    //     title: 'test'
    // };

    const mlData = await mlResponse.json();
    const rawContent = mlData.content.map((item: string) => JSON.parse(item));
    // build a new string that has the format summary\ndepth\n for each event, which is what the current frontend expects
    content = rawContent.map((item: MlServiceResponseLine) => `${item.summary}\n${item.depth}`).join('\n');
    
    console.log('ML service response content:', content);

    // send into db
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
      [title, durationSeconds, content],
    );

    const terminalSession = sessionInsert.rows[0];

    await db.query(
      `INSERT INTO terminal_session_access (user_id, terminal_session_id, owner)
       VALUES ($1, $2, TRUE)`,
      [user.id, terminalSession.id],
    );

    await db.query('COMMIT');
    transactionStarted = false;

    return NextResponse.json({ terminalSession }, { status: 201 });
  } catch {
    if (transactionStarted) {
      await db.query('ROLLBACK');
    }
    return NextResponse.json({ message: 'Failed to create terminal session.' }, { status: 500 });
  }
}
