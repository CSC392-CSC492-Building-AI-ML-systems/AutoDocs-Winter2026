CREATE TABLE IF NOT EXISTS terminal_session_jobs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  error_message TEXT,
  terminal_session_id UUID REFERENCES terminal_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS terminal_session_jobs_user_active_idx
  ON terminal_session_jobs(user_id, status, created_at DESC);
