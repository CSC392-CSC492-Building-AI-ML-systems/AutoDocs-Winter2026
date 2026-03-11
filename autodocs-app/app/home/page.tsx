"use client"
import { Sidebar } from '@/app/components/Sidebar';
import { UploadTile } from '@/app/components/UploadTile';
import { SessionTile } from '@/app/components/SessionTile';
import { SessionDetailModal } from '@/app/components/SessionDetailModal';
import { getSessionUser } from '@/app/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Mock session data
const mockSessions = [
  {
    id: '1',
    title: 'Database Migration Script',
    date: 'January 28, 2026',
    duration: '15m 32s',
    preview: '$ npm run migrate\n> Running migrations...\n✓ Successfully migrated'
  },
  {
    id: '2',
    title: 'API Server Setup',
    date: 'January 27, 2026',
    duration: '8m 45s',
    preview: '$ npm start\n> Server running on port 3000\n> Ready to accept connections'
  },
  {
    id: '3',
    title: 'Docker Container Build',
    date: 'January 26, 2026',
    duration: '22m 18s',
    preview: '$ docker build -t myapp .\n> Building image...\n✓ Successfully built'
  },
  {
    id: '4',
    title: 'Git Repository Setup',
    date: 'January 25, 2026',
    duration: '5m 12s',
    preview: '$ git init\n$ git add .\n$ git commit -m "Initial commit"'
  },
  {
    id: '5',
    title: 'Package Installation',
    date: 'January 24, 2026',
    duration: '12m 03s',
    preview: '$ npm install\n> Installing dependencies...\n✓ All packages installed'
  },
  {
    id: '6',
    title: 'Unit Test Execution',
    date: 'January 23, 2026',
    duration: '3m 47s',
    preview: '$ npm test\n> Running tests...\n✓ 42 tests passed'
  }
];

export default function App() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedSession, setSelectedSession] = useState<typeof mockSessions[0] | null>(null);
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

  const handleSessionClick = (session: typeof mockSessions[0]) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSession(null);
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
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-foreground mb-2">Terminal Sessions</h1>
            <p className="text-muted-foreground">
              Upload and manage your terminal session recordings
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Upload Tile - Always first */}
            <UploadTile />
            
            {/* Session Tiles */}
            {mockSessions.map((session) => (
              <SessionTile
                key={session.id}
                title={session.title}
                date={session.date}
                duration={session.duration}
                preview={session.preview}
                onClick={() => handleSessionClick(session)}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Session Detail Modal */}
      <SessionDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        session={selectedSession}
      />
    </div>
  );
}