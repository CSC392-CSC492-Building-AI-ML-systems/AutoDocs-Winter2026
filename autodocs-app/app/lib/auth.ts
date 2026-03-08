// Client auth utilities for cookie-based sessions.

const USER_KEY = 'auth_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  sessionStorage.removeItem(USER_KEY);
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    clearAuth();
    return null;
  }

  const data = (await res.json()) as { user?: AuthUser };
  if (!data.user) return null;

  setUser(data.user);
  return data.user;
}

export async function logoutSession(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  clearAuth();
}
