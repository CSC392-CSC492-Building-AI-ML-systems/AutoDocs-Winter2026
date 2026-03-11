"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser, setUser } from '@/app/lib/auth';

async function loginRequest(email: string, password: string): Promise<{ user: { id: string; email: string; name: string; createdAt: string } }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json()) as { message?: string; user?: { id: string; email: string; name: string; createdAt: string } };

  if (!res.ok || !data.user) {
    throw new Error(data.message ?? 'Login failed');
  }

  return { user: data.user };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const run = async () => {
      const user = await getSessionUser();
      if (user) {
        router.replace('/home');
        return;
      }
      setTimeout(() => inputRef.current?.focus(), 400);
    };
    void run();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user } = await loginRequest(email, password);
      setUser({ ...user, avatarUrl: undefined });
      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease' }}
    >
      {/* Subtle grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(100,255,150,0.06) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-60%, -50%)',
        }}
      />

      <div
        className="relative w-full max-w-sm mx-4"
        style={{
          animation: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
          animationDelay: '0.1s',
        }}
      >

        {/* Card body */}
        <div
          className="px-8 py-8 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="mb-7">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">Log In</h1>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">Email</span>
                <input
                  ref={inputRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="input-field"
                  style={inputStyle}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  style={inputStyle}
                />
              </label>

              {error && (
                <div
                  className="font-mono text-xs px-3 py-2 rounded-md"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  ✗ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={submitButtonStyle(loading)}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  '→ Sign in'
                )}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground font-mono">
            No account?{' '}
            <Link href="/signup" className="text-foreground underline underline-offset-4 decoration-dotted hover:opacity-70 transition-opacity">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { opacity: 0.3; }
        input:focus { outline: none; border-color: rgba(255,255,255,0.25) !important; }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'inherit',
  fontFamily: 'var(--font-geist-mono, monospace)',
  fontSize: 13,
  transition: 'border-color 0.15s',
};

const submitButtonStyle = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  marginTop: 4,
  padding: '11px 16px',
  background: loading ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  color: loading ? 'rgba(255,255,255,0.4)' : 'inherit',
  fontFamily: 'var(--font-geist-mono, monospace)',
  fontSize: 13,
  cursor: loading ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s, opacity 0.15s',
  letterSpacing: '0.02em',
});
