import { useRouter, type Href } from 'expo-router';
import { BellIcon, FileTextIcon, PackagePlusIcon, ShieldAlertIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { useHomeStyles } from './homeStyles';

/**
 * Quick actions — R5.2 restyle. Report theft is the single primary action;
 * the rest are glass buttons. Lucide icons replace the old PNG glyphs.
 */
export function QuickActionBar() {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        stack: { gap: t.spacing.s3 },
        row: { flexDirection: 'row', gap: t.spacing.s2 },
        btn: { flex: 1 },
      }),
    [t],
  );
  const { hasIncidentManagement, changePlanHref } = usePlanEntitlements();

  function handleReportTheft() {
    if (!hasIncidentManagement && changePlanHref) {
      router.push(changePlanHref as Href);
      return;
    }
    router.push('/(app)/report-theft' as Href);
  }

  return (
    <View style={styles.stack}>
      <GlassCard>
        <Text style={home.sectionTitle} accessibilityRole="header">
          Quick actions
        </Text>
      </GlassCard>
      <Button
        variant="primary"
        label={hasIncidentManagement ? 'Report lost/stolen' : 'Upgrade for theft reporting'}
        icon={<ShieldAlertIcon size={20} color={t.colors.onActionPrimary} strokeWidth={1.75} />}
        onPress={handleReportTheft}
      />
      <Button
        variant="glass"
        label="Add asset"
        icon={<PackagePlusIcon size={20} color={t.colors.ink} strokeWidth={1.75} />}
        onPress={() => router.push('/assets/register' as Href)}
      />
      <View style={styles.row}>
        <Button
          variant="glass"
          label="View alerts"
          icon={<BellIcon size={20} color={t.colors.ink} strokeWidth={1.75} />}
          onPress={() => router.push('/alerts' as Href)}
          style={styles.btn}
        />
        <Button
          variant="glass"
          label="View policy"
          icon={<FileTextIcon size={20} color={t.colors.ink} strokeWidth={1.75} />}
          onPress={() => router.push('/(app)/policy' as Href)}
          style={styles.btn}
        />
      </View>
    </View>
  );
}
