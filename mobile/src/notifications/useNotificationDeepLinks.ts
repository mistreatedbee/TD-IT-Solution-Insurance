/**
 * Handles notification taps — routes deep links into the Expo Router app shell.
 */
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

function routeFromDeepLink(deepLink: string): string | null {
  if (!deepLink.startsWith('tditinsurance://')) {
    return null;
  }
  const path = deepLink.replace('tditinsurance://', '').replace(/^\//, '');
  if (!path || path === '/') {
    return '/(app)';
  }

  if (path.startsWith('security/cases/')) {
    const caseId = path.slice('security/cases/'.length);
    if (caseId) {
      return `/(security-app)/cases/${caseId}`;
    }
    return '/(security-app)';
  }

  if (path === 'security' || path.startsWith('security/')) {
    return '/(security-app)';
  }

  return `/(app)/${path}`;
}

export function useNotificationDeepLinks(): void {
  const router = useRouter();

  useEffect(() => {
    function handleDeepLink(deepLink: unknown): void {
      if (typeof deepLink !== 'string') return;
      const route = routeFromDeepLink(deepLink);
      if (route) {
        router.push(route as never);
      }
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleDeepLink(response.notification.request.content.data?.deepLink);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleDeepLink(response.notification.request.content.data?.deepLink);
      }
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      responseSub.remove();
      linkingSub.remove();
    };
  }, [router]);
}

/** Exported for unit tests. */
export { routeFromDeepLink };
