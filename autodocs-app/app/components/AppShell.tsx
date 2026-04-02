"use client";

import type { ReactNode } from 'react';
import { Sidebar, type SidebarView } from '@/app/components/Sidebar';

interface AppShellProps {
  activeView: SidebarView;
  children: ReactNode;
}

export function AppShell({ activeView, children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeView={activeView} />

      <main className="flex-1 overflow-auto">
        <div className="p-8 space-y-12">{children}</div>
      </main>
    </div>
  );
}
