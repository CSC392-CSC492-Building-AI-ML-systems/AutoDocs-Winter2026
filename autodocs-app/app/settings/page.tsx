"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { SettingsPanel } from '@/app/components/SettingsPanel';
import { getSessionUser } from '@/app/lib/auth';

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const user = await getSessionUser();
      if (!user) {
        router.replace('/login');
        return;
      }
    };

    void run();
  }, [router]);

  return (
    <AppShell activeView="settings">
      <SettingsPanel />
    </AppShell>
  );
}
