This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local Postgres Setup

The project includes a Docker Postgres service and init SQL scripts at `db/init/001_init.sql`, `db/init/002_sessions.sql`, and `db/init/003_terminal_sessions.sql`.
On first startup of a fresh DB volume, Postgres automatically creates the `users`, `sessions`, `terminal_sessions`, and `terminal_session_access` tables, and seeds two users in `users`: `hello@example.com` and `jane@example.com` (both with password `12345678`).

```bash
npm run db:up
```

If you already started Postgres before adding/changing init SQL, reset the volume once:

```bash
npm run db:reset
```

Then verify:

```bash
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d users"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d sessions"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d terminal_sessions"
docker exec -it autodocs-postgres psql -U autodocs -d autodocs -c "\d terminal_session_access"
```

## Terminal Sessions API

All routes below require authentication via the existing cookie-based auth flow (`POST /api/auth/login` first, then send the cookie jar with `-b`).

- `GET /api/terminal-sessions`
Returns the authenticated user's owned terminal sessions.

Example response shape:

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

- `POST /api/terminal-sessions`
Creates a terminal session and grants owner access to the authenticated user.

Request body:

```json
{
	"title": "Model 1 Example - 1721946123",
	"durationSeconds": 932,
	"content": "..."
}
```

Response shape:

```json
{
	"terminalSession": {
		"id": "uuid",
		"title": "Model 1 Example - 1721946123",
		"durationSeconds": 932,
		"content": "...",
		"createdAt": "2026-03-11T12:00:00.000Z"
	}
}
```

- `POST /api/terminal-sessions/share`
Shares an owned terminal session with another user by `targetUserEmail` or `targetUserId`.

Request body example:

```json
{
	"terminalSessionId": "uuid",
	"targetUserEmail": "jane@example.com"
}
```

- `GET /api/terminal-sessions/shared`
Returns sessions shared with the authenticated user (non-owner access rows).

## Auth Model

Authentication uses server-managed sessions with HttpOnly cookies:

- `access_token`: short-lived JWT for request authentication.
- `refresh_token`: longer-lived JWT tied to a row in `sessions`.

Server routes:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Required env vars in `.env.local`:

```env
DATABASE_URL="postgresql://autodocs:autodocs@localhost:5432/autodocs"
JWT_SECRET="paste-generated-value-here"
```

Generate a strong local secret with:

```bash
openssl rand -base64 64
```

Copy that output into `JWT_SECRET` in `.env.local`.

## Getting Started

From the `autodocs-app` folder, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
