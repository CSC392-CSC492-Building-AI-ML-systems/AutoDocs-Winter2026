"use client";

import { Home, Upload, Settings, User, LogOut, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logoutSession } from '@/app/lib/auth';

export type SidebarView = 'sessions' | 'profile' | 'settings';

interface SidebarProps {
  activeView?: SidebarView;
}

function getNavItemClasses(isActive: boolean): string {
  return [
    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80'
      : 'text-sidebar-foreground hover:bg-sidebar-accent',
  ].join(' ');
}

export function Sidebar({ activeView = 'sessions' }: SidebarProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await logoutSession();
    router.push('/login');
  };

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sidebar-foreground">TerminalDocs</h2>
            <p className="text-xs text-muted-foreground">Session Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          <button
            onClick={() => router.push('/home')}
            className={getNavItemClasses(activeView === 'sessions')}
          >
            <Home className="w-5 h-5" />
            <span>Sessions</span>
          </button>
          <button
            onClick={() => router.push('/home')}
            className={getNavItemClasses(activeView === 'sessions')}
          >
            <Upload className="w-5 h-5" />
            <span>Upload New</span>
          </button>
        </div>
      </nav>

      {/* Account Section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="space-y-1">
          <button
            onClick={() => router.push('/profile')}
            className={getNavItemClasses(activeView === 'profile')}
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => router.push('/settings')}
            className={getNavItemClasses(activeView === 'settings')}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => void handleSignOut()}
            className={getNavItemClasses(false)}
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
