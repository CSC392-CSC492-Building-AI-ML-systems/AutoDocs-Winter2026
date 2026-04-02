"use client";

import Image from 'next/image';
import { Home, Settings, User, LogOut } from 'lucide-react';
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
          <Image src="/logo.svg" alt="AutoDocs" width={64} height={64} className="h-16 w-16 shrink-0" />
          <div>
            <h2 className="text-sidebar-foreground">AutoDocs</h2>
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
