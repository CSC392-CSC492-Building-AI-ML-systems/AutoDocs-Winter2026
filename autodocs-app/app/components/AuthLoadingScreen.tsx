"use client";

interface AuthLoadingScreenProps {
  label?: string;
}

export function AuthLoadingScreen({ label = 'Checking session...' }: AuthLoadingScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin opacity-40" />
        <span className="text-muted-foreground text-sm font-mono">{label}</span>
      </div>
    </div>
  );
}
