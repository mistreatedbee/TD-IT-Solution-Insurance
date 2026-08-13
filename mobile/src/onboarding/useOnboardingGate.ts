import { useEffect, useState } from 'react';
import { listAssets } from '../api/assets';
import { listPolicies } from '../api/policies';
import { useSessionStore } from '../auth/session-store';
import { isOnboardingComplete, markOnboardingComplete } from './onboardingStorage';

export type OnboardingGateState = 'loading' | 'app' | 'onboarding';

export function useOnboardingGate(): OnboardingGateState {
  const sessionStatus = useSessionStore((s) => s.status);
  const [gate, setGate] = useState<OnboardingGateState>('loading');

  useEffect(() => {
    if (sessionStatus !== 'signed-in') {
      setGate('app');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (await isOnboardingComplete()) {
          if (!cancelled) setGate('app');
          return;
        }

        const [policiesRes, assetsRes] = await Promise.all([
          listPolicies({ limit: 1 }),
          listAssets({ limit: 1 }),
        ]);

        const hasPolicy = (policiesRes.data?.length ?? 0) > 0;
        const hasAssets = (assetsRes.data?.length ?? 0) > 0;

        if (hasPolicy && hasAssets) {
          await markOnboardingComplete();
          if (!cancelled) setGate('app');
        } else if (!cancelled) {
          setGate('onboarding');
        }
      } catch {
        if (!cancelled) setGate('onboarding');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  return gate;
}
