/**
 * Phase 2 — live recovery map (placeholder map until GPS pipeline ships).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  useRecoveryCaseQuery,
  useRecoveryLocationQuery,
} from '../../api/hooks/useRecovery';
import { ApiError } from '../../api/errors';
import { MapPlaceholder } from './MapPlaceholder';
import { PoliceReportSection } from './PoliceReportSection';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';

function statusTone(status: string): 'gold' | 'emerald' | 'neutral' {
  if (status === 'recovered' || status === 'closed') return 'emerald';
  if (status === 'tracking' || status === 'investigating') return 'gold';
  return 'neutral';
}

export function LiveTrackingScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const {
    data: recoveryCase,
    isLoading: caseLoading,
    isError: caseError,
  } = useRecoveryCaseQuery(caseId);
  const {
    data: location,
    isLoading: locLoading,
    isError: locError,
    error: locErr,
  } = useRecoveryLocationQuery(caseId);

  const apiMissing =
    locError && locErr instanceof ApiError && locErr.status === 404;

  if (!caseId) {
    return (
      <DesignPage>
        <Alert tone="danger">Missing recovery case.</Alert>
      </DesignPage>
    );
  }

  if (caseLoading) {
    return (
      <DesignPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </DesignPage>
    );
  }

  return (
    <DesignPage>
      <Text style={styles.title}>Live recovery</Text>

      {caseError ? (
        <Alert tone="warning">
          Could not load this recovery case. It may have been closed or removed.
        </Alert>
      ) : recoveryCase ? (
        <GlassCard variant="solid" style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.ref}>{recoveryCase.referenceNumber}</Text>
            <PolicyStatusPill tone={statusTone(recoveryCase.status)}>
              {recoveryCase.status.replace(/_/g, ' ')}
            </PolicyStatusPill>
          </View>
          <Text style={styles.meta}>
            Reported {new Date(recoveryCase.reportedAt).toLocaleString()}
          </Text>
        </GlassCard>
      ) : null}

      {locLoading ? (
        <ActivityIndicator color={t.colors.link} style={styles.locLoading} />
      ) : (
        <MapPlaceholder
          latitude={location?.latitude}
          longitude={location?.longitude}
          recordedAt={location?.recordedAt}
          emptyMessage={
            apiMissing
              ? 'No GPS location data for this case yet. Location appears after the first device ping.'
              : 'Waiting for the first GPS ping from your device…'
          }
        />
      )}

      <Alert tone="info">
        Map refreshes every 30 seconds when tracking is active. Precise
        coordinates are sensitive — do not share this screen with untrusted
        parties.
      </Alert>

      {recoveryCase ? (
        <PoliceReportSection
          caseId={recoveryCase.id}
          policeReport={recoveryCase.policeReport}
        />
      ) : null}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s4,
    },
    card: { marginBottom: t.spacing.s4 },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing.s3,
      marginBottom: t.spacing.s1,
    },
    ref: { ...t.type.label, color: t.colors.ink, flex: 1 },
    meta: { ...t.type.labelSm, color: t.colors.inkMuted },
    locLoading: { marginVertical: t.spacing.s6 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
