/**
 * Notification-tap routing for the security-operator shell.
 *
 * INC-003 C-11 / M-1. This hook routes **only** the `deepLink` carried in a
 * push notification's data payload (`backend/src/lib/notification-brand.ts`),
 * and only when the user taps the notification. It does **not** listen for
 * `Linking` `url` events: Expo Router already resolves incoming
 * `tditinsurance://` URLs against the file-based routes, and a second raw
 * listener here used to push `/(app)/<path>?<query>` for any external URL
 * (including auth email links carrying single-use tokens).
 *
 * Routing is deny-by-default:
 * - auth and callback paths (`verify-email`, `reset-password`,
 *   `invitations/accept`, login/OAuth callbacks) are explicitly ignored, so
 *   Expo Router's own handling is the only one that applies;
 * - only the exact path shapes in `SECURITY_SHELL_ROUTES` are accepted;
 * - the query string and fragment are never passed through; route params are
 *   taken from validated path segments only.
 *
 * The hook is mounted only in `app/(security-app)/_layout.tsx`, so the
 * allowlist covers what the backend sends a security-company operator:
 * `security/cases/<caseId>` (partner case alert), `security`, the bare scheme,
 * and `profile` (account/security notices, mapped to the operator profile tab).
 * Customer-shell links (`assets/…`, `policy/…`, `live-tracking/…`) are not
 * valid in this shell and are ignored.
 */
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

const SCHEME = 'tditinsurance://';

/** Mongo ObjectId — matches `caseIdParamsSchema` in backend/src/routes/security-cases.ts. */
const CASE_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Paths this hook must never act on. Expo Router handles them directly
 * (`app/verify-email.tsx`, `app/(auth)/reset-password.tsx`,
 * `app/invitations/accept.tsx`). Matched on the first path segment, so
 * `reset-password/anything` is also ignored.
 */
const AUTH_PATH_ROOTS: ReadonlySet<string> = new Set([
  'verify-email',
  'reset-password',
  'invitations',
  'login',
  'signup',
  'mfa-challenge',
  'forgot-password',
  'auth',
  'callback',
  'oauth',
  'oauthredirect',
  'redirect',
  'expo-auth-session',
]);

type SecurityShellRoute = (segments: readonly string[]) => Href | null;

/** Exact-shape allowlist for the `(security-app)` shell. */
const SECURITY_SHELL_ROUTES: readonly SecurityShellRoute[] = [
  (s) => (s.length === 0 ? '/(security-app)' : null),
  (s) => (s.length === 1 && s[0] === 'security' ? '/(security-app)' : null),
  (s) => (s.length === 1 && s[0] === 'profile' ? '/(security-app)/profile' : null),
  (s) =>
    s.length === 3 && s[0] === 'security' && s[1] === 'cases' && CASE_ID_PATTERN.test(s[2] ?? '')
      ? { pathname: '/(security-app)/cases/[caseId]', params: { caseId: (s[2] ?? '').toLowerCase() } }
      : null,
];

/**
 * Splits `tditinsurance://a/b?x=1#y` into `['a', 'b']`. Returns null when the
 * input is not this app's scheme or the path is malformed. Query and fragment
 * are discarded, never parsed.
 */
function pathSegments(deepLink: string): string[] | null {
  if (deepLink.length > 512) return null;
  if (deepLink.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return null;
  const rest = deepLink.slice(SCHEME.length);
  const end = rest.search(/[?#]/);
  const path = (end === -1 ? rest : rest.slice(0, end)).replace(/^\/+/, '').replace(/\/+$/, '');
  if (path === '') return [];
  const segments = path.split('/');
  // Reject empty segments (`a//b`), traversal and percent-encoding outright:
  // no allowed route needs them.
  if (segments.some((seg) => !/^[A-Za-z0-9_-]+$/.test(seg))) return null;
  return segments;
}

/**
 * Maps a notification `deepLink` to an in-app route, or null to ignore it.
 * Exported for unit tests.
 */
export function routeFromDeepLink(deepLink: unknown): Href | null {
  if (typeof deepLink !== 'string') return null;
  const segments = pathSegments(deepLink);
  if (!segments) return null;
  const root = (segments[0] ?? '').toLowerCase();
  if (AUTH_PATH_ROOTS.has(root)) return null;
  for (const match of SECURITY_SHELL_ROUTES) {
    const route = match(segments);
    if (route) return route;
  }
  return null;
}

/**
 * `getLastNotificationResponseAsync` returns the same response on every
 * mount of the layout; route each tapped notification at most once per process.
 */
const handledResponseIds = new Set<string>();

/** Test-only reset of the per-process de-duplication. */
export function __resetHandledNotificationResponses(): void {
  handledResponseIds.clear();
}

export function useNotificationDeepLinks(): void {
  const router = useRouter();

  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse | null): void {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (id) {
        if (handledResponseIds.has(id)) return;
        handledResponseIds.add(id);
      }
      const route = routeFromDeepLink(response.notification.request.content.data?.deepLink);
      if (route) {
        router.push(route);
      }
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    void Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {
        // No launch response available; nothing to route.
      });

    return () => {
      responseSub.remove();
    };
  }, [router]);
}
