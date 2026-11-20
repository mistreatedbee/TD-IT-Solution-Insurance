/**
 * Stage 8 PR #44 F-1: called BEFORE the turn-off (withdrawal) request is sent, so neither the
 * 2-minute foreground timer nor the Android background task can send another report while the
 * request is in flight. Never throws. Reporting resumes only when protection is turned on again
 * (`enableLocationTrackingForAsset` calls `resumeLocationReporting`).
 */
import { stopBackgroundLocationUpdates } from './backgroundLocation';
import { suspendLocationReporting } from './useLocationReporter';

export async function stopLocationReportingNow(): Promise<void> {
  suspendLocationReporting();
  await stopBackgroundLocationUpdates().catch(() => undefined);
}
