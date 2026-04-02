"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/AppShell';
import { ProfilePanel } from '@/app/components/ProfilePanel';
import { getSessionUser, setUser as persistUser, type AuthUser } from '@/app/lib/auth';

function ProfileSkeleton() {
  return (
    <section className="max-w-4xl space-y-5">
      <div className="mb-6">
        <div className="h-8 w-32 rounded bg-muted" />
      </div>

      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="h-20 w-20 rounded-full bg-muted" />
          <div className="space-y-3">
            <div className="h-6 w-48 rounded bg-muted" />
            <div className="h-4 w-56 rounded bg-muted" />
            <div className="h-4 w-40 rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="mb-5 h-4 w-40 rounded bg-muted" />
        <div className="space-y-4">
          <div className="h-16 rounded bg-muted" />
          <div className="h-16 rounded bg-muted" />
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const run = async () => {
      const user = await getSessionUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      setCurrentUser(user);
    };

    void run();
  }, [router]);

  const handleUserChange = (user: AuthUser) => {
    setCurrentUser(user);
    persistUser(user);
  };

  return (
    <AppShell activeView="profile">
      {currentUser ? (
        <ProfilePanel user={currentUser} onUserChange={handleUserChange} />
      ) : (
        <ProfileSkeleton />
      )}
    </AppShell>
  );
}
