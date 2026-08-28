import { apiFetch } from './client';

export async function recordAnalyticsEvents(
  events: Array<{
    eventName: 'session_start' | 'signup_completed' | 'policy_created' | 'asset_registered';
    surface?: 'mobile' | 'web';
    properties?: Record<string, string | number | boolean>;
  }>,
): Promise<void> {
  await apiFetch('/analytics/events', {
    method: 'POST',
    body: { events: events.map((event) => ({ surface: 'mobile', ...event })) },
  });
}
