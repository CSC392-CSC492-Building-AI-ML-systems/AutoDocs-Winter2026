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

export interface Session {
  id: string;
  title: string;
  duration: string;
  createdAt: string;
  content: SessionEvent[];
}

// Mock session data
const mockSessions: Session[] = [
  {
    id: '1',
    title: 'FAI CD Build & HWPHYS RAID Config',
    duration: '42m 17s',
    createdAt: 'January 28, 2026',
    content: [
      { label: 'Connect from stephost to remote server over SSH.', depth: 0 },
      { label: 'Change to /home/fai and list its contents.', depth: 0 },
      { label: 'Change into the config directory and list its subdirectories.', depth: 0 },
      { label: 'Change into the disk_config directory and list its files.', depth: 0 },
      { label: 'Open HWPHYS disk configuration file in Emacs for inspection.', depth: -1 },
      { label: 'Reopen HWPHYS disk configuration file in Emacs using sudo for elevated access.', depth: -1 },
      { label: 'Review and edit HWPHYS disk configuration file in Emacs.', depth: 0 },
      { label: "Navigate within Emacs HWPHYS disk configuration, editing fields around ':missing' raid entries.", depth: 0 },
      { label: "Run 'sudo git diff' in disk_config directory to review recent HWPHYS RAID configuration changes.", depth: 0 },
      { label: "Compose a 'sudo git commit -am' command using shell history and navigation keys, preparing to commit HWPHYS changes.", depth: 0 },
      { label: 'Open the HWPHYS disk configuration file in Emacs, navigate through it, mark the buffer as modified, then write and save a detailed problem description about systems with two disks before returning to the shell.', depth: -1 },
      { label: 'Run a git commit with a detailed message explaining that the hardened disk configuration now requires 25 disks in the wrong order before causing trouble.', depth: 0 },
      { label: 'Change directory two levels up in the filesystem.', depth: 0 },
      { label: 'Search shell history for the previous timed make-fai-cd build command.', depth: 0 },
      { label: 'Run sudo creation command that debootstraps and configures a Debian base system with required core packages.', depth: 0 },
      { label: 'Create and configure a Debian base system with debootstrap.', depth: 0 },
      { label: 'Install and configure FAI NFSROOT, downloading and setting up many Debian packages inside /srv/fai/nfsroot.', depth: 0 },
      { label: 'Build a bootable FAI CD ISO image by copying configuration and mirror data, creating a SquashFS filesystem, formatting with FAT, and writing fai_cd.iso.', depth: 0 },
      { label: 'Log out from the remote shell session and close the SSH connection.', depth: 1 },
      { label: 'Copy fai_cd.iso from remote host 172.16.0.17 to a local ISO file using scp, watching transfer complete.', depth: 0 },
      { label: 'Exit the interactive shell session on stephost.', depth: 1 },
    ]
  }
];

export default function App() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
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

  const handleSessionClick = (session: Session) => {
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
              Upload and explore hierarchical event logs from your terminal sessions
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
                session={session}
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