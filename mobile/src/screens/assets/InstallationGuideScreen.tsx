/**
 * Configurable GPS tracker installation guide (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useInstallationGuideQuery } from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { AssetPage } from './AssetPage';

export function InstallationGuideScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guideQuery = useInstallationGuideQuery();

  if (guideQuery.isLoading) {
    return (
      <AssetPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </AssetPage>
    );
  }

  if (guideQuery.isError || !guideQuery.data) {
    return (
      <AssetPage>
        <Alert tone="danger">
          {mapUserFacingError(guideQuery.error, { context: 'asset' })}
        </Alert>
      </AssetPage>
    );
  }

  const guide = guideQuery.data;

  return (
    <AssetPage>
      <Text style={styles.title}>{guide.title}</Text>
      <Text style={styles.summary}>{guide.summary}</Text>

      {guide.steps.map((step, index) => (
        <GlassCard variant="solid" key={step.id} style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepTitle}>{step.title}</Text>
          </View>
          <Text style={styles.stepBody}>{step.body}</Text>
        </GlassCard>
      ))}

      {id ? (
        <Button
          label="Register tracker ID"
          onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
          style={styles.stretch}
        />
      ) : null}
    </AssetPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    summary: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    stepCard: {
      marginBottom: t.spacing.s3,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.s3,
      marginBottom: t.spacing.s2,
    },
    stepBadge: {
      width: 28,
      height: 28,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.link,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBadgeText: {
      color: t.colors.onNavy,
      ...t.type.label,
    },
    stepTitle: {
      flex: 1,
      ...t.type.title,
      color: t.colors.ink,
    },
    stepBody: {
      ...t.type.body,
      color: t.colors.inkMuted,
    },

    stretch: { alignSelf: 'stretch' },
  });
}
