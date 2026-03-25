import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { webApiClient, type AuthSession } from '../lib/api-client';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (input: { email: string; password: string; orgId?: string }) => Promise<void>;
  register: (input: { email: string; password: string; name: string; orgName?: string; orgId?: string }) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = 'splinty.web.session';

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.orgId || !parsed?.user?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null): void {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const existing = readStoredSession();
    setSession(existing);
    setLoading(false);
  }, []);

  async function login(input: { email: string; password: string; orgId?: string }) {
    const loginResult = await webApiClient.login(input);
    const me = await webApiClient.me(loginResult.token);

    const next: AuthSession = {
      token: loginResult.token,
      orgId: me.orgId,
      user: {
        id: me.id,
        email: me.email,
        name: me.name,
        role: me.role,
      },
    };

    setSession(next);
    storeSession(next);
  }

  async function register(input: {
    email: string;
    password: string;
    name: string;
    orgName?: string;
    orgId?: string;
  }) {
    const created = await webApiClient.register(input);
    setSession(created);
    storeSession(created);
  }

  function logout() {
    setSession(null);
    storeSession(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      login,
      register,
      logout,
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
