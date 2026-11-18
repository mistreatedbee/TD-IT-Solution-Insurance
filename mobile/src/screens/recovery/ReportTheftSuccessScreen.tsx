/**
 * Phase 2 — Step 3: theft report submitted.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { spacing, typography, colors } from '../../theme/tokens';
import { FEATURE_CLAIMS_ENABLED } from '../../config/features';

export function ReportTheftSuccessScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { caseId, reference } = useLocalSearchParams<{
    caseId?: string;
    reference?: string;
  }>();

  return (
    <DesignPage>
      <Alert tone="success">
        Your theft report has been received. Reference:{' '}
        <Text style={styles.ref}>{reference ?? caseId ?? '—'}</Text>
      </Alert>

      <Text style={styles.body}>
        Our security partners have been notified. If GPS tracking is available
        for this asset, you can monitor progress on the live map.
        {FEATURE_CLAIMS_ENABLED
          ? ' You may also file an insurance claim separately.'
          : ''}
      </Text>

      <View style={styles.actions}>
        {caseId ? (
          <Button
            label="View live tracking"
            onPress={() => router.replace(`/live-tracking/${caseId}` as Href)}
            style={styles.stretch}
          />
        ) : null}
        <Button
          label="Back to home"
          onPress={() => router.replace('/(app)/(tabs)' as Href)}
          variant="secondary"
          style={styles.stretch}
        />
        {FEATURE_CLAIMS_ENABLED ? (
          <Button
            label="File a claim"
            onPress={() => router.push('/claims/new' as Href)}
            variant="glass"
            style={styles.stretch}
          />
        ) : null}
      </View>
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    ref: { color: t.colors.ink },
    body: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginVertical: t.spacing.s6,
    },
    actions: { gap: t.spacing.s3 },
    stretch: { alignSelf: 'stretch' },
  });
}
