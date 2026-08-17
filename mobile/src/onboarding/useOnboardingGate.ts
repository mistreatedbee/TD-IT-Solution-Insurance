import { useEffect, useState } from 'react';
import { listAssets } from '../api/assets';
import { listPolicies } from '../api/policies';
import { useSessionStore } from '../auth/session-store';
import { isOnboardingComplete, markOnboardingComplete } from './onboardingStorage';

export type OnboardingGateState = 'loading' | 'app' | 'onboarding';

type ResolvedGate = { sessionId: string; gate: 'app' | 'onboarding' };

/** Shared customer onboarding resolution — used by useAppShellGate for customer accounts. */
export async function resolveCustomerOnboardingGate(): Promise<'app' | 'onboarding'> {
  if (await isOnboardingComplete()) {
    return 'app';
  }

  const [policiesRes, assetsRes] = await Promise.all([
    listPolicies({ limit: 1 }),
    listAssets({ limit: 1 }),
  ]);

  const hasPolicy = (policiesRes.data?.length ?? 0) > 0;
  const hasAssets = (assetsRes.data?.length ?? 0) > 0;

  if (hasPolicy && hasAssets) {
    await markOnboardingComplete();
    return 'app';
  }

  return 'onboarding';
}

export function useOnboardingGate(): OnboardingGateState {
  const sessionStatus = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [resolved, setResolved] = useState<ResolvedGate | null>(null);

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
        const gate = await resolveCustomerOnboardingGate();
        if (!cancelled) setResolved({ sessionId, gate });
      } catch {
        if (!cancelled) setResolved({ sessionId, gate: 'onboarding' });
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
