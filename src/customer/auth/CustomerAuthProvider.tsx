import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { configureCustomerClient } from '../api/client';
import { getAccountMe, logout, verifyMfaChallenge } from '../api/auth';
import { ApiError } from '../api/errors';
import { getOrCreateWebDeviceId } from './deviceId';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { signInWithSupabase } from '../supabase/auth';

const REFRESH_STORAGE_KEY = 'td-customer-web-refresh';

export type CustomerSessionStatus = 'hydrating' | 'signed-out' | 'signed-in' | 'wrong-role';

interface CustomerAuthContextValue {
  status: CustomerSessionStatus;
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
  refreshAccount: () => Promise<import('../api/auth').AccountMe | null>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_STORAGE_KEY, token);
}

function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_STORAGE_KEY);
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CustomerSessionStatus>('hydrating');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [account, setAccount] = useState<import('../api/auth').AccountMe | null>(null);

  const signOut = useCallback(async () => {
    const refresh = readRefreshToken();
    clearRefreshToken();
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
    try {
      const { getSupabase } = await import('../supabase/client');
      await getSupabase().auth.signOut();
    } catch {
      /* best effort */
    }
  }, []);

  useEffect(() => {
    configureCustomerClient({
      getAccessToken: () => accessToken,
      getRefreshToken: () => readRefreshToken(),
      setRefreshToken: writeRefreshToken,
      clearRefreshToken,
      setAccessToken,
      onSessionTerminated: () => {
        void signOut();
      },
    });
  }, [accessToken, signOut]);

  const validateAccount = useCallback(async (token: string) => {
    setAccessToken(token);
    const me = await getAccountMe();
    if (me.userType !== 'customer') {
      setStatus('wrong-role');
      setAccount(me);
      return false;
    }
    setAccount(me);
    setStatus('signed-in');
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refresh = readRefreshToken();
      if (!refresh) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      try {
        const { apiFetch } = await import('../api/client');
        const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>('/session/refresh', {
          method: 'POST',
          body: { refreshToken: refresh, deviceId: getOrCreateWebDeviceId() },
          authenticated: false,
        });
        writeRefreshToken(tokens.refreshToken);
        if (!cancelled) await validateAccount(tokens.accessToken);
      } catch {
        clearRefreshToken();
        if (!cancelled) setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [validateAccount]);

  const signInWithTokens = useCallback(
    async (token: string, refreshToken: string) => {
      writeRefreshToken(refreshToken);
      await validateAccount(token);
    },
    [validateAccount],
  );

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithSupabase(email, password);
      // SR-006-1: /auth/supabase/exchange no longer always returns tokens —
      // an account with a verified TOTP factor gets an MFA challenge here,
      // exactly as POST /auth/login does for the privileged dashboard.
      if (result.kind === 'mfa') {
        return { kind: 'mfa' as const, mfaChallengeToken: result.mfaChallengeToken, expiresIn: result.expiresIn };
      }
      if (result.kind === 'enrollment') {
        return { kind: 'enrollment' as const, enrollmentTicket: result.enrollmentTicket };
      }
      return {
        kind: 'tokens' as const,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(401, {
        error: { message: mapUserFacingError(err, { context: 'auth' }) },
      });
    }
  }, []);

  const completeMfa = useCallback(
    async (mfaChallengeToken: string, code: string) => {
      const tokens = await verifyMfaChallenge(mfaChallengeToken, code);
      await signInWithTokens(tokens.accessToken, tokens.refreshToken);
    },
    [signInWithTokens],
  );

  const refreshAccount = useCallback(async () => {
    if (status !== 'signed-in' || !accessToken) return null;
    try {
      const me = await getAccountMe();
      setAccount(me);
      return me;
    } catch {
      return null;
    }
  }, [status, accessToken]);

  const value = useMemo(
    () => ({
      status,
      accessToken,
      account,
      signInWithTokens,
      signOut,
      loginWithPassword,
      completeMfa,
      refreshAccount,
    }),
    [status, accessToken, account, signInWithTokens, signOut, loginWithPassword, completeMfa, refreshAccount],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
