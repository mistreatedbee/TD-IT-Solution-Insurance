/**
 * Configurable GPS tracker installation guide (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useInstallationGuideQuery } from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Button, Card, Screen } from '../../theme/primitives';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function InstallationGuideScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guideQuery = useInstallationGuideQuery();

  if (guideQuery.isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (guideQuery.isError || !guideQuery.data) {
    return (
      <Screen>
        <Alert tone="danger">{mapUserFacingError(guideQuery.error, { context: 'asset' })}</Alert>
      </Screen>
    );
  }

  const guide = guideQuery.data;

  return (
    <Screen>
      <Text style={styles.title}>{guide.title}</Text>
      <Text style={styles.summary}>{guide.summary}</Text>

      {guide.steps.map((step, index) => (
        <Card key={step.id} style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepTitle}>{step.title}</Text>
          </View>
          <Text style={styles.stepBody}>{step.body}</Text>
        </Card>
      ))}

      {id ? (
        <Button fullWidth onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}>
          Register tracker ID
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  summary: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  stepCard: {
    marginBottom: spacing.md,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.sizes.sm,
  },
  stepTitle: {
    flex: 1,
    fontSize: typography.sizes.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepBody: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
