import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { Button } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, typography } from '../../theme/tokens';

const ASSET_ICON = require('../../../assets/icons/asset-icon.png') as ImageSourcePropType;
const REPORT_THEFT_ICON = require('../../../assets/icons/report-theft-icon.png') as ImageSourcePropType;

function IconActionButton({
  icon,
  label,
  variant,
  onPress,
  style,
  styles,
}: {
  icon: ImageSourcePropType;
  label: string;
  variant: 'primary' | 'secondary';
  onPress: () => void;
  style?: object;
  styles: ReturnType<typeof useQuickActionStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconBtn,
        variant === 'primary' ? styles.iconBtnPrimary : styles.iconBtnSecondary,
        pressed ? styles.iconBtnPressed : undefined,
        style,
      ]}
    >
      <Image
        source={icon}
        style={styles.btnIcon}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={[
          styles.btnLabel,
          variant === 'primary' ? styles.btnLabelPrimary : styles.btnLabelSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function useQuickActionStyles() {
  const colors = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
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
        iconBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: minTouchTarget,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.full,
        },
        iconBtnPrimary: {
          backgroundColor: colors.primary,
        },
        iconBtnSecondary: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
        },
        iconBtnPressed: {
          opacity: 0.85,
        },
        btnIcon: {
          width: 20,
          height: 20,
        },
        btnLabel: {
          fontSize: typography.sizes.sm,
          fontWeight: '600',
          flexShrink: 1,
        },
        btnLabelPrimary: {
          color: colors.textInverse,
        },
        btnLabelSecondary: {
          color: colors.primary,
        },
      }),
    [colors],
  );
}

export function QuickActionBar() {
  const router = useRouter();
  const styles = useQuickActionStyles();
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
        <IconActionButton
          icon={ASSET_ICON}
          label="Add asset"
          variant="secondary"
          onPress={() => router.push('/assets/register' as Href)}
          style={styles.btn}
          styles={styles}
        />
        <IconActionButton
          icon={REPORT_THEFT_ICON}
          label={hasIncidentManagement ? 'Report lost/stolen' : 'Upgrade for theft reporting'}
          variant="primary"
          onPress={handleReportTheft}
          style={styles.btn}
          styles={styles}
        />
      </View>
      <View style={styles.row}>
        <Button
          variant="secondary"
          onPress={() => router.push('/alerts' as Href)}
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
