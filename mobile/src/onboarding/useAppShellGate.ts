import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (sessionStatus !== 'signed-in' || !sessionId) {
      return;
    }
    if (resolved?.sessionId === sessionId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const account = await getCurrentAccount();
        const shell = gateForUserType(account.userType);

        if (shell !== 'customer') {
          if (!cancelled) setResolved({ sessionId, gate: shell });
          return;
        }

        const customerGate = await resolveCustomerOnboardingGate();
        if (!cancelled) {
          setResolved({
            sessionId,
            gate: customerGate === 'onboarding' ? 'onboarding' : 'app',
          });
        }
      } catch {
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
    };
  }, [sessionStatus, sessionId, resolved?.sessionId]);

  if (sessionStatus !== 'signed-in') {
    return 'app';
  }
  if (!sessionId || resolved?.sessionId !== sessionId) {
    return 'loading';
  }
  return resolved.gate;
}
