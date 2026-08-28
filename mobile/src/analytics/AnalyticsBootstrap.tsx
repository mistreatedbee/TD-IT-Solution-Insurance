import { useSessionAnalytics } from '../analytics/useSessionAnalytics';

/** Mounts M4 session_start tracking without coupling analytics to layout logic. */
export function AnalyticsBootstrap() {
  useSessionAnalytics();
  return null;
}
