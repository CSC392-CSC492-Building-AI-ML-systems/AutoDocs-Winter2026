"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser } from '@/app/lib/auth';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
      const run = async () => {
        const user = await getSessionUser();
        router.replace(user ? '/home' : '/login');
      };
      void run();
  }, [router]);

  // Minimal loading state while redirecting
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin opacity-40" />
        <span className="text-muted-foreground text-sm font-mono">Initializing...</span>
      </div>
    </div>
  );
}
