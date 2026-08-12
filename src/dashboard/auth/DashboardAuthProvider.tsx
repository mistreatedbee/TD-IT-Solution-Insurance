import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { configureDashboardClient } from '../api/client';
import { getAccountMe, login, logout, verifyMfaChallenge } from '../api/auth';
import { ApiError } from '../api/errors';

export type DashboardSessionStatus = 'hydrating' | 'signed-out' | 'signed-in' | 'wrong-role';

export interface DashboardAuthConfig {
  storageKey: string;
  allowedUserType: string;
}

interface DashboardAuthContextValue {
  status: DashboardSessionStatus;
  accessToken: string | null;
  account: import('../api/auth').AccountMe | null;
  signInWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<
    | { kind: 'tokens'; accessToken: string; refreshToken: string }
    | { kind: 'mfa'; mfaChallengeToken: string; expiresIn: number }
    | { kind: 'enrollment'; enrollmentTicket: string }
  >;
  completeMfa: (mfaChallengeToken: string, code: string) => Promise<void>;
}

const DashboardAuthContext = createContext<DashboardAuthContextValue | null>(null);

function readRefreshToken(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRefreshToken(key: string, token: string): void {
  sessionStorage.setItem(key, token);
}

function clearRefreshToken(key: string): void {
  sessionStorage.removeItem(key);
}

export function DashboardAuthProvider({
  config,
  children,
}: {
  config: DashboardAuthConfig;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<DashboardSessionStatus>('hydrating');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [account, setAccount] = useState<import('../api/auth').AccountMe | null>(null);

  const signOut = useCallback(async () => {
    const refresh = readRefreshToken(config.storageKey);
    clearRefreshToken(config.storageKey);
    setAccessToken(null);
    setAccount(null);
    setStatus('signed-out');
    if (refresh) {
      try {
        await logout(refresh);
      } catch {
        /* local session already cleared */
      }
    }
  }, [config.storageKey]);

  useEffect(() => {
    configureDashboardClient({
      getAccessToken: () => accessToken,
      getRefreshToken: () => readRefreshToken(config.storageKey),
      setRefreshToken: (token) => writeRefreshToken(config.storageKey, token),
      clearRefreshToken: () => clearRefreshToken(config.storageKey),
      setAccessToken,
      onSessionTerminated: () => {
        void signOut();
      },
    });
  }, [accessToken, config.storageKey, signOut]);

  const validateAccount = useCallback(
    async (token: string) => {
      setAccessToken(token);
      const me = await getAccountMe();
      if (me.userType !== config.allowedUserType) {
        setStatus('wrong-role');
        setAccount(me);
        return false;
      }
      setAccount(me);
      setStatus('signed-in');
      return true;
    },
    [config.allowedUserType],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refresh = readRefreshToken(config.storageKey);
      if (!refresh) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      try {
        const { apiFetch } = await import('../api/client');
        const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>('/session/refresh', {
          method: 'POST',
          body: { refreshToken: refresh, deviceId: null },
          authenticated: false,
        });
        writeRefreshToken(config.storageKey, tokens.refreshToken);
        if (!cancelled) await validateAccount(tokens.accessToken);
      } catch {
        clearRefreshToken(config.storageKey);
        if (!cancelled) setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.storageKey, validateAccount]);

  const signInWithTokens = useCallback(
    async (token: string, refreshToken: string) => {
      writeRefreshToken(config.storageKey, refreshToken);
      await validateAccount(token);
    },
    [config.storageKey, validateAccount],
  );

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const result = await login(email.trim().toLowerCase(), password);
    if (result.mfaRequired && result.mfaChallengeToken) {
      return { kind: 'mfa' as const, mfaChallengeToken: result.mfaChallengeToken, expiresIn: result.expiresIn ?? 300 };
    }
    if (result.mfaEnrollmentRequired && result.enrollmentTicket) {
      return { kind: 'enrollment' as const, enrollmentTicket: result.enrollmentTicket };
    }
    if (result.accessToken && result.refreshToken) {
      return { kind: 'tokens' as const, accessToken: result.accessToken, refreshToken: result.refreshToken };
    }
    throw new ApiError(500, { error: { message: 'Unexpected login response' } });
  }, []);

  const completeMfa = useCallback(
    async (mfaChallengeToken: string, code: string) => {
      const tokens = await verifyMfaChallenge(mfaChallengeToken, code);
      await signInWithTokens(tokens.accessToken, tokens.refreshToken);
    },
    [signInWithTokens],
  );

  const value = useMemo(
    () => ({
      status,
      accessToken,
      account,
      signInWithTokens,
      signOut,
      loginWithPassword,
      completeMfa,
    }),
    [status, accessToken, account, signInWithTokens, signOut, loginWithPassword, completeMfa],
  );

  return (
    <DashboardAuthContext.Provider value={value}>{children}</DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth(): DashboardAuthContextValue {
  const ctx = useContext(DashboardAuthContext);
  if (!ctx) throw new Error('useDashboardAuth must be used within DashboardAuthProvider');
  return ctx;
}
