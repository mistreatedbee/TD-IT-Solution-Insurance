/**
 * Claims list — Feature 018 backend (GET /v1/claims).
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PlusIcon } from 'lucide-react-native';
import { useClaimsQuery } from '../../api/hooks/useClaims';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  claimStatusBadgeTone,
  formatClaimStatus,
} from '../../lib/claim-labels';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from '../../theme/tokens';

export function ClaimsListScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { data, isLoading, isError, error } = useClaimsQuery();

  const claims = data?.data ?? [];

  return (
    <DesignPage scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Claims</Text>
        <Text style={styles.subtitle}>
          Track insurance claims linked to your assets.
        </Text>
      </View>

      <View style={styles.padded}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={t.colors.link} />
          </View>
        ) : isError ? (
          <Alert tone="danger">
            {mapUserFacingError(error, { context: 'claim' })}
          </Alert>
        ) : claims.length === 0 ? (
          <>
            <Text style={styles.empty}>
              No claims yet. After reporting a theft, you can file a claim here
              with incident details for adjudication.
            </Text>
            <Button
              label="File a claim"
              onPress={() => router.push('/claims/new' as Href)}
              style={styles.stretch}
            />
          </>
        ) : (
          claims.map((claim) => (
            <Pressable
              key={claim.id}
              onPress={() => router.push(`/claims/${claim.id}` as Href)}
              style={styles.claimRow}
            >
              <GlassCard variant="solid">
                <View style={styles.claimHeader}>
                  <Text style={styles.claimRef}>{claim.assetDisplayName}</Text>
                  <PolicyStatusPill tone={claimStatusBadgeTone(claim.status)}>
                    {formatClaimStatus(claim.status)}
                  </PolicyStatusPill>
                </View>
                <Text style={styles.claimMeta}>
                  Submitted {new Date(claim.submittedAt).toLocaleDateString()} ·{' '}
                  {claim.claimedAmountCurrency}{' '}
                  {claim.claimedAmount.toLocaleString()}
                </Text>
              </GlassCard>
            </Pressable>
          ))
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="File new claim"
        onPress={() => router.push('/claims/new' as Href)}
        style={styles.fab}
      >
        <PlusIcon color={t.colors.onNavy} size={28} />
      </Pressable>
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: t.spacing.s6,
      paddingTop: t.spacing.s6,
      paddingBottom: t.spacing.s3,
    },
    padded: { paddingHorizontal: t.spacing.s6, flex: 1 },
    title: { ...t.type.displayMd, color: t.colors.ink },
    subtitle: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    empty: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s6,
    },
    claimRow: { marginBottom: t.spacing.s3 },
    claimHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing.s3,
    },
    claimRef: { ...t.type.label, color: t.colors.ink, flex: 1 },
    claimMeta: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    fab: {
      position: 'absolute',
      right: t.spacing.s6,
      bottom: t.spacing.s6,
      width: minTouchTarget + t.spacing.s3,
      height: minTouchTarget + t.spacing.s3,
      borderRadius: (minTouchTarget + t.spacing.s3) / 2,
      backgroundColor: t.colors.link,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
    centered: { paddingVertical: t.spacing.s8, alignItems: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
