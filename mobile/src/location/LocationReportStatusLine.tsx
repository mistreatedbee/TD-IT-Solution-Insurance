/**
 * Small, non-blocking status line for this phone's automatic location reports:
 * "Location last sent 3 min ago" or, after a failure, the honest reason plus when the last
 * successful update was. Renders nothing until this app session has tried to report.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useDesignTokens } from '../theme/designTheme';
import { formatRelativeTime } from './formatRelativeTime';
import { useLocationReportStatus } from './reportStatus';

export function LocationReportStatusLine({ testID = 'location-report-status' }: { testID?: string }) {
  const t = useDesignTokens();
  const { lastSentAt, lastFailure } = useLocationReportStatus();
  if (lastSentAt === null && lastFailure === null) return null;

  const sentText =
    lastSentAt !== null ? `Location last sent ${formatRelativeTime(new Date(lastSentAt).toISOString())}.` : null;

  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={{ gap: t.spacing.s1 }}>
      {lastFailure ? (
        <Text style={{ ...t.type.bodySm, color: t.colors.inkMuted }}>
          Last location update failed: {lastFailure.message}
        </Text>
      ) : null}
      <Text style={{ ...t.type.bodySm, color: t.colors.inkMuted }}>
        {sentText ?? 'No location has been sent from this phone yet.'}
      </Text>
    </View>
  );
}
