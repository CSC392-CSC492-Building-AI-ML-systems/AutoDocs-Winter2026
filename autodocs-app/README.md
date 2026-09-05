# AutoDocs App

Next.js frontend and API server for AutoDocs. The app uses Postgres for users, auth sessions, and terminal sessions, and calls the AI service to transform uploaded terminal recordings into the summarized event format the UI displays.

## Environment

Required values in `autodocs-app/.env.local`:

```env
DATABASE_URL="postgresql://autodocs:autodocs@localhost:5432/autodocs"
JWT_SECRET="paste-generated-value-here"
ML_URL="https://your-ml-service-url/"
# Optional: enables the durable local-CPU upload job protocol.
AUTODOCS_PROCESSING_MODE="local-cpu-jobs"
```

- `DATABASE_URL`: Postgres connection string for the app database.
- `JWT_SECRET`: secret used to sign auth/session JWTs.
- `ML_URL`: URL for the AI service called by `POST /api/terminal-sessions`.
- `AUTODOCS_PROCESSING_MODE`: omit this variable for the existing synchronous
  Colab/ngrok-compatible upload path. Set it to `local-cpu-jobs` only when
  `ML_URL` points at this repository's `ml-service`, which implements `/jobs`.

Generate a strong local secret with:

```bash
openssl rand -base64 64
```

## Local Postgres Setup

The project includes a Docker Postgres service and init SQL scripts at `db/init/001_init.sql`, `db/init/002_sessions.sql`, and `db/init/003_terminal_sessions.sql`.

On first startup of a fresh DB volume, Postgres creates:

- `users`
- `sessions`
- `terminal_sessions`
- `terminal_session_access`

It also seeds two users:

- `hello@example.com`
- `jane@example.com`

Both seeded users use password `12345678`.

Start Postgres:

```bash
npm run db:up
```

If you already started Postgres before adding or changing init SQL, reset the volume once:

```bash
npm run db:reset
```

Then verify the schema:

```bash
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d users"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d sessions"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d terminal_sessions"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d terminal_session_access"
```

## Local CPU inference option

The original `ML_URL` behavior remains the default: uploads call the legacy
`POST /` ML endpoint and wait for its response. This is compatible with the
hosted Colab/ngrok pipeline.

To opt into local CPU inference with durable, observable uploads:

1. Install and start [`../ml-service`](../ml-service/README.md) on the same
   host or a private network endpoint. It requires Ollama with a Model 0 GGUF
   registered as `model0` and `gpt-oss:20b` (both names are configurable).
2. Apply `db/init/004_processing_jobs.sql` to an existing Postgres database.
   On a new Docker volume it is applied automatically with the other init
   scripts; do not reset an existing volume merely to apply this migration.
3. Set the web app environment values:

   ```env
   ML_URL="http://127.0.0.1:8500"
   AUTODOCS_PROCESSING_MODE="local-cpu-jobs"
   ```

4. Start the web app normally. New uploads return immediately with a persisted
   job ID, and the UI shows parsing, boundary detection, event grouping,
   annotation, and finalization progress with a timestamped event log.

Only one local CPU job runs at a time so each inference can use the configured
CPU threads without competing uploads starving it. Reloading the page resumes
the active job display. If the ML service restarts while a job is running, that
job is marked failed explicitly rather than reported as still running.

## Running Locally

From the `autodocs-app` folder:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Overview

Authentication is cookie-based. Routes that require auth expect the existing session cookies set by `POST /api/auth/signup` or `POST /api/auth/login`.

### Auth APIs

#### `POST /api/auth/signup`

Creates a user and immediately signs them in.

Request body:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "12345678"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `POST /api/auth/login`

Signs in an existing user and sets auth cookies.

Request body:

```json
{
  "email": "jane@example.com",
  "password": "12345678"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `GET /api/auth/me`

Returns the authenticated user. If the access token is expired but the refresh token is still valid, the session is rotated and fresh cookies are issued.

Success response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `POST /api/auth/logout`

Revokes the refresh session when present and clears auth cookies.

Response:

```json
{
  "ok": true
}
```

#### `PATCH /api/auth/name`

Updates the authenticated user's display name.

Request body:

```json
{
  "name": "Jane Smith"
}
```

Response:

```json
{
  "message": "Name updated successfully.",
  "user": {
    "id": "uuid",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `PATCH /api/auth/email`

Updates the authenticated user's email address. Requires the current password.

Request body:

```json
{
  "email": "new-email@example.com",
  "currentPassword": "12345678"
}
```

Response:

```json
{
  "message": "Email updated successfully.",
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "new-email@example.com",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `PATCH /api/auth/password`

Updates the authenticated user's password.

Request body:

```json
{
  "currentPassword": "12345678",
  "newPassword": "new-password-123"
}
```

Response:

```json
{
  "message": "Password updated successfully."
}
```

### Terminal Session APIs

All terminal session routes require authentication.

#### `GET /api/terminal-sessions`

Returns terminal sessions owned by the authenticated user.

Response:

```json
{
  "terminalSessions": [
    {
      "id": "uuid",
      "title": "Model 1 Example",
      "durationSeconds": 932,
      "content": "...",
      "createdAt": "2026-03-11T12:00:00.000Z"
    }
  ]
}
```

#### `POST /api/terminal-sessions`

Creates a terminal session for the authenticated user.

Request body:

```json
{
  "title": "session-name",
  "durationSeconds": 932,
  "content": "raw .cast file contents"
}
```

How it works:

- The uploaded `content` is sent to `ML_URL` (AI service).
- The AI service is expected to accept `POST` JSON with `title` and `content`.
- The AI service response must include a `content` array whose entries are JSON strings containing summary/depth data.
- The API rewrites that output into the newline-delimited `summary\ndepth` format currently expected by the frontend, then stores it in Postgres.

Response:

```json
{
  "terminalSession": {
    "id": "uuid",
    "title": "session-name",
    "durationSeconds": 932,
    "content": "...transformed AI service output...",
    "createdAt": "2026-03-11T12:00:00.000Z"
  }
}
```

#### `DELETE /api/terminal-sessions/:terminalSessionId`

Deletes an owned terminal session. The authenticated user must be the owner.

Response:

```json
{
  "message": "Terminal session deleted successfully."
}
```

#### `POST /api/terminal-sessions/share`

Shares an owned terminal session with another user by `targetUserEmail` or `targetUserId`.

Request body example:

```json
{
  "terminalSessionId": "uuid",
  "targetUserEmail": "jane@example.com"
}
```

Alternate request body:

```json
{
  "terminalSessionId": "uuid",
  "targetUserId": "uuid"
}
```

Response:

```json
{
  "message": "Session shared successfully.",
  "sharedWith": {
    "id": "uuid",
    "email": "jane@example.com",
    "name": "Jane Doe"
  }
}
```

#### `GET /api/terminal-sessions/shared`

Returns sessions shared with the authenticated user.

Response:

```json
{
  "terminalSessions": [
    {
      "id": "uuid",
      "title": "Model 1 Example",
      "durationSeconds": 932,
      "content": "...",
      "createdAt": "2026-03-11T12:00:00.000Z",
      "sharedAt": "2026-03-12T09:30:00.000Z",
      "ownerId": "uuid",
      "ownerName": "Jane Doe",
      "ownerEmail": "jane@example.com"
    }
  ]
}
```
