import crypto from 'crypto';

export interface MlJobStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed';
  current: number;
  total: number;
  detail: string;
}

export interface MlJobTimelineEvent {
  at: string;
  kind: string;
  message: string;
}

export interface MlJobStatus {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  percent: number;
  createdAt: string;
  updatedAt: string;
  stages: MlJobStage[];
  timeline: MlJobTimelineEvent[];
  error: string | null;
  result: { content: string[] } | null;
}

function mlUrl(): string {
  const url = process.env.ML_URL;
  if (!url) throw new Error('ML_URL is not set');
  return url.replace(/\/$/, '');
}

export async function enqueueMlJob(input: { id: string; title: string; content: string }): Promise<MlJobStatus> {
  const response = await fetch(`${mlUrl()}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: input.id, title: input.title, content: input.content }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`ML job enqueue failed with status ${response.status}`);
  return response.json() as Promise<MlJobStatus>;
}

export async function readMlJob(jobId: string): Promise<MlJobStatus> {
  const response = await fetch(`${mlUrl()}/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ML job status failed with status ${response.status}`);
  return response.json() as Promise<MlJobStatus>;
}

export function createJobId(): string {
  return crypto.randomUUID();
}
