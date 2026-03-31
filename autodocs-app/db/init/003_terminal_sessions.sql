CREATE TABLE IF NOT EXISTS terminal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terminal_session_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terminal_session_id UUID NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  owner BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  shared_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, terminal_session_id)
);

CREATE INDEX IF NOT EXISTS terminal_session_access_session_idx
  ON terminal_session_access(terminal_session_id);

CREATE INDEX IF NOT EXISTS terminal_session_access_user_owner_idx
  ON terminal_session_access(user_id, owner);

CREATE INDEX IF NOT EXISTS terminal_sessions_created_at_idx
  ON terminal_sessions(created_at DESC);
