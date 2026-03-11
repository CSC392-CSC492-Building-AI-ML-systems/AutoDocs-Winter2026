CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users VALUES 
  (
    '686d8854-092f-4961-8eb8-21ea85cf2ea4',
    'hello@example.com',
    'John Doe',
    '$2b$12$ARsDzZrVSn3b8CT30UxOxeFMFw9AGofKTmvstXNS.YzEQsAycQDJa', -- hash for "12345678"
    NOW()
  ),
  (
    'b4a5c6d7-e8f9-a0b1-c2d3-e4f5a6b7c8d9',
    'jane@example.com',
    'Jane Doe',
    '$2b$12$ARsDzZrVSn3b8CT30UxOxeFMFw9AGofKTmvstXNS.YzEQsAycQDJa', -- hash for "12345678"
    NOW()
  )