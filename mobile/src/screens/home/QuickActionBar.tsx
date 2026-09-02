import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { Button } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function QuickActionBar() {
  const router = useRouter();
  const { hasIncidentManagement, changePlanHref } = usePlanEntitlements();

  function handleReportTheft() {
    if (!hasIncidentManagement && changePlanHref) {
      router.push(changePlanHref as Href);
      return;
    }
    router.push('/(app)/report-theft' as Href);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Quick actions</Text>
      <View style={styles.row}>
        <Button
          variant="secondary"
          onPress={() => router.push('/(app)/assets/register' as Href)}
          style={styles.btn}
        >
          + Add asset
        </Button>
        <Button variant="primary" onPress={handleReportTheft} style={styles.btn}>
          {hasIncidentManagement ? 'Report lost/stolen' : 'Upgrade for theft reporting'}
        </Button>
      </View>
      <View style={styles.row}>
        <Button
          variant="secondary"
          onPress={() => router.push('/(app)/alerts' as Href)}
          style={styles.btn}
        >
          View alerts
        </Button>
        <Button
          variant="secondary"
          onPress={() => router.push('/(app)/policy' as Href)}
          style={styles.btn}
        >
          View policy
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xl,
  },
  heading: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  btn: {
    flex: 1,
  },
});
