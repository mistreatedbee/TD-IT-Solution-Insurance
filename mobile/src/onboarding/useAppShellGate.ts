import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { getCurrentAccount } from '../api/auth';
import type { components } from '../api/generated/identity-service';
import { useSessionStore } from '../auth/session-store';
import { resolveCustomerOnboardingGate } from './useOnboardingGate';
import { isOnboardingComplete } from './onboardingStorage';

type UserType = components['schemas']['UserType'];

export type AppShellGateState =
  | 'loading'
  | 'onboarding'
  | 'app'
  | 'security-app'
  | 'web-portal';

type ResolvedShell = { sessionId: string; gate: AppShellGateState };

const SHELL_CACHE_KEY = 'td-app-shell-cache';
const CACHEABLE: AppShellGateState[] = ['onboarding', 'app', 'security-app', 'web-portal'];

/**
 * Last verified shell for a session. It only picks which screens to show first; every API call is still
 * authorised by the server, and the background check below corrects it if the role changed.
 */
async function readCachedShell(sessionId: string): Promise<AppShellGateState | null> {
  try {
    const raw = await AsyncStorage.getItem(SHELL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResolvedShell>;
    if (parsed.sessionId === sessionId && CACHEABLE.includes(parsed.gate as AppShellGateState)) {
      return parsed.gate as AppShellGateState;
    }
  } catch {
    // ignore: fall back to the blocking check
  }
  return null;
}

function writeCachedShell(value: ResolvedShell): void {
  AsyncStorage.setItem(SHELL_CACHE_KEY, JSON.stringify(value)).catch(() => {});
}

function gateForUserType(userType: UserType | undefined): AppShellGateState | 'customer' {
  switch (userType) {
    case 'security_company_operator':
      return 'security-app';
    case 'admin':
    case 'support_agent':
      return 'web-portal';
    default:
      return 'customer';
  }
}

/**
 * Determines which authenticated app shell to show after sign-in.
 * Privileged roles (security operator, admin, support) never hit customer onboarding.
 */
export function useAppShellGate(): AppShellGateState {
  const sessionStatus = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [resolved, setResolved] = useState<ResolvedShell | null>(null);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== 'signed-in' || !sessionId) {
      return;
    }
    if (startedFor.current === sessionId) {
      return;
    }
    startedFor.current = sessionId;

    let cancelled = false;
    const commit = (gate: AppShellGateState) => {
      if (cancelled) return;
      setResolved((prev) =>
        prev?.sessionId === sessionId && prev.gate === gate ? prev : { sessionId, gate },
      );
      writeCachedShell({ sessionId, gate });
    };

    void (async () => {
      // Show the cached shell at once (skips waiting on a cold server), then verify below.
      const cached = await readCachedShell(sessionId);
      if (cached && !cancelled) setResolved({ sessionId, gate: cached });
      try {
        const [account, customerGate] = await Promise.all([
          getCurrentAccount(),
          resolveCustomerOnboardingGate(),
        ]);
        const shell = gateForUserType(account.userType);

        if (shell !== 'customer') {
          commit(shell);
          return;
        }

        commit(customerGate === 'onboarding' ? 'onboarding' : 'app');
      } catch {
        if (cached) return; // keep the cached shell when the server cannot be reached
        try {
          const customerGate = await resolveCustomerOnboardingGate();
          if (!cancelled) {
            setResolved({
              sessionId,
              gate: customerGate === 'onboarding' ? 'onboarding' : 'app',
            });
          }
        } catch {
          const complete = await isOnboardingComplete().catch(() => false);
          if (!cancelled) {
            setResolved({
              sessionId,
              gate: complete ? 'app' : 'onboarding',
            });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      startedFor.current = null; // lets a remount (or StrictMode re-run) start the check again
    };
  }, [sessionStatus, sessionId]);

  if (sessionStatus !== 'signed-in') {
    return 'app';
  }
  if (!sessionId || resolved?.sessionId !== sessionId) {
    return 'loading';
  }
  return resolved.gate;
}
