/**
 * INC-001 A-7 / ADR-0009 SDL-4 + SDL-9 - the server-side consent decision for a location report.
 *
 * Pure functions so the rule is testable without a database. The route reads the newest
 * `location_consent_events` row for (account, asset) and asks `isReportConsented()`.
 */
import type { Request } from 'express';
import type { AppContext } from '../context.js';
import { dispatchProtectionNotice } from './protection-change.js';
import type { LocationEventTrigger } from '../repositories/location-events.js';
import type { LocationConsentEventDocument, LocationConsentScope } from '../repositories/location-consent-log.js';


/**
 * Which consent scope a report trigger needs. Unknown/omitted triggers need `foreground`.
 * `remote_request` ("Locate now") ALWAYS needs `background` (Stage 8 2026-11-25 F-2). The
 * report body may still carry the old client `remoteContext` field (accepted so older apps do
 * not get a 400), but it is never passed here and can never lower the scope: it is a client
 * claim the server cannot verify.
 */
export function scopeForTrigger(trigger: LocationEventTrigger | undefined): LocationConsentScope {
  if (trigger === 'remote_request') return 'background';
  if (trigger === 'background') return 'background';
  if (trigger === 'periodic_foreground') return 'periodic';
  return 'foreground';
}

/**
 * True only when the newest event is a grant, recorded before `now`, from the reporting device,
 * whose scopes include the one this report needs. Anything else - no record, a withdrawal, a
 * grant from another device, a grant without the scope - is refused.
 */
export function isReportConsented(
  latest: LocationConsentEventDocument | null,
  deviceId: string,
  scope: LocationConsentScope,
  now: Date = new Date(),
): boolean {
  if (!latest || latest.eventType !== 'granted') return false;
  if (!latest.deviceId || latest.deviceId !== deviceId) return false;
  if (latest.createdAt.getTime() > now.getTime()) return false;
  return latest.scopes.includes(scope);
}

/**
 * ADR-0009 SDL-9 out-of-band notice on opt-in / opt-out: the security email (sent regardless of
 * email preference, via the Feature 021 protection-notice path, whose failure is audited) plus a
 * push. Fire-and-forget: never throws, never carries coordinates.
 */
export function notifyLocationConsentChange(
  ctx: AppContext,
  req: Request,
  params: { enabled: boolean; assetId: string; assetName: string | null; deviceName: string | null },
): void {
  void dispatchProtectionNotice(ctx, req, {
    action: params.enabled ? 'location_tracking_enabled' : 'location_tracking_disabled',
    deviceName: params.deviceName,
    assetDisplayName: params.assetName,
  }).catch(() => undefined);
  void Promise.resolve()
    .then(() =>
      ctx.pushNotifications.sendToAccount({
        accountId: req.auth!.accountId,
        templateId: params.enabled ? 'location.tracking.enabled' : 'location.tracking.disabled',
        variables: {
          assetId: params.assetId,
          ...(params.assetName ? { assetName: params.assetName } : {}),
          ...(params.deviceName ? { deviceName: params.deviceName } : {}),
        },
      }),
    )
    .catch(() => {
      // eslint-disable-next-line no-console
      console.error('[location-consent] push notice failed');
    });
}
