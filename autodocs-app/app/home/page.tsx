"use client"
import { Sidebar } from '@/app/components/Sidebar';
import { UploadTile } from '@/app/components/UploadTile';
import { SessionTile } from '@/app/components/SessionTile';
import { SessionDetailModal } from '@/app/components/SessionDetailModal';
import { getSessionUser } from '@/app/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface SessionEvent {
  label: string;
  depth: number; // -1 = subevent, 0 = independent, >=1 = exiting
}

// Shape returned by /api/terminal-sessions
export interface ApiSession {
  id: string;
  title: string;
  durationSeconds: number;
  content: string;
  createdAt: string;
}

// Shape returned by /api/terminal-sessions/shared
export interface ApiSharedSession extends ApiSession {
  sharedAt: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
}

// Shape used internally / passed to components
export interface Session {
  id: string;
  title: string;
  duration: string;
  content: string;
  createdAt: string;
  // Present only for shared sessions
  owner?: { id: string; name: string; email: string };
  sharedAt?: string | null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function parseSessionContent(raw: string): SessionEvent[] {
  const lines = raw.split('\n');
  const events: SessionEvent[] = [];
  let i = 0;

  while (i < lines.length) {
    const label = lines[i].trim();
    if (!label) { i++; continue; }

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;

    if (j < lines.length) {
      const depthVal = parseInt(lines[j].trim(), 10);
      if (!isNaN(depthVal)) {
        events.push({ label, depth: depthVal });
        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return events;
}

function SessionGridSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
          <div className="w-12 h-12 bg-muted rounded-lg mb-4" />
          <div className="h-4 bg-muted rounded w-3/4 mb-2" />
          <div className="h-3 bg-muted rounded w-1/2 mb-4" />
          <div className="h-20 bg-muted rounded" />
        </div>
      ))}
    </>
  );
}

export default function App() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [sharedSessions, setSharedSessions] = useState<Session[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      const user = await getSessionUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      setCheckingAuth(false);
    };
    void run();
  }, [router]);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const res = await fetch('/api/terminal-sessions');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed with status ${res.status}`);
      }
      const data = await res.json() as { terminalSessions: ApiSession[] };
      setSessions(
        data.terminalSessions.map((s) => ({
          id: s.id,
          title: s.title,
          duration: formatDuration(s.durationSeconds),
          content: s.content,
          createdAt: formatDate(s.createdAt),
        }))
      );
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchSharedSessions = async () => {
    setLoadingShared(true);
    setSharedError(null);
    try {
      const res = await fetch('/api/terminal-sessions/shared');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed with status ${res.status}`);
      }
      const data = await res.json() as { terminalSessions: ApiSharedSession[] };
      setSharedSessions(
        data.terminalSessions.map((s) => ({
          id: s.id,
          title: s.title,
          duration: formatDuration(s.durationSeconds),
          content: s.content,
          createdAt: formatDate(s.createdAt),
          sharedAt: s.sharedAt,
          owner: { id: s.ownerId, name: s.ownerName, email: s.ownerEmail },
        }))
      );
    } catch (err) {
      setSharedError(err instanceof Error ? err.message : 'Failed to load shared sessions.');
    } finally {
      setLoadingShared(false);
    }
  };

  useEffect(() => {
    if (checkingAuth) return;
    void fetchSessions();
    void fetchSharedSessions();
  }, [checkingAuth]);

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSession(null);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const res = await fetch(`/api/terminal-sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `Request failed with status ${res.status}`);
    }

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    handleCloseModal();
  };

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin opacity-40" />
          <span className="text-muted-foreground text-sm font-mono">Checking session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-12">

          {/* ── My Sessions ─────────────────────────────────────── */}
          <section>
            <div className="mb-6">
              <h1 className="text-foreground mb-1">Terminal Sessions</h1>
              <p className="text-muted-foreground">
                Upload and explore hierarchical event logs from your terminal sessions
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <UploadTile onUploadSuccess={fetchSessions} />

              {loadingSessions && <SessionGridSkeleton />}

              {!loadingSessions && sessionsError && (
                <div className="col-span-full text-sm text-destructive font-mono bg-destructive/10 rounded-lg p-4 border border-destructive/20">
                  {sessionsError}
                </div>
              )}

              {!loadingSessions && !sessionsError && sessions.length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground font-mono p-4">
                  No sessions yet. Upload your first terminal session to get started.
                </div>
              )}

              {!loadingSessions && sessions.map((session) => (
                <SessionTile
                  key={session.id}
                  session={session}
                  onClick={() => handleSessionClick(session)}
                />
              ))}
            </div>
          </section>

          {/* ── Shared With Me ──────────────────────────────────── */}
          <section>
            <div className="mb-6">
              <h2 className="text-foreground mb-1">Shared With Me</h2>
              <p className="text-muted-foreground">
                Terminal sessions that others have shared with you
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loadingShared && <SessionGridSkeleton />}

              {!loadingShared && sharedError && (
                <div className="col-span-full text-sm text-destructive font-mono bg-destructive/10 rounded-lg p-4 border border-destructive/20">
                  {sharedError}
                </div>
              )}

              {!loadingShared && !sharedError && sharedSessions.length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground font-mono p-4">
                  Nothing shared with you yet.
                </div>
              )}

              {!loadingShared && sharedSessions.map((session) => (
                <SessionTile
                  key={session.id}
                  session={session}
                  onClick={() => handleSessionClick(session)}
                />
              ))}
            </div>
          </section>

        </div>
      </main>

      <SessionDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        session={selectedSession}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  );
}
