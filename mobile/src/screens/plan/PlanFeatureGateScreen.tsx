import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  PLAN_FEATURE_COPY,
  type PlanEntitlementKey,
} from '../../lib/plan-entitlements';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';

export interface PlanFeatureGateScreenProps {
  feature: PlanEntitlementKey;
}

export function PlanFeatureGateScreen({ feature }: PlanFeatureGateScreenProps) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { planName, isLoading, changePlanHref } = usePlanEntitlements();
  const copy = PLAN_FEATURE_COPY[feature];

  if (isLoading) {
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
      <SubpageHeader />
      <Alert tone="info">Upgrade required</Alert>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.description}</Text>
      {planName ? (
        <Text style={styles.planLine}>
          Your current plan: <Text style={styles.planName}>{planName}</Text>
        </Text>
      ) : null}
      <View style={styles.actions}>
        {changePlanHref ? (
          <Button
            label={`Upgrade to ${copy.requiredPlan}`}
            style={styles.stretch}
            onPress={() => router.push(changePlanHref as Href)}
          />
        ) : null}
        <Button
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
          style={styles.stretch}
        />
      </View>
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginTop: t.spacing.s4,
      marginBottom: t.spacing.s2,
    },
    body: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s3,
    },
    planLine: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s6,
    },
    planName: { color: t.colors.ink },
    actions: { gap: t.spacing.s2 },
    stretch: { alignSelf: 'stretch' },
  });
}
